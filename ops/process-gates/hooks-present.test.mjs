// The agent's working gates exist and are wired. A rule that is only a reminder is
// forgotten under pressure, so the gates live in .claude/hooks and are tracked; this
// file stops one from being deleted, unwired, or emptied of its condition.
//
// Limit: it guards that the gates exist, not that they behave. Behaviour is proven by
// running them (edit-while-reading.test.mjs, and the reverse proof on every change).
//
// Moved from apps/api/src/common/hooks-present.spec.ts so the work method gates run
// apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, runsHook } from './repo.mjs';

const settingsPath = join(REPO, '.claude', 'settings.json');
const wiredCommands = (matcher) => {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
  const pre = settings?.hooks?.PreToolUse ?? [];
  return pre.filter((e) => e.matcher === matcher).flatMap((e) => (e.hooks ?? []).map((h) => h.command ?? ''));
};
const exits2 = (src) => (src.match(/process\.exit\(2\)/g) ?? []).length;
// Comment lines explain; the code decides. Lines that are comments are blanked before a check.
const codeOnly = (src) => src.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/gm, '');

describe('the shell gate exists and is wired', () => {
  const hookPath = join(REPO, '.claude', 'hooks', 'block-shell-text-writes.mjs');

  it('the hook file exists', () => {
    assert.ok(existsSync(hookPath));
  });

  it('the wiring check needs the exact hook file, so a renamed or missing one does not count', () => {
    assert.ok(runsHook('node .claude/hooks/block-shell-text-writes.mjs', 'block-shell-text-writes.mjs'));
    assert.ok(!runsHook('node .claude/hooks/block-shell-text-writes.mjs.off', 'block-shell-text-writes.mjs'));
    assert.ok(!runsHook('node .claude/hooks/missing/block-shell-text-writes.mjs', 'block-shell-text-writes.mjs'));
    assert.ok(!runsHook('echo block-shell-text-writes.mjs', 'block-shell-text-writes.mjs'));
  });

  it('it is wired in settings.json on PreToolUse for Bash', () => {
    const commands = wiredCommands('Bash');
    assert.ok(commands.length > 0);
    assert.ok(commands.some((c) => runsHook(c, 'block-shell-text-writes.mjs')));
  });

  // Each gate by its marker: the marker is the deciding condition, read from the file,
  // so deleting the condition fails here even if its comment stays.
  const GATES = [
    ['text written to a file by an inline script', 'INLINE_SCRIPT.test(cmd) && WRITES_FILE.test(cmd)'],
    ['python as the Store stub', 'WindowsApps'],
    ['a destructive command names a fixed target', 'DESTRUCTIVE.test(cmd)'],
    ['backticks inside arguments', 'stripSafeSpans(cmd)'],
    // A pull request that touches code must have a heavy run in its history.
    ['the heavy check in the pull request history', 'const codeFiles = prFiles.filter(touches)'],
    // And every heavy job passed on the current head, by its full hash.
    ['the heavy check passed on the same head', 'r.head_sha === head'],
    // Reading the pull request files and checks is retried three times before refusing,
    // and a refusal shows the gh reason, so a passing GitHub glitch does not block a sound merge.
    ['GitHub reads are retried three times', 'r.status !== 0 && i < GH_READ_WAIT_MS.length'],
    ['a refusal shows the gh reason', 'ghWhy(runs)'],
    // UNKNOWN is waited for three times, then refused: neither merged before anything is
    // known nor refused at once after every earlier merge.
    ['waiting on an unknown state', "status === 'UNKNOWN' && i < UNKNOWN_TRIES"],
    // The shared copy is always on main: no command moves it, and no merge while it is elsewhere.
    ['no command moves the shared copy off main', 'leavesSharedMain(cmd, payload?.cwd)'],
    ['no merge while the shared copy is off main', "sharedBranch.stdout.trim() !== 'main'"],
  ];

  for (const [name, marker] of GATES) {
    it(`gate "${name}" is present`, () => {
      assert.ok(readFileSync(hookPath, 'utf8').includes(marker));
    });
  }

  // The heavy job names and paths are read from the workflow itself, not from a list in
  // the hook: a second list drifts from the first one day and then guards jobs that no
  // longer exist, silently. A heavy job name written in the hook fails this.
  it('the heavy check gate derives from the workflow file, not from a list in it', () => {
    const src = readFileSync(hookPath, 'utf8');
    assert.ok(src.includes("resolve(repoRoot, '.github', 'workflows', 'web-tests.yml')"));
    const code = codeOnly(src);
    const heavyJobs = ['db-integration', 'nginx-cache', 'playwright'];
    assert.deepEqual(heavyJobs.filter((j) => code.includes(`'${j}'`) || code.includes(`"${j}"`)), []);
  });

  it('each one refuses with exit 2, not a warning that lets the command through', () => {
    assert.ok(exits2(readFileSync(hookPath, 'utf8')) >= GATES.length);
  });

  // The wiring in .claude/settings.json uses a relative path, so it only loads in a
  // session whose root is the repository. The fix is a user level wiring with an absolute
  // path, done by this installer. Limit: this guards that the installer exists, not that
  // it was run, since user settings live outside the repository.
  it('the user level installer exists and reads the gates from settings.json, not from a list of its own', () => {
    const installer = join(REPO, '.claude', 'hooks', 'install-user-hooks.mjs');
    assert.ok(existsSync(installer));
    const src = readFileSync(installer, 'utf8');
    assert.ok(src.includes("resolve(import.meta.dirname, '..', 'settings.json')"));
    const code = codeOnly(src);
    assert.ok(!code.includes('block-shell-text-writes.mjs'));
    assert.ok(!code.includes('block-edit-while-reading.mjs'));
    // An absolute path, or the fault it was built for comes back.
    assert.ok(src.includes('resolve(import.meta.dirname'));
    // It adds to the user settings and does not replace them.
    assert.ok(src.includes('settings.hooks.PreToolUse ??= []'));
  });
});

// The second gate: no edit to a tree while a test run reads it. Its existence and
// wiring are here; its behaviour is proven by running it in edit-while-reading.test.mjs.
describe('the edit while reading gate exists and is wired', () => {
  const hookPath = join(REPO, '.claude', 'hooks', 'block-edit-while-reading.mjs');

  it('the hook file exists', () => {
    assert.ok(existsSync(hookPath));
  });

  for (const matcher of ['Bash', 'Edit|Write|MultiEdit|NotebookEdit']) {
    it(`it is wired in settings.json on PreToolUse for "${matcher}"`, () => {
      const commands = wiredCommands(matcher);
      assert.ok(commands.length > 0);
      assert.ok(commands.some((c) => runsHook(c, 'block-edit-while-reading.mjs')));
    });
  }

  const GATES = [
    ['shell commands that change the tree', 'TREE_MUTATION.test(cmd)'],
    ['roots are read from the command text, not the working folder', 'rootsFromCommand(cmd)'],
    ['the bypass expires', 'ageMs <= BYPASS_TTL_MS'],
    ['a failed scan is announced and logged, not read as no reader', "trace('scan-failed'"],
    ['the refusal names the running suite', 'scan.readers.map((p) => `  · [${p.pid}]'],
  ];

  for (const [name, marker] of GATES) {
    it(`gate "${name}" is present`, () => {
      assert.ok(readFileSync(hookPath, 'utf8').includes(marker));
    });
  }

  it('it refuses with exit 2, not a warning', () => {
    assert.ok(exits2(readFileSync(hookPath, 'utf8')) >= 1);
  });
});
