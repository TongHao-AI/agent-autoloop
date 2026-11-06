// Failing in different ways wants different patience. Failure cases: the environment failing waits as long as the
// work failing; the transient wait grows without a limit; or the kind of failure isn't accepted at all.
import assert from "node:assert/strict";
import { test } from "node:test";
import { at, setup } from "./helpers.ts";

setup("retry");
const { ingest } = await import("./hub.ts");
const { claimNext, finish } = await import("./hub.ts");
const { run } = await import("./storage.ts");

const note = (n: number) => ({ id: `feedback:${n}:new`, type: "feedback.new", subject: `#${n}` });
const clean = () => {
  for (const table of ["run_events", "runs", "events", "seen", "cards", "deliveries", "timers"])
    run(`DELETE FROM ${table}`);
};
const claim = (worker: string, now: number) => claimNext(worker, `c${Math.random()}`, now);

test("the environment failing is retried in a minute, the work failing in five", () => {
  clean();
  ingest("app", note(1), at(0));
  const job = claim("w1", at(0))!;
  finish(job.run, job.token, { outcome: "failed", failure: "transient", error: "网关超时" }, at(1));
  assert.equal(claim("w1", at(1)), null, "not yet");
  assert.ok(claim("w1", at(2)), "a minute later it runs again");

  clean();
  ingest("app", note(2), at(0));
  const other = claim("w1", at(0))!;
  finish(other.run, other.token, { outcome: "failed", error: "网卡没起来" }, at(1));
  assert.equal(claim("w1", at(2)), null, "the work failing waits longer");
  assert.ok(claim("w1", at(6)), "five minutes later it runs again");
});

test("the transient wait stops at fifteen minutes", () => {
  clean();
  ingest("app", note(3), at(0));
  let job = claim("w1", at(0))!;
  let now = at(1);
  // 1, 2, 4, 8, then no more than fifteen minutes of waiting.
  const delays = [1, 2, 4, 8, 15, 15];
  for (const [round, delay] of delays.entries()) {
    finish(job.run, job.token, { outcome: "failed", failure: "transient", error: "网关超时" }, now);
    now = now + delay * 60_000;
    assert.equal(claim("w1", now - 60_000), null, `第 ${round + 1} 次：还没到时间`);
    job = claim("w1", now)!;
    assert.ok(job, `第 ${round + 1} 次：到时间了`);
  }
});

test("a failure says which kind it is", async () => {
  const { parseResult } = await import("../protocol/validate.ts");
  assert.equal(parseResult({ outcome: "failed", failure: "transient" }).failure, "transient");
  assert.equal(parseResult({ outcome: "failed" }).failure, undefined);
  assert.throws(() => parseResult({ outcome: "failed", failure: "whatever" }), /failure/);
});
