// MiniMax Code headless adapter. The default model is the user's configured GLM-5.3 endpoint.
// [INPUT]: Worker turn parameters and MCode stream-json execution events.
// [OUTPUT]: Launch arguments and a reading whose terminal state comes only from exec.completed.
// [POS]: General MCode adapter; the IPSG entry point reuses its launch policy and stream parser.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../host/command.ts";
import { findProgram, tail, type Adapter, type Turn } from "../../worker/agents.ts";

export const DEFAULT_MODEL = "custom_provider:glm/glm-5.3";
const PERMISSIONS = { read: "off", edit: "smart", full: "full" } as const;

/** The scope IPSG's read-only judging runs in. A read-only turn in it is held to a launch allowlist. */
export const IPSG_READ_CWD = "/Users/x/projects/ipsg-supervisor";
const PROMPT_MODE = "coding";
const OUTPUT_FORMAT = "stream-json";

/** The program's own place, named in full: a read-only turn in the IPSG scope may not take it from PATH. */
export function installedProgram() {
  return join(homedir(), ".minimax-code", "bin", process.platform === "win32" ? "mcode.exe" : "mcode");
}

function defaultMcodePaths() {
  return [installedProgram()];
}

function mcodeProgram(program?: string) {
  return program ?? findProgram("mcode", defaultMcodePaths);
}

/** The launch parameters a read-only turn in the IPSG scope may not choose for itself. */
type MCodeTurn = Turn & { promptMode?: string; outputFormat?: string };

/**
 * Whether this turn is held to the IPSG read allowlist. The scope decides, not the agent's name: names are
 * display text that rules change, while the directory is what the turn can reach.
 */
export function isIpsgRead(turn: Turn) {
  return turn.access === "read" && turn.cwd === IPSG_READ_CWD;
}

/** Says why a launch was refused, in words the owner can act on. */
function refuse(field: string, wanted: string, got: unknown): never {
  throw new Error(`IPSG read 策略拒绝：${field} 必须是 ${wanted}（收到 ${String(got)}）`);
}

/**
 * The read-only launch allowlist for the IPSG scope, checked before any process is started. A turn that fails it
 * never runs: the check happens while building the command line, before the worker spawns anything.
 */
export function checkIpsgRead(turn: MCodeTurn) {
  // The canonical spelling alone does not prevent the directory being replaced by a symlink.
  let canonical: string;
  try {
    canonical = fs.realpathSync(turn.cwd);
  } catch {
    refuse("cwd", IPSG_READ_CWD, turn.cwd);
  }
  if (canonical !== IPSG_READ_CWD) refuse("cwd", IPSG_READ_CWD, turn.cwd);
  if (turn.program !== undefined) refuse("program", "省略", turn.program);
  if ((turn.model ?? DEFAULT_MODEL) !== DEFAULT_MODEL) refuse("model", DEFAULT_MODEL, turn.model);
  if (turn.promptMode !== undefined && turn.promptMode !== PROMPT_MODE)
    refuse("prompt-mode", PROMPT_MODE, turn.promptMode);
  if (turn.outputFormat !== undefined && turn.outputFormat !== OUTPUT_FORMAT)
    refuse("output-format", OUTPUT_FORMAT, turn.outputFormat);
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
  command: (turn: MCodeTurn) => {
    // The IPSG read scope is held to its allowlist, and to the program named in full rather than one taken from PATH.
    if (isIpsgRead(turn)) {
      checkIpsgRead(turn);
      return [
        installedProgram(),
        "exec",
        "--cwd",
        IPSG_READ_CWD,
        "--prompt-mode",
        PROMPT_MODE,
        "--output-format",
        OUTPUT_FORMAT,
        "--permission",
        "off",
        "--model",
        DEFAULT_MODEL,
        ...(turn.effort ? ["--effort", turn.effort] : []),
        ...(turn.resume ? ["--session", turn.resume] : []),
        turn.prompt,
      ];
    }
    return [
      mcodeProgram(turn.program),
      "exec",
      "--cwd",
      turn.cwd,
      "--prompt-mode",
      PROMPT_MODE,
      "--output-format",
      OUTPUT_FORMAT,
      "--permission",
      PERMISSIONS[turn.access],
      "--model",
      turn.model ?? DEFAULT_MODEL,
      ...(turn.effort ? ["--effort", turn.effort] : []),
      ...(turn.resume ? ["--session", turn.resume] : []),
      turn.prompt,
    ];
  },
  read(stdout, code, stderr) {
    const seen: any = {};
    let terminal = false;
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
      const usage = usageOf(event);
      // MCode reports this run's usage, unlike Codex/Claude's cumulative session totals.
      if (usage) seen.usage = usage;
      // Item and turn events are progress. Marking them finished makes the worker kill a live exec after its grace.
      if (type === "exec.completed") {
        terminal = true;
        seen.finished = true;
        const result = event.result;
        const status = result?.status ?? event.status;
        const text = textOf(result?.output ?? event.output);
        // Older MCode streams omit status but include the actual final output. Never fall back to progress text.
        if (status !== undefined && status !== "succeeded") {
          seen.error = `mcode 终态 ${status}：${result?.error?.message ?? "未成功完成"}`;
        } else if (seen.error === undefined && text?.trim()) {
          seen.text = text;
        } else {
          seen.error ??= "mcode 没有完成并留下实际结果";
        }
      }
      if (type === "turn.failed" || type === "exec.failed" || type === "error") {
        seen.error = `mcode ${event.status ?? "failed"}：${event.error?.message ?? event.message ?? "执行未完成"}`;
      }
    }
    if (!terminal && code !== null && !seen.error) seen.error = tail(stderr) || "mcode 没有完成并留下实际结果";
    if (code !== null && code !== 0 && !seen.error) seen.error = tail(stderr) || `mcode 退出码 ${code}`;
    if (seen.error) delete seen.text;
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
