// Launch allowlist only: CLI permissions do not constitute an OS or command sandbox.
import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Adapter, Turn } from "../../worker/agents.ts";
import mcode, { DEFAULT_MODEL } from "../mcode/agent.ts";

const CWD = "/Users/x/projects/ipsg-supervisor";
const PROGRAM = join(homedir(), ".minimax-code", "bin", "mcode");

type LaunchTurn = Turn & { promptMode?: string; outputFormat?: string };

function reject(field: string): never {
  throw new Error(`IPSG read 策略拒绝：${field} 不符合启动白名单`);
}

export default {
  ...mcode,
  command(turn: LaunchTurn) {
    if (turn.access !== "read") reject("access");
    if (turn.program !== undefined) reject("program");
    if (turn.cwd !== CWD) reject("cwd");
    // Check the entire path, including parent symlinks; missing or dangling paths fail closed.
    try {
      if (fs.realpathSync(turn.cwd) !== CWD) reject("cwd realpath");
    } catch {
      reject("cwd realpath");
    }
    if (turn.model !== undefined && turn.model !== DEFAULT_MODEL) reject("model");
    if (turn.promptMode !== undefined && turn.promptMode !== "coding") reject("prompt-mode");
    if (turn.outputFormat !== undefined && turn.outputFormat !== "stream-json") reject("output-format");
    return mcode.command({ ...turn, cwd: CWD, model: DEFAULT_MODEL, access: "read", program: PROGRAM });
  },
  check(program) {
    if (program !== undefined) return "IPSG read 策略拒绝：program 必须省略";
    return mcode.check(PROGRAM);
  },
} satisfies Adapter;
