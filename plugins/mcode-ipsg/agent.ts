// The IPSG entry point: read-only judging in the IPSG scope, held to a launch allowlist. The allowlist itself lives
// in the mcode adapter, which applies it to every read-only turn in that scope, whoever started it.
// [INPUT]: MCode adapter and canonical IPSG launch scope.
// [OUTPUT]: A read-only IPSG adapter that rejects launch overrides before starting a process.
// [POS]: Explicit IPSG entry point; general stream parsing remains in the sibling MCode adapter.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, Turn } from "../../worker/agents.ts";
import mcode, { IPSG_READ_CWD } from "../mcode/agent.ts";

type LaunchTurn = Turn & { promptMode?: string; outputFormat?: string };

function refuse(field: string): never {
  throw new Error(`IPSG read 策略拒绝：${field} 不符合启动白名单`);
}

export default {
  ...mcode,
  command(turn: LaunchTurn) {
    // This entry point only starts read-only turns in the IPSG scope. Anything else is refused here rather than
    // passed to the allowlist, which would read a different scope as the one it holds.
    if (turn.access !== "read") refuse("access");
    if (turn.cwd !== IPSG_READ_CWD) refuse("cwd");
    return mcode.command(turn);
  },
  check(program) {
    if (program !== undefined) return "IPSG read 策略拒绝：program 必须省略";
    return mcode.check(join(homedir(), ".minimax-code", "bin", process.platform === "win32" ? "mcode.exe" : "mcode"));
  },
} satisfies Adapter;
