// MiniMax Code headless adapter. The default model is the user's configured GLM-5.3 endpoint.
// [INPUT]: Worker turn parameters and MCode stream-json execution events.
// [OUTPUT]: Launch arguments and a reading whose terminal state comes only from exec.completed.
// [POS]: Shared MCode mechanics; discovered entry points apply domain policy before calling command.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../host/command.ts";
import { findProgram, tail, type Adapter, type Turn } from "../../worker/agents.ts";

export const DEFAULT_MODEL = "custom_provider:glm/glm-5.3";
const PERMISSIONS = { read: "off", edit: "smart", full: "full" } as const;

export const PROMPT_MODE = "coding";
export const OUTPUT_FORMAT = "stream-json";

/** The user's default MCode installation, independent of the worker's PATH. */
export function installedProgram() {
  return join(homedir(), ".minimax-code", "bin", process.platform === "win32" ? "mcode.exe" : "mcode");
}

function defaultMcodePaths() {
  return [installedProgram()];
}

function mcodeProgram(program?: string) {
  return program ?? findProgram("mcode", defaultMcodePaths);
}

export type MCodeTurn = Turn & { readonly promptMode?: string; readonly outputFormat?: string };

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
