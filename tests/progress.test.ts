// A round that is stuck on something only the owner can undo, and a round that stopped moving while its worker still says
// it is working. Failure cases: a first line that says "待你处理" is taken for work done; a blocked round is put back in
// the queue to be retried on its own; a blocked round's ask is dropped like a failed one's, or its resolve, later and events
// are applied as if the business were finished; a round whose progress stands still is left claimed for ever because the
// worker still mentions it; a round that is moving is called stuck; a round that never reported progress is judged by the
// old rule; a mark one worker sends is taken for another worker's round, or is too long or too odd to store; a progress
// that is not a shape is applied rather than sent back to be rewritten.
import assert from "node:assert/strict";
import { test } from "node:test";
import { at, setup } from "./helpers.ts";

setup("progress");
const { ingest } = await import("./hub.ts");
const { claimNext, heartbeat, finish, sweep } = await import("./hub.ts");
const { all, one, run } = await import("./storage.ts");

const note = (n: number, step = "new") => ({
  id: `feedback:${n}:${step}`,
  type: `feedback.${step}`,
  subject: `#${n}`,
  summary: `第 ${n} 条`,
  link: "https://x.test/feedback?id=1",
});
const clean = () => {
  for (const table of ["run_events", "runs", "events", "seen", "cards", "deliveries", "timers"])
    run(`DELETE FROM ${table}`);
};
const claim = (worker: string, now: number) => claimNext(worker, `c${Math.random()}`, now);
const state = (id: number) => one<{ state: string }>("SELECT state FROM runs WHERE id = ?", [id])!.state;
const row = (id: number) => one<Record<string, string>>("SELECT * FROM runs WHERE id = ?", [id])!;
const cards = () =>
  all<{ kind: string; state: string; title: string; text: string }>(
    "SELECT kind, state, title, text FROM cards ORDER BY id",
  );

test("a first line that waits for the owner is blocked, not done", async () => {
  const { readMessage } = await import("../worker/contract.ts");
  assert.deepEqual(readMessage("待你处理：交换机要你登录"), {
    outcome: "blocked",
    summary: "交换机要你登录",
  });
  assert.equal(readMessage("没跑成：网卡没起来").outcome, "failed");
  assert.equal(readMessage("没事可做：没有告警").outcome, "nothing");
  assert.equal(readMessage("做完了：换了块板子").outcome, "done");
});

test("progress has a shape, and one that doesn't is sent back to be rewritten", async () => {
  const { resultFrom } = await import("../worker/contract.ts");
  const ok = resultFrom(
    {
      outcome: "done",
      summary: "做完了",
      receipt: { outcome: "done", progress: { stage: "collect", done: 3, total: 7, note: "采集中" } },
    },
    {},
  );
  assert.equal(ok.problem, undefined);
  assert.deepEqual(ok.result.progress, { stage: "collect", done: 3, total: 7, note: "采集中" });
  for (const progress of [
    { done: 8, total: 7 },
    { done: -1 },
    { done: 1.5 },
    { total: 0, done: 0, stage: "x".repeat(200) },
    { note: "x".repeat(600) },
    { stage: 1 },
    { unknown: 1 },
  ]) {
    const bad = resultFrom({ outcome: "done", receipt: { outcome: "done", progress } }, {});
    assert.ok(bad.problem, `这一条该被退回：${JSON.stringify(progress)}`);
  }
});

test("a blocked round ends where it stands: it asks, it is not retried, and nothing else is settled", () => {
  clean();
  ingest("app", note(1), at(0));
  const job = claim("w1", at(0))!;
  const ack = finish(
    job.run,
    job.token,
    {
      outcome: "blocked",
      summary: "交换机要你登录",
      ask: [{ title: "登录交换机", text: "请在 93-1 上登录，我再继续。", options: ["好", "不用了"] }],
      resolve: [{ card: 999, reason: "看起来好了" }],
      later: [{ key: "再看看", at: "2026-10-18T03:00:00+08:00", about: "再核实一次" }],
      events: [{ id: "e1", type: "feedback.new", subject: "#1", summary: "接着做", detail: "", link: "", hops: 0 }],
    },
    at(1),
  );
  assert.equal(state(job.run), "blocked");
  // It asks the owner, and it does not go back in the queue.
  const asked = cards().filter((card) => card.kind === "ask");
  assert.equal(asked.length, 1);
  assert.equal(asked[0].state, "open");
  assert.equal(all("SELECT id FROM runs WHERE state = 'queued'").length, 0);
  // It settles nothing: no card closed, no review booked, no next round chained.
  assert.equal(ack.rejected.length, 3);
  assert.deepEqual(
    ack.rejected.map((item: { what?: string; card?: number }) => item.what ?? `card:${item.card}`).sort(),
    ["card:999", "events", "later"],
  );
  assert.equal(all("SELECT id FROM timers").length, 0);
  assert.equal(all("SELECT id FROM events WHERE type = 'feedback.new'").length, 1);
});

