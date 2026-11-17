# tests/
> L2 | Parent: ../AGENTS.md

Test modules exercise behavior without production state. Fixtures support the adjacent tests.

acp.test.ts: Failure modes: loading history becomes this turn's answer; a restarted bridge forgets the agent's session; thought/tool
adapters.test.ts: What's different about each agent. Failure cases: a level of access maps to the wrong flag, full access is given unasked,
backup.test.ts: Failure modes: a backup or its check fails on a real hub's database, whose indexes call functions only the hub has; a backup
benchmark.test.ts: Failure modes: completed or keep-alive requests masquerade as concurrent long polls; a failed response counts as success;
body-limit.test.ts: Failure modes: a body declared far too large is read anyway, so a request nobody has checked yet holds a connection for
browser-handoff.test.ts: Failure modes: a task becomes shell syntax; a follow-up creates another browser session; an invalid URL or session
business-recipes.test.ts: Failure modes: an HTTP 200 error page or redirect is called healthy; a continuing outage wakes the model or notifies
cards.test.ts: What reaches the owner. A card's words never change; only its state does. Failure cases: asking the same thing while it
channels.test.ts: The channels that ship and the webhook adapter. No real listener runs here: only one can hold an app's card clicks.
check.test.ts: `check` reads a rules file and nothing else. Failure cases: checking a draft opens the hub's database, creates a master
ci-scope.test.ts: How much CI a change gets. Failure cases: a change to kernel code or to the simulation's parts skips the short simulation;
claude-app.test.ts: Finding the Claude Code the desktop app ships. Failure case: the app keeps files such as auto-update-state.json next
cli-flags.test.ts: Reading the command line: `init --help` used to install instead of printing how to use it, and a misspelt `--port`
cli-run-id.test.ts: Naming a run: `stop` and `why` with no number, or with a word that is not one, used to send /v1/runs/NaN to the hub and
concurrent-writes.test.ts: Failure modes: a command writing to the database (`key new`) while the hub is writing fails with "the log has changed",
conformance.test.ts: Failure modes: a different hub accepts the wrong key, drops idempotent receipts, loses answers or emits an invalid wire
contract.test.ts: What a run is told and how its last message is read: the only thing an Agent has to get right. Failure cases: the prompt
crash-smoke.test.ts: Failure modes: the real-process crash harness misses log/projection divergence or leaves killed processes and databases.
cron.test.ts: When a schedule comes next, in the rules' time zone. Failure cases: a malformed schedule is taken; 7 isn't Sunday; a day
delivery-action.test.ts: Failure modes from Ship: a later docs-only commit suppresses a queued code release; an unhealthy endpoint authorizes
delivery-input.test.ts: Failure modes: event prose chooses a repository or command; a different PR's event is delivered; owner questions leak
delivery-review.test.ts: Failure modes: empty/failed reviews pass; findings are unhandled but attested; Codex reads developer
delivery-run.test.ts: Failure modes: an owner question with backticks in its title or text cuts the receipt short; a short commit from the health
delivery-scope.test.ts: Failure modes: runtime Markdown, executable/symlink documents, renames, an unknown/divergent live
delivery.test.ts: Failure modes: missing labels/forks dispatch; draft or skipped checks authorize merging; a push
desktop.test.ts: The channel a new install starts with. Nothing real is shown here: the notify commands are stand-ins on PATH, and the one
dsh.test.ts: What's different about DSH. Failure cases: a level of access maps to the wrong permission preset, or a resumed turn keeps
elsewhere-ask.test.ts: A scheduled task elsewhere (say, in the Claude app) that asks you something. Failure cases: its question reaches you
events.test.ts: What a source sends becomes one event, and the rules decide what work it makes. Failure cases: an event missing its id
example-plugins.test.ts: Failure modes: an example imports something that only exists in this repository, so it loads here and breaks once
examples.test.ts: Failure modes: shell examples cross credential boundaries, drop a receipt or forget the delivered version; answering a
format.test.ts: When a start has to rebuild the projection from the log. Failure cases: a change to code outside the files that decide
gitlab.test.ts: GitLab webhooks. Failure modes: a wrong or missing token is taken; the action isn't in the event's type; a retried
heartbeat.test.ts: Being seen. A worker with work in hand asks every second and a channel polls all day; a fact is a disk sync and stays in
helpers.ts: Each test file runs in its own process with its own home and the fixture rules; modules are imported after this sets
hops.test.ts: Failure modes: emitted loops reset their depth; answers and deferred work discard the chain; a blocked event disappears
http.test.ts: The doors. Failure cases: a request without a key, with another kind's key, or with a made-up one gets in; a source posts
hub.ts: The hub's inputs by name, for tests and measuring scripts. What runs for real takes them at the doors in kernel/http.ts,
install.test.ts: install.sh, in a throwaway home with a PATH made of nothing but temporary folders. The program it sets up is a copy of this
join.test.ts: A machine that already runs a hub or worker must not lose its config when someone mistakenly calls join.
kernel.test.ts: Failure modes: deciding mutates the input; time/randomness changes replay; uncommitted facts become visible;
key-remove.test.ts: Failure modes: a source revokes somebody else's key; a revoked key keeps a pending poll or stream alive; CLI writes
lines.test.ts: Lines as ACP, MCP and lark-cli frame them. Failure modes: a line is cut at U+2028 or U+2029, which JSON leaves as they
listen.test.ts: Failure modes: a listen address with no host becomes every interface (a local hub silently open to the network), a
loop.test.ts: The whole loop, with nothing faked but the agent: a real `agent-autoloop up` in its own process, from `init` on, through the
master-key.test.ts: The master key signs every card link and run token. Failure modes: an empty or cut-short master.key is used as is, so
mcode-adapter.test.ts: Failure mode: a launchd/systemd worker has a bare PATH, while MCode is installed in the user's default directory;
mcode-ipsg.test.ts: Failure mode: display-name heuristics leave the real rules unrestricted, and access changes bypass the guard.
mcp.test.ts: Failure modes: stdout contains non-protocol text; unknown tools execute arbitrary endpoints; malformed arguments reach
pause-http.test.ts: Rule control over HTTP and from the command line. Failure cases: someone other than the owner pauses, resumes or runs a
pause.test.ts: Pausing, resuming and running a rule now, as the owner's facts in the log. Failure cases: a paused schedule still runs,
plugin-node-path.test.ts: The hub is long-running. Upgrade node under Homebrew and the `Cellar` directory this process started from is
plugin-trouble.test.ts: One process holds the hub, the worker and the channels, and plugins run inside it. Failure cases: an agent plugin that
plugins.test.ts: Failure modes: built-ins bypass external plugin discovery; plugin names escape their directory; installation overwrites
progress.test.ts: A round that is stuck on something only the owner can undo, and a round that stopped moving while its worker still says
projection.test.ts: Failure modes: a draft mutates its base; filtered reads miss changed/new rows or retain deleted rows;
purity.test.ts: The architecture, as a test. The hub's kernel knows no vendor and makes no request of its own: everything connects to it.
queue-costs.test.ts: What a long queue costs each input. Everything runs on one thread and a worker with work in hand asks every second, so
recipes.test.ts: Failure modes: a recipe's rules don't pass `agent-autoloop check`, or check would pass anything; a rule names a Skill the
releases.test.ts: What someone installing or updating gets. Failure cases: they get main as it stands, checked or not, instead of the newest
resume-thread.test.ts: A rule with resume takes a thread's next event on in the session its last round ended in. Failure cases: the next round
retry.test.ts: Failing in different ways wants different patience. Failure cases: the environment failing waits as long as the
rules-preview.test.ts: Failure modes: explain prints a rule's private prompt; a dry run writes to the hub instead of previewing; the
rules.fixture.json: Test fixture consumed by the neighboring behavior tests.
rules.test.ts: The rules file is what the owner changes by asking an Agent, so a mistake must be caught, say which rule and what is
runs.test.ts: Work goes to the worker of the rule's agent, one run at a time in each group, or for a rule that runs in parallel one
schedule.test.ts: The clock's events. Failure cases: a schedule fires when it isn't due, twice for one moment, or on a schedule that has
schema.test.ts: Failure modes: published schemas accept an impersonated source, malformed receipts, or credentials in event data;
service-node-path.test.ts: The launchd plist names an absolute node. A Homebrew version lives under `Cellar`, and that directory is deleted at
service-running.test.ts: Which service runs this on a machine. Failure cases: doctor says a service running from a system-level unit isn't
service.test.ts: Failure modes: systemd splits an install path at spaces, expands its `$` or `%`, or loads a different path after quotes
session-usage.test.ts: Prevent double counting on restart/replay, negative usage after a counter reset, and invented zero usage or prices
simulation.test.ts: Failure modes: faults lose accepted events, duplicate execution or answers, exceed parallel limits, change receipts,
status-cost.test.ts: The cost line in `agent-autoloop status`, from the hub's completion-time totals. Failure cases: "today" is the
status-json.test.ts: Failure modes: --json changes the state instead of printing it; the human output stops being the plain one; an
stops-and-threads.test.ts: What the owner stopped stays stopped, and what comes back to a thread comes back to that thread. Failure cases: a run told
storage.ts: Fixture resets only; production writes go through decide/commit/evolve.
stream.test.ts: Failure modes: why omits the rule or answer; a stream drops facts at reconnect, exposes key hashes, or permits a source;
thread.test.ts: A round that waits for the owner holds its thread: what comes in meanwhile waits with it, and the answer carries those
try.test.ts: `try` against a real hub, from `init` on. Failure cases: a failure from before this try is reported as this try's, or
uninstall.test.ts: `agent-autoloop uninstall`, run from a copy of the program laid out as an install is, in a throwaway home with stand-ins for
up-lock.test.ts: Who holds up.pid. Failure cases: the number left behind is this very process's own (always so for pid 1 in a container, and
version.test.ts: `agent-autoloop --version`: what someone pastes into a bug report. Failure cases: it needs an install to answer; code past a
webhook-templates.test.ts: Failure modes: a vendor receives the wrong JSON shape; an HTTP 200 API error is acknowledged as delivered; Discord
why.test.ts: Failure modes: why dumps rules or JSON by default; related runs/events leak into the timeline; a question loses its
windows-service.test.ts: Failure modes: the Windows login task does not start the installed hub, its status is wrong, it leaves a window on the
windows.test.ts: Failure modes: a native Windows install cannot launch an Agent; shell metacharacters alter its arguments; restarting
worker-login-shell.test.ts: Failure modes: an owner whose login shell isn't POSIX (fish) can't start any agent because the worker's command for
worker-lookup.test.ts: Failure modes: the worker cannot run ps at all (the sandbox forbids it, or it is missing or not executable), and it
worker-path.test.ts: Failure modes: characters in the install path execute as shell source, command arguments are re-parsed,
worker-tidy.test.ts: What a worker keeps of finished runs. Failure cases: old output stays for as long as the worker runs, because it's only
worker.test.ts: The worker turns jobs into agents and what they say into results. Real processes run here (small shell scripts), because

[PROTOCOL]: Update this header on change, then check AGENTS.md
