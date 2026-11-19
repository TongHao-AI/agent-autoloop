// [INPUT]: Worker turns and MCode stream-json execution events.
// [OUTPUT]: Generic MCode behavior with mandatory policy for the IPSG read scope.
// [POS]: Discovered entry point; core owns mechanics and the domain plugin owns startup restrictions.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import type { Adapter } from "../../worker/agents.ts";
import mcode, { type MCodeTurn } from "./core.ts";
import { isIpsgRead, ipsgReadCommand } from "../mcode-ipsg/policy.ts";

export { DEFAULT_MODEL, installedProgram } from "./core.ts";
export { IPSG_READ_CWD, isIpsgRead, checkIpsgRead } from "../mcode-ipsg/policy.ts";

export default {
  ...mcode,
  command: (turn: MCodeTurn) => (isIpsgRead(turn) ? ipsgReadCommand(turn) : mcode.command(turn)),
} satisfies Adapter;
