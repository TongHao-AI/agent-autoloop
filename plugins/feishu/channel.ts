// Feishu (Lark), through the official lark-cli: it holds the app's credentials and the long connection that brings
// clicks back, so this machine needs no public address. Only one listener can hold an app's card clicks, so run this in
// one place.
//   "channels": { "feishu": { "key": "…", "user": "ou_xxx" } } in config.json
//   "channels": { "feishu": { "name": "飞书", "answerers": ["ou_xxx"] } } in rules.json: who may answer.
import { execFile, spawn } from "node:child_process";
import readline from "node:readline";
import type { Card, ChannelContext } from "../../host/channels.ts";

function outcomeOf(card: Card) {
  const chosen = card.choice === null ? card.answer : card.options[card.choice];
  if (card.state === "decided") return `你选了「${chosen}」，已记录，等待处理。`;
  if (card.state === "done") return `你选了「${chosen}」。${card.result ? `已执行：${card.result}` : "已执行。"}`;
  if (card.state === "closed" && card.kind === "ask") return `不用决定了：${card.result ?? ""}`;
  return card.state === "closed" && card.result ? card.result : null;
}

/** One card, as it looks now: the options while it's open, what became of it after. */
export function render(card: Card) {
  // A card another system built itself is sent as it is: its own buttons carry its own actions,
  // which this hub must not answer but hand over.
  if (card.raw) {
    try {
      return JSON.parse(card.raw) as Record<string, unknown>;
    } catch {
      // A broken card falls through to the hub's own shape rather than failing the send.
    }
  }
  const outcome = outcomeOf(card);
  // Each option is a block across the card, its words wrapping: buttons in a row, one line high, cut long options off.
  const option = (label: string, index: number) => ({
    tag: "interactive_container",
    width: "fill",
    has_border: true,
    border_color: index === card.recommend ? "blue" : "grey",
    corner_radius: "8px",
    padding: "8px 12px 8px 12px",
    behaviors: [{ type: "callback", value: { card: card.id, choice: index } }],
    elements: [{ tag: "div", text: { tag: "plain_text", content: label } }],
  });
  const afterwards = outcome ? [{ tag: "markdown", content: `**${outcome}**` }] : [];
  // A notice from outside may say how urgent it is: the head colour carries that, so an outside
  // system's alerts read the same as the hub's own.
  const TONES: Record<string, string> = {
    blue: "blue",
    green: "green",
    orange: "orange",
    red: "red",
    grey: "grey",
  };
  const tone = card.tone ? TONES[String(card.tone)] : undefined;
  return {
    schema: "2.0",
    config: { update_multi: true, enable_forward: false },
    header: {
      title: { tag: "plain_text", content: card.title },
      template: tone ?? (card.state === "open" ? "blue" : card.state === "closed" ? "grey" : "green"),
    },
    body: {
      elements: [
        ...(card.text ? [{ tag: "markdown", content: card.text }] : []),
        ...(card.state === "open" ? card.options.map(option) : afterwards),
      ],
    },
  };
}

export default async function feishu({ hub, options, log, signal }: ChannelContext) {
  const program = (options.lark as string | undefined) ?? "lark-cli";
  const lark = async (args: string[], input: string) => {
    const printed = await new Promise<string>((resolve, reject) => {
      const child = execFile(program, args, { encoding: "utf8", timeout: 60_000, signal }, (error, stdout) =>
        error ? reject(error) : resolve(stdout),
      );
      child.stdin!.on("error", reject);
      child.stdin!.end(input);
    });
    const out = JSON.parse(printed);
    if (out.ok === false || out.error) {
      throw new Error(`lark-cli ${args.slice(0, 3).join(" ")}: ${JSON.stringify(out.error ?? out).slice(0, 300)}`);
    }
    return out;
  };
  const owner = (options.user as string | undefined) ?? (await lark(["auth", "status"], "")).identities?.user?.openId;
  if (!owner) throw new Error("飞书通道要在 config.json 写 user，或者先 lark-cli auth login");

  const updateMessage = (ref: string, content: string) =>
    lark(["im", "messages", "patch", "--message-id", ref, "--as", "bot", "--data", "-"], JSON.stringify({ content }));

  async function sendMessage(cardId: number, content: string) {
    const target = ["--user-id", owner, "--as", "bot", "--msg-type", "interactive"];
    // The key is the card alone, not its version: a report that got lost must not make a second message.
    const once = ["--idempotency-key", `agent-autoloop-card-${cardId}`];
    return (await lark(["im", "+messages-send", ...target, ...once, "--content", "-"], content)).data
      .message_id as string;
  }

  async function deliver() {
    while (!signal.aborted) {
      let card: Card | null;
      try {
        ({ card } = await hub.nextCard(50));
      } catch (error) {
        log(`couldn't reach the hub: ${error}`);
        await new Promise((resolve) => setTimeout(resolve, 10_000));
        continue;
      }
      if (!card) continue;
      try {
        const content = JSON.stringify(render(card));
        let ref = card.ref;
        if (ref) await updateMessage(ref, content);
        else ref = await sendMessage(card.id, content);
        await hub.delivered(card.id, card.version, ref);
      } catch (error) {
        log(`card ${card.id} not sent: ${error}`);
        await hub.failed(card.id, card.version, String(error)).catch(() => {});
      }
    }
  }

  /** Only the owner's click on the card that was sent counts; the hub checks both. */
  async function clicked(line: string) {
    const event = JSON.parse(line);
    const value = JSON.parse(event.action_value);
    // ★ A card that isn't this hub's (no card number in its value) belongs to another system
    //   that now sends through this same Feishu app — IPSG's own cards, with their own
    //   actions (enqueue_bind, bind_direct, tri_decide…). Their clicks are not ours to answer;
    //   hand them to whoever owns that logic.
    if (!Number.isInteger(value.card) || !Number.isInteger(value.choice)) {
      await forward(value, event);
      return;
    }
    const answer = await hub.answer(value.card, { choice: value.choice, by: event.operator_id, ref: event.message_id });
    log(`card ${value.card}: answered by ${event.operator_id}, ${answer.changed ? "counted" : "already settled"}`);
  }

  /** Hands a click on someone else's card to the system that owns it. */
  async function forward(value: unknown, event: Record<string, unknown>) {
    const target = typeof options.forward === "string" ? options.forward : "";
    if (!target) {
      log(`click on a foreign card was not handled (no forward target): ${JSON.stringify(value).slice(0, 120)}`);
      return;
    }
    const body = JSON.stringify({ value, operator: event.operator ?? null, message_id: event.message_id ?? null });
    const response = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
    log(`forwarded a foreign card's click to ${target}: ${response.status}`);
  }

  async function listen() {
    while (!signal.aborted) {
      // stdin stays open: lark-cli ends an unbounded consume when its stdin closes.
      const consume = spawn(program, ["event", "consume", "card.action.trigger", "--as", "bot"], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const stop = () => consume.kill();
      signal.addEventListener("abort", stop);
      readline.createInterface({ input: consume.stderr }).on("line", (line) => log(line));
      readline
        .createInterface({ input: consume.stdout })
        .on("line", (line) => void clicked(line).catch((error) => log(`click not handled: ${error}`)));
      await new Promise((resolve) => consume.on("close", resolve));
      signal.removeEventListener("abort", stop);
      if (!signal.aborted) {
        log("the click listener stopped; starting it again in 10 seconds");
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
    }
  }

  await Promise.all([deliver(), listen()]);
}
