// [INPUT]: Generic MCode mechanics and the domain startup policy.
// [OUTPUT]: A read-only IPSG adapter that rejects launch overrides before starting a process.
// [POS]: Explicit IPSG entry point; general stream parsing remains in the sibling MCode adapter.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import type { Adapter } from "../../worker/agents.ts";
import mcode from "../mcode/core.ts";
import { checkIpsgProgram, ipsgReadCommand } from "./policy.ts";

export default {
  ...mcode,
  command: ipsgReadCommand,
  check: checkIpsgProgram,
} satisfies Adapter;
