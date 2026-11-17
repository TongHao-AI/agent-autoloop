// Failure mode: display-name heuristics leave the real rules unrestricted, and access changes bypass the guard.
// [INPUT]: Dedicated adapter with isolated rules and filesystem behavior.
// [OUTPUT]: Launch policy tests without relying on the user's production rules or directories.
// [POS]: IPSG policy regression tests; runtime rules are checked separately before deployment.
// [PROTOCOL]: Update this header on change, then check AGENTS.md
import assert from "node:assert/strict";
import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, test } from "node:test";
import { adapterFor, type Turn } from "../worker/agents.ts";
import mcode, { DEFAULT_MODEL } from "../plugins/mcode/agent.ts";

const agent = { use: "mcode-ipsg", access: "read" as const, model: undefined, program: undefined };
const scope = "/Users/x/projects/ipsg-supervisor";
const rules = { rules: [{ to: "mcode", cwd: scope }], elsewhere: [] };
beforeEach((t) => {
  assert.ok("mock" in t);
  const realpath = fs.realpathSync;
  t.mock.method(fs, "realpathSync", (path: fs.PathLike) => (path === scope ? scope : realpath(path)));
});
const base: Turn = {
  prompt: "只构造参数，不执行",
  session: "new",
  resume: null,
  cwd: scope,
  access: agent.access,
  model: agent.model,
  program: agent.program,
  contextFile: "unused",
  folder: "unused",
};

test("IPSG rules select the dedicated adapter and the canonical cwd", async () => {
  assert.equal(agent.use, "mcode-ipsg");
  const adapter = await adapterFor(agent.use);
  const targets = [...rules.rules, ...rules.elsewhere].filter((rule) => rule.to === "mcode");
  assert.ok(targets.length > 0);
  for (const rule of targets) {
    assert.equal(rule.cwd, scope);
    assert.equal(fs.realpathSync(rule.cwd), scope);
    const argv = adapter.command({ ...base, cwd: rule.cwd });
    assert.equal(argv[0], join(homedir(), ".minimax-code", "bin", "mcode"));
    assert.deepEqual(argv.slice(1, 12), [
      "exec",
      "--cwd",
      scope,
      "--prompt-mode",
      "coding",
      "--output-format",
      "stream-json",
      "--permission",
      "off",
      "--model",
      DEFAULT_MODEL,
    ]);
  }
  assert.equal(adapter.read, mcode.read);
});

test("dedicated policy survives a display-name change and rejects every launch override", async () => {
  const adapter = await adapterFor("mcode-ipsg");
  const renamed = { ...agent, name: "普通研判" };
  adapter.command({ ...base, access: renamed.access });
  for (const override of [
    { access: "edit" },
    { access: "full" },
    { cwd: "/Users/x/projects" },
    { cwd: `${scope}/../ipsg-supervisor` },
    { model: "other" },
    { program: "/bin/echo" },
    { promptMode: "interactive" },
    { outputFormat: "json" },
  ]) {
    assert.throws(() => adapter.command({ ...base, ...override } as Turn), /策略拒绝/);
  }
  adapter.command({ ...base, model: DEFAULT_MODEL });
});

test("dedicated policy rejects symlink aliases and a canonical scope redirected through a symlink", async (t) => {
  const adapter = await adapterFor("mcode-ipsg");
  const scratch = fs.mkdtempSync(join(import.meta.dirname, ".mcode-ipsg-"));
  fs.chmodSync(scratch, 0o700);
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const alias = join(scratch, "alias");
  fs.symlinkSync(scope, alias);
  assert.throws(() => adapter.command({ ...base, cwd: alias }), /策略拒绝/);
  const realpath = fs.realpathSync;
  t.mock.method(fs, "realpathSync", (path: fs.PathLike) => (path === scope ? scratch : realpath(path)));
  assert.throws(() => adapter.command(base), /策略拒绝/);
});

test("generic MCode retains program, model and permission overrides at every access level", () => {
  for (const [access, permission] of [
    ["read", "off"],
    ["edit", "smart"],
    ["full", "full"],
  ] as const) {
    const argv = mcode.command({ ...base, access, cwd: "/work", program: "/bin/echo", model: "custom" });
    assert.equal(argv[0], "/bin/echo");
    assert.equal(argv[argv.indexOf("--permission") + 1], permission);
    assert.equal(argv[argv.indexOf("--model") + 1], "custom");
  }
});
