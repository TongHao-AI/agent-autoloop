// MiniMax Code headless adapter. The default model is the user's configured GLM-5.3 endpoint.
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../host/command.ts";
import { findProgram, tail, type Adapter } from "../../worker/agents.ts";

export const DEFAULT_MODEL = "custom_provider:glm/glm-5.3";
const PERMISSIONS = { read: "off", edit: "smart", full: "full" } as const;

function defaultMcodePaths() {
  return [join(homedir(), ".minimax-code", "bin", process.platform === "win32" ? "mcode.exe" : "mcode")];
}

function mcodeProgram(program?: string) {
  return program ?? findProgram("mcode", defaultMcodePaths);
}

const textOf = (value: any): string | undefined => {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join("") || undefined;
  if (!value || typeof value !== "object") return undefined;
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  return textOf(value.message) ?? textOf(value.output) ?? textOf(value.result) ?? textOf(value.content);
};

function usageOf(value: any) {
  const usage = value?.usage ?? value?.result?.usage;
  if (!usage) return undefined;
  const input = usage.input_tokens ?? usage.inputTokens ?? usage.input ?? 0;
  const output = usage.output_tokens ?? usage.outputTokens ?? usage.output ?? 0;
  const cached =
    usage.cache_read_input_tokens ?? usage.cacheReadTokens ?? usage.cached_input_tokens ?? usage.cached ?? 0;
  return { input, output, cached };
}

export default {
  command: (turn) => [
    mcodeProgram(turn.program),
    "exec",
    "--cwd",
    turn.cwd,
    "--prompt-mode",
    "coding",
    "--output-format",
    "stream-json",
    "--permission",
    PERMISSIONS[turn.access],
    "--model",
    turn.model ?? DEFAULT_MODEL,
    ...(turn.effort ? ["--effort", turn.effort] : []),
    ...(turn.resume ? ["--session", turn.resume] : []),
    turn.prompt,
  ],
  read(stdout, code, stderr) {
    const seen: any = {};
    let completed = false;
    for (const line of stdout.split("\n")) {
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!event || typeof event !== "object") continue;
      const session = event.session_id ?? event.sessionId ?? event.session ?? event.thread_id;
      if (session) seen.session = session;
      const type = String(event.type ?? event.event ?? "");
      if (/session|turn\.started|message_start|assistant|tool/i.test(type)) seen.started = true;
      const text = textOf(
        event.text ??
          event.last_message ??
          event.final ??
          event.output ??
          event.result ??
          (event.item?.type === "agent_message" ? event.item : undefined),
      );
      if (text) seen.text = text;
      const usage = usageOf(event);
      // MCode reports this run's usage, unlike Codex/Claude's cumulative session totals.
      if (usage) seen.usage = usage;
      if (/turn\.completed|result|done|final|completed/i.test(type) && (text || event.result || event.final)) {
        completed = true;
        seen.finished = true;
      }
      if (/error|failed/i.test(type)) seen.error = text ?? event.error?.message ?? event.message;
    }
    if (completed && !seen.text?.trim()) seen.error = seen.error ?? "mcode 没有完成并留下实际结果";
    if (!completed && code !== null && !seen.error) seen.error = tail(stderr) || "mcode 没有完成并留下实际结果";
    if (!completed) delete seen.text;
    if (code !== null && code !== 0 && !seen.error) seen.error = tail(stderr) || `mcode 退出码 ${code}`;
    return seen;
  },
  link: (session) => `mcode://session/${session}`,
  check(program) {
    try {
      execFileSync(...commandLine([mcodeProgram(program), "--version"]), {
        encoding: "utf8",
        timeout: 20_000,
      });
      return null;
    } catch (error) {
      return `mcode 用不了：${(error as Error).message.split("\n")[0]}`;
    }
  },
} satisfies Adapter;
