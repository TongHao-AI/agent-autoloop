// A round that waits for the owner holds its thread: what comes in meanwhile waits with it, and the answer carries those
// events into the continuation. Failure cases: a new event on a waiting thread books a new round and runs beside the
// question; the continuation doesn't carry what arrived while waiting; another thread is held up by it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { at, setup } from "./helpers.ts";

setup("thread");
const { ingest } = await import("./hub.ts");
const { claimNext, finish, answer } = await import("./hub.ts");
const { all, one, run } = await import("./storage.ts");

const note = (n: number, step = "new") => ({ id: `feedback:${n}:${step}`, type: `feedback.${step}`, subject: `#${n}` });
const clean = () => {
  for (const table of ["run_events", "runs", "events", "seen", "cards", "deliveries", "timers"])
    run(`DELETE FROM ${table}`);
};
const claim = (worker: string, now: number) => claimNext(worker, `c${Math.random()}`, now);
const state = (id: number) => one<{ state: string }>("SELECT state FROM runs WHERE id = ?", [id])!.state;
const rounds = () =>
  all<{ id: number; rule: string; lane: string; state: string }>("SELECT id, rule, lane, state FROM runs ORDER BY id");

test("a round waiting for the owner holds its thread, and the answer carries what came in", () => {
  clean();
  ingest("app", note(1), at(0));
  const job = claim("w1", at(0))!;
  finish(
    job.run,
    job.token,
    { outcome: "blocked", summary: "要你登录", ask: [{ title: "登录", text: "请登录", options: ["好", "不用"] }] },
    at(1),
  );
  assert.equal(state(job.run), "blocked");
  // Another event on the same thing arrives while the round waits for the owner.
  ingest("app", note(1, "more"), at(2));
  assert.equal(rounds().length, 1, "the thread is held: no new round is booked");
  const card = one<{ id: number }>("SELECT id FROM cards WHERE run_id = ?", [job.run])!.id;
  answer(card, { choice: 0, by: "me" }, at(3));
  const next = claim("w1", at(3))!;
  assert.ok(next, "the answer starts the round again");
  assert.deepEqual(
    next.context.events.map((event) => event.id).sort(),
    // The answer and what came in while it waited; what it was waiting for is in the session and in the card's about.
    [`card:${card}`, "feedback:1:more"].sort(),
  );
});

test("another thread keeps working while one waits", () => {
  clean();
  ingest("app", note(1), at(0));
  const job = claim("w1", at(0))!;
  finish(
    job.run,
    job.token,
    { outcome: "blocked", summary: "要你登录", ask: [{ title: "登录", text: "请登录", options: ["好", "不用"] }] },
    at(1),
  );
  ingest("app", note(2), at(2));
  assert.equal(rounds().length, 2, "another thing gets its own round");
  const other = claim("w1", at(2));
  assert.ok(other, "and it runs");
  assert.equal(one<{ lane: string }>("SELECT lane FROM runs WHERE id = ?", [other!.run])!.lane, "#2");
});