test("a failed round still asks nothing, and a blocked one still settles nothing", () => {
  clean();
  ingest("app", note(2), at(0));
  const failed = claim("w1", at(0))!;
  const ack = finish(
    failed.run,
    failed.token,
    {
      outcome: "failed",
      error: "网卡没起来",
      ask: [{ title: "换网卡", text: "要换吗？", options: ["换", "不换"] }],
    },
    at(1),
  );
  assert.equal(state(failed.run), "queued");
  assert.equal(ack.rejected.length, 1);
  assert.equal(ack.rejected[0].what, "ask");
  assert.equal(cards().filter((card) => card.kind === "ask").length, 0);
});

test("what a round reports as its progress is kept with it", () => {
  clean();
  ingest("app", note(3), at(0));
  const job = claim("w1", at(0))!;
  finish(
    job.run,
    job.token,
    { outcome: "done", summary: "做完了", progress: { stage: "collect", done: 3, total: 7 } },
    at(1),
  );
  const kept = row(job.run);
  assert.deepEqual(JSON.parse(kept.progress), { stage: "collect", done: 3, total: 7 });
  assert.ok(kept.progress_at);
});

test("a round whose progress stands still is called stuck, even while its worker says it is working", () => {
  clean();
  ingest("app", note(4), at(0));
  const job = claim("w1", at(0))!;
  heartbeat("w1", [job.run], at(1), { [job.run]: "m1" });
  // The worker keeps saying it is working, and the progress is the same as it was.
  heartbeat("w1", [job.run], at(17), { [job.run]: "m1" });
  sweep(at(17));
  assert.equal(state(job.run), "unknown");
  const told = cards().filter((card) => card.text.includes("没有进展"));
  assert.equal(told.length, 1);
});

test("a round that is moving is left alone", () => {
  clean();
  ingest("app", note(5), at(0));
  const job = claim("w1", at(0))!;
  heartbeat("w1", [job.run], at(1), { [job.run]: "m1" });
  heartbeat("w1", [job.run], at(17), { [job.run]: "m2" });
  sweep(at(17));
  assert.equal(state(job.run), "claimed");
  assert.equal(cards().filter((card) => card.text.includes("没有进展")).length, 0);
});

test("a round that never reported progress is judged by the old rule", () => {
  clean();
  ingest("app", note(6), at(0));
  const job = claim("w1", at(0))!;
  // The worker mentions it, but says nothing about how far it has got.
  heartbeat("w1", [job.run], at(17));
  sweep(at(17));
  assert.equal(state(job.run), "claimed");
  // The old rule still holds: a worker that stops mentioning the round loses it.
  heartbeat("w1", [], at(19));
  heartbeat("w1", [], at(23));
  sweep(at(23));
  assert.equal(state(job.run), "unknown");
  assert.equal(cards().filter((card) => card.text.includes("没有回音")).length, 1);
});

test("a mark is only taken for the worker's own round, and only when it is a mark", () => {
  clean();
  ingest("app", note(7), at(0));
  const job = claim("w1", at(0))!;
  heartbeat("w2", [job.run], at(1), { [job.run]: "m1" });
  assert.ok(!row(job.run).mark);
  assert.throws(() => heartbeat("w1", [job.run], at(1), { [job.run]: "x".repeat(100) }));
  assert.throws(() => heartbeat("w1", [job.run], at(1), { [job.run]: "m 1\n" }));
});
