// [INPUT]: Launch parameters from either discovered MCode entry point.
// [OUTPUT]: IPSG read scope selection, startup refusals and allowlisted commands.
// [POS]: Single owner of domain startup policy; does not interpret business results.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import fs from "node:fs";
import { resolve } from "node:path";
import type { Turn } from "../../worker/agents.ts";
import mcode, { DEFAULT_MODEL, installedProgram, OUTPUT_FORMAT, PROMPT_MODE, type MCodeTurn } from "../mcode/core.ts";

export const IPSG_READ_CWD = "/Users/x/projects/ipsg-supervisor";

class IpsgLaunchError extends Error {
  readonly field: string;
  readonly wanted: string;
  readonly received: unknown;

  constructor(field: string, wanted: string, received: unknown) {
    super(`IPSG read 策略拒绝：${field} 必须是 ${wanted}（收到 ${String(received)}）`);
    this.field = field;
    this.wanted = wanted;
    this.received = received;
  }
}

export function isIpsgRead(turn: Turn) {
  if (turn.access !== "read") return false;
  // Route aliases to the policy too; canonical spelling is enforced there before launch.
  if (resolve(turn.cwd) === IPSG_READ_CWD) return true;
  try {
    const actual = fs.realpathSync(turn.cwd);
    return actual === IPSG_READ_CWD || actual === fs.realpathSync(IPSG_READ_CWD);
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}

export function checkIpsgRead(turn: MCodeTurn) {
  if (turn.access !== "read") throw new IpsgLaunchError("access", "read", turn.access);
  if (turn.cwd !== IPSG_READ_CWD) throw new IpsgLaunchError("cwd", IPSG_READ_CWD, turn.cwd);
  let canonical: string;
  try {
    canonical = fs.realpathSync(turn.cwd);
  } catch (error) {
    if (error instanceof Error) throw new IpsgLaunchError("cwd", IPSG_READ_CWD, turn.cwd);
    throw error;
  }
  if (canonical !== IPSG_READ_CWD) throw new IpsgLaunchError("cwd", IPSG_READ_CWD, turn.cwd);
  if (turn.program !== undefined) throw new IpsgLaunchError("program", "省略", turn.program);
  if ((turn.model ?? DEFAULT_MODEL) !== DEFAULT_MODEL) throw new IpsgLaunchError("model", DEFAULT_MODEL, turn.model);
  if (turn.promptMode !== undefined && turn.promptMode !== PROMPT_MODE)
    throw new IpsgLaunchError("prompt-mode", PROMPT_MODE, turn.promptMode);
  if (turn.outputFormat !== undefined && turn.outputFormat !== OUTPUT_FORMAT)
    throw new IpsgLaunchError("output-format", OUTPUT_FORMAT, turn.outputFormat);
}

export function ipsgReadCommand(turn: MCodeTurn) {
  checkIpsgRead(turn);
  return mcode.command({ ...turn, program: installedProgram(), model: DEFAULT_MODEL });
}

export function checkIpsgProgram(program?: string) {
  if (program !== undefined) return "IPSG read 策略拒绝：program 必须省略";
  return mcode.check(installedProgram());
}
