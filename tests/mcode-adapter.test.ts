// Failure mode: a launchd/systemd worker has a bare PATH, while MCode is installed in the user's default directory;
// the adapter must still find the real executable instead of turning every dispatched card into a missing-agent error.
// A read-only turn in the IPSG scope is held to a launch allowlist: its rules may not choose the program, the model or
// the output format for themselves, and a turn that breaks the allowlist must start no process at all.
// [INPUT]: MCode adapter and captured stream event shapes.
// [OUTPUT]: Regression coverage for launch policy and whole-execution completion.
// [POS]: Adapter contract tests; no real model or production state is used.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import mcode, { DEFAULT_MODEL, IPSG_READ_CWD, installedProgram } from "../plugins/mcode/agent.ts";

beforeEach((t) => {
  assert.ok("mock" in t);
  const realpath = fs.realpathSync;
  t.mock.method(fs, "realpathSync", (path: fs.PathLike) => (path === IPSG_READ_CWD ? IPSG_READ_CWD : realpath(path)));
});

const turn = {
  prompt: "做这件事",
  session: "new",
  resume: null,
  cwd: "/work",
  access: "edit" as const,
  contextFile: "/ctx",
  folder: "/run",
};

/** A read-only turn in the IPSG scope: the one the allowlist holds. */
const ipsgTurn = {
  ...turn,
  cwd: IPSG_READ_CWD,
  access: "read" as const,
};

test("MCode falls back to the user's default install directory when PATH is bare", (t) => {
  const scratch = mkdtempSync(join(import.meta.dirname, ".mcode-path-"));
  chmodSync(scratch, 0o700);
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const fake = join(scratch, ".minimax-code", "bin", "mcode");
  mkdirSync(join(scratch, ".minimax-code", "bin"), { recursive: true });
  writeFileSync(fake, "#!/bin/sh\nprintf 'fake mcode\\n'\n", { mode: 0o755 });
  chmodSync(fake, 0o755);
  const source =
    `import mcode from ${JSON.stringify(new URL("../plugins/mcode/agent.ts", import.meta.url).pathname)};\n` +
    `const turn = ${JSON.stringify(turn)};\n` +
    `process.stdout.write(mcode.command(turn)[0]);`;
  const found = execFileSync(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", "--input-type=module", "-e", source],
    {
      env: { ...process.env, HOME: scratch, PATH: "/usr/bin:/bin", SHELL: "/bin/sh" },
      encoding: "utf8",
    },
  );
  rmSync(scratch, { recursive: true, force: true });
  assert.equal(found, fake);
});

test("MCode uses coding headless mode and GLM-5.3 by default", () => {
  const argv = mcode.command(turn);
  assert.deepEqual(argv.slice(1, 8), [
    "exec",
    "--cwd",
    "/work",
    "--prompt-mode",
    "coding",
    "--output-format",
    "stream-json",
  ]);
  assert.ok(argv.includes("--model") && argv.includes(DEFAULT_MODEL));
  assert.ok(argv.includes("--permission") && argv.includes("smart"));
  assert.ok(argv.includes("做这件事"));
});

test("MCode reads a completed stream and preserves session and usage", () => {
  const stream = [
    { type: "session.started", sessionId: "s1" },
    { type: "turn.started", sessionId: "s1" },
    {
      type: "turn.completed",
      sessionId: "s1",
      usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3 },
    },
    { type: "exec.completed", sessionId: "s1", result: { output: "好了" } },
  ]
    .map((event) => JSON.stringify(event))
    .join("\n");
  assert.deepEqual(mcode.read(stream, 0, ""), {
    session: "s1",
    started: true,
    text: "好了",
    usage: { input: 10, output: 2, cached: 3 },
    finished: true,
  });
});

test("MCode progress and turn completion cannot end a still-running exec", () => {
  const events = [
    { type: "session.started", sessionId: "s1" },
    { type: "item.completed", item: { type: "agent_message", content: "先读证据，再给结论" } },
    { type: "turn.completed", output: "这一回合完成", usage: { inputTokens: 3 } },
  ];
  for (let n = 1; n <= events.length; n++) {
    const reading = mcode.read(
      events
        .slice(0, n)
        .map((event) => JSON.stringify(event))
        .join("\n"),
      null,
      "",
    );
    assert.equal(reading.finished, undefined);
    assert.equal(reading.text, undefined);
    assert.equal(reading.error, undefined);
  }
});

