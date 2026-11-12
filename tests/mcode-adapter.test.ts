// Failure mode: a launchd/systemd worker has a bare PATH, while MCode is installed in the user's default directory;
// the adapter must still find the real executable instead of turning every dispatched card into a missing-agent error.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import mcode, { DEFAULT_MODEL } from "../plugins/mcode/agent.ts";

const turn = {
  prompt: "做这件事",
  session: "new",
  resume: null,
  cwd: "/work",
  access: "edit" as const,
  contextFile: "/ctx",
  folder: "/run",
};

test("MCode falls back to the user's default install directory when PATH is bare", () => {
  const scratch = mkdtempSync(join(tmpdir(), "agent-autoloop-mcode-path-"));
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

test("MCode resumes with the supplied session", () => {
  const argv = mcode.command({ ...turn, resume: "old", model: "x", effort: "high", access: "full" });
  assert.ok(argv.includes("--session") && argv.includes("old"));
  assert.ok(argv.includes("--model") && argv.includes("x"));
  assert.ok(argv.includes("--effort") && argv.includes("high"));
  assert.ok(argv.includes("--permission") && argv.includes("full"));
});
