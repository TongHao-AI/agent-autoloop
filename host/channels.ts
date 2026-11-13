// A channel is a program that comes to the hub for cards and makes a chat app match them: `plugins/<use>/channel.ts`,
// in this install's folder first, then the ones that ship. A channel in another language needs only the protocol.
import type { Hub } from "../protocol/client.ts";
import { loadPlugin } from "./plugins.ts";

export type Card = {
  id: number;
  version: number;
  ref: string | null;
  kind: "ask" | "notice";
  state: "open" | "decided" | "done" | "closed";
  title: string;
  text: string;
  options: string[];
  recommend: number | null;
  choice: number | null;
  answer: string | null;
  result: string | null;
  link: string | null;
  /** Rule name that produced the card, when the hub has one. */
  rule?: string;
  /** How urgent the head of the card should look: blue / green / orange / red / grey. */
  tone?: string | null;
  /**
   * A card that another system built itself, kept as it is. It carries actions of its own
   * (the buttons of a business card, say), so the channel sends it unchanged instead of
   * rendering one of its own. A click on it is not this hub's to answer: the channel
   * hands it to whoever owns it.
   */
  raw?: string | null;
};
export type ChannelContext = {
  hub: Pick<Hub, "nextCard" | "delivered" | "failed" | "answer">;
  options: Record<string, unknown>;
  log: (line: string) => void;
  signal: AbortSignal;
};

export async function loadChannel(use: string) {
  return (await loadPlugin(use, "channel")) as (context: ChannelContext) => Promise<void>;
}