test("MCode cancelled exec must not turn its last progress message into success", () => {
  for (const status of ["cancelled", "failed", "timeout", "limit_exceeded"]) {
    const stream = [
      { type: "item.completed", item: { type: "agent_message", content: "先定位问题" } },
      { type: "turn.failed", status },
      { type: "exec.completed", result: { status, usage: { inputTokens: 2 } } },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    for (const code of [null, 0, 130]) {
      const reading = mcode.read(stream, code, "");
      assert.match(reading.error!, new RegExp(status));
      assert.equal(reading.text, undefined);
    }
  }
});

test("MCode success requires final output and a successful terminal status", () => {
  const progress = JSON.stringify({ type: "item.completed", item: { type: "agent_message", content: "正在检查" } });
  const terminal = (result: unknown) => `${progress}\n${JSON.stringify({ type: "exec.completed", result })}`;
  assert.ok(mcode.read(terminal({ status: "succeeded" }), 0, "").error);
  assert.ok(mcode.read(progress, 0, "").error);
  assert.ok(mcode.read(terminal({ status: "unknown", output: "好了" }), 0, "").error);
  assert.ok(mcode.read(terminal({ status: "succeeded", output: "好了" }), 1, "失败").error);
  const success = mcode.read(terminal({ status: "succeeded", output: "结论：已核对" }), 0, "");
  assert.equal(success.text, "结论：已核对");
  assert.equal(success.finished, true);
  assert.equal(success.error, undefined);
});

test("MCode resumes with the supplied session", () => {
  const argv = mcode.command({ ...turn, resume: "old", model: "x", effort: "high", access: "full" });
  assert.ok(argv.includes("--session") && argv.includes("old"));
  assert.ok(argv.includes("--model") && argv.includes("x"));
  assert.ok(argv.includes("--effort") && argv.includes("high"));
  assert.ok(argv.includes("--permission") && argv.includes("full"));
});

test("a read-only turn in the IPSG scope starts the allowlisted program with no permission to write", () => {
  const argv = mcode.command(ipsgTurn);
  assert.equal(argv[0], installedProgram());
  assert.deepEqual(argv.slice(1, 12), [
    "exec",
    "--cwd",
    IPSG_READ_CWD,
    "--prompt-mode",
    "coding",
    "--output-format",
    "stream-json",
    "--permission",
    "off",
    "--model",
    DEFAULT_MODEL,
  ]);
});

test("a read-only turn in the IPSG scope may not choose its own program, model or output format", () => {
  for (const [field, override] of [
    ["program", { program: "/bin/echo" }],
    ["model", { model: "some-other-model" }],
    ["prompt-mode", { promptMode: "interactive" }],
    ["output-format", { outputFormat: "json" }],
  ] as const) {
    assert.throws(
      () => mcode.command({ ...ipsgTurn, ...override } as never),
      new RegExp(`IPSG read 策略拒绝.*${field}`),
      `${field} 这个覆盖必须被拒绝`,
    );
  }
});

test("a turn refused by the IPSG allowlist starts no process at all", (t) => {
  const scratch = mkdtempSync(join(import.meta.dirname, ".mcode-policy-"));
  chmodSync(scratch, 0o700);
  t.after(() => rmSync(scratch, { recursive: true, force: true }));
  const program = join(scratch, "mcode-wrapper");
  const marker = join(scratch, "started");
  writeFileSync(program, `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
  chmodSync(program, 0o755);
  assert.throws(() => mcode.command({ ...ipsgTurn, program } as never), /IPSG read 策略拒绝/);
  assert.equal(existsSync(marker), false, "被拒绝的一轮不能启动任何进程");
});

test("the IPSG allowlist holds only read-only turns in its scope", () => {
  // Another scope, or a turn allowed to write, keeps the general adapter's own choices.
  for (const over of [
    { cwd: "/work", access: "read" as const },
    { cwd: IPSG_READ_CWD, access: "edit" as const },
    { cwd: IPSG_READ_CWD, access: "full" as const },
  ]) {
    const argv = mcode.command({ ...turn, ...over });
    assert.equal(argv[0], installedProgram());
    assert.ok(argv.includes("--cwd") && argv.includes(over.cwd));
  }
  const overridden = mcode.command({ ...turn, cwd: "/work", access: "read", program: "/bin/echo" });
  assert.equal(overridden[0], "/bin/echo");
});
