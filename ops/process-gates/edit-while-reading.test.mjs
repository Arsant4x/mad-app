// The "no edit to a tree while it is read" gate, proven by running it, not by reading it.
//
// hooks-present.test.mjs guards that the gate exists, not that it works. This file
// builds a throwaway repository, starts a fake reader that carries the repository root
// in its command line, then passes the real hook the same payload the runner passes,
// and reads its verdict, its reason and its log.
//
// Both known cases before trusting it: no reader lets the edit through, a reader
// refuses it and names the reader. Between them: a read only command passes while the
// reader runs, an edit in another root passes, and the bypass passes with a log line
// while it is fresh and stops working when it is old.
//
// A throwaway repository, not this one: the suite running this file reads this tree,
// so "no reader" could never be tested here, and no bypass is written into the real
// .claude folder during a real run.
//
// Moved from apps/api/src/common/edit-while-reading.spec.ts so the work method gates
// run apart from the product tests.
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, runsHook } from './repo.mjs';

const HOOK = join(REPO, '.claude', 'hooks', 'block-edit-while-reading.mjs');

function runHook(payload, cwd) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(payload), encoding: 'utf8', cwd, timeout: 30000 });
  return { status: r.status, stderr: r.stderr ?? '' };
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const mkdtemp = (prefix) => mkdtempSync(join(tmpdir(), prefix));

describe('the "no edit to a tree while it is read" gate', () => {
  let root;
  let reader = null;
  const editInRoot = () => ({ tool_name: 'Edit', tool_input: { file_path: join(root, 'src', 'x.ts'), old_string: 'a', new_string: 'b' } });

  before(async () => {
    root = mkdtemp('mad-app-ewr-');
    mkdirSync(join(root, '.git'));
    mkdirSync(join(root, '.claude'));
    mkdirSync(join(root, 'src'));
    // The fake reader carries the root with forward slashes: the command line the
    // system shows is compared after slashes are made the same, and a backslash path
    // passed through a shell loses them.
    reader = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 90000)', '--', 'jest', root.replace(/\\/g, '/')], { stdio: 'ignore', windowsHide: true });
    await sleep(700); // until it shows in the process list
  });

  after(() => {
    reader?.kill();
    rmSync(root, { recursive: true, force: true });
  });

  it('a running reader and an edit in its root: refused with exit 2, naming the process', () => {
    const v = runHook(editInRoot(), root);
    assert.equal(v.status, 2);
    assert.ok(v.stderr.includes('لا تُمسّ شجرةٌ تُقرأ'));
    assert.ok(v.stderr.includes(String(reader.pid))); // by name, not "something is running"
    assert.ok(v.stderr.includes('jest'));
    const log = readFileSync(join(root, '.claude', 'edit-while-reading.log'), 'utf8');
    assert.ok(log.includes('"kind":"refused"'));
  });

  it('a running reader and a shell command that changes the tree: refused, and the root comes from the command, not the working folder', () => {
    // The working folder is a temporary one with no .git, as in a real session, so a
    // root read from it would blind the gate. The path is written as each host writes it:
    // MSYS form on Windows (/c/Users/...), a plain absolute path elsewhere (/tmp/...).
    const shellPath = /^[A-Za-z]:/.test(root) ? '/' + root.replace(/^([A-Za-z]):/, (_m, d) => d.toLowerCase()).replace(/\\/g, '/') : root;
    const v = runHook({ tool_name: 'Bash', tool_input: { command: `cd ${shellPath} && git checkout main 2>&1 | tail -1` } }, tmpdir());
    assert.equal(v.status, 2);
    assert.ok(v.stderr.includes(String(reader.pid)));
  });

  it('a running reader and a read only shell command: passes without a scan', () => {
    const v = runHook({ tool_name: 'Bash', tool_input: { command: `cd ${root} && git log --oneline -3 && grep -rn foo src/` } }, tmpdir());
    assert.equal(v.status, 0);
  });

  it('a running reader and an edit in another root: passes, since the rule is about the tree being read', () => {
    const other = mkdtemp('mad-app-ewr-other-');
    try {
      mkdirSync(join(other, '.git'));
      const v = runHook({ tool_name: 'Write', tool_input: { file_path: join(other, 'note.md'), content: 'x' } }, other);
      assert.equal(v.status, 0);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('a fresh bypass with a reason: passes and logs the reason and the reader', () => {
    const marker = join(root, '.claude', 'allow-edit-while-reading');
    writeFileSync(marker, 'إصلاحُ سطرٍ يمنع الحزمةَ من الاكتمال\n', 'utf8');
    try {
      const v = runHook(editInRoot(), root);
      assert.equal(v.status, 0);
      assert.ok(v.stderr.includes('المنفذ المعلَن'));
      const last = readFileSync(join(root, '.claude', 'edit-while-reading.log'), 'utf8').trim().split('\n').pop() ?? '';
      const entry = JSON.parse(last);
      assert.equal(entry.kind, 'bypassed');
      assert.equal(entry.reason, 'إصلاحُ سطرٍ يمنع الحزمةَ من الاكتمال');
      assert.ok(entry.readers.includes(reader.pid));
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it('a bypass older than ten minutes: void, and the edit is refused', () => {
    const marker = join(root, '.claude', 'allow-edit-while-reading');
    writeFileSync(marker, 'سببٌ قديم\n', 'utf8');
    const old = new Date(Date.now() - 11 * 60 * 1000);
    utimesSync(marker, old, old);
    try {
      const v = runHook(editInRoot(), root);
      assert.equal(v.status, 2);
      assert.ok(v.stderr.includes('باطل'));
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it('a bypass with no reason on its first line: void', () => {
    const marker = join(root, '.claude', 'allow-edit-while-reading');
    writeFileSync(marker, '\n', 'utf8');
    try {
      const v = runHook(editInRoot(), root);
      assert.equal(v.status, 2);
      assert.ok(v.stderr.includes('بلا سببٍ'));
    } finally {
      rmSync(marker, { force: true });
    }
  });

  // A scan that cannot run stays open, with a loud banner and a count. The failure is
  // made with no back door: an empty PATH, so neither powershell nor ps is found
  // (ENOENT), which is what happens when the tool times out. The gate must say it did
  // not decide (a banner, not a log line) and count: today 1, then today 2.
  it('a scan that cannot ask the system: passes with a loud "did not decide" banner and a growing count', () => {
    const noTools = { ...process.env, PATH: '', Path: '' };
    const first = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(editInRoot()), encoding: 'utf8', cwd: root, timeout: 30000, env: noTools });
    assert.equal(first.status, 0);
    assert.ok(first.stderr.includes('لم يحكم'));
    assert.ok(first.stderr.includes('╔')); // a banner, not a line
    assert.ok(first.stderr.includes('التعذّراتُ اليوم: 1 · الإجمال: 1'));
    const entries = readFileSync(join(root, '.claude', 'edit-while-reading.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const failed = entries.filter((e) => e.kind === 'scan-failed');
    assert.equal(failed.length, 1);
    assert.equal(typeof failed[0].scanMs, 'number');
    assert.ok(String(failed[0].error).includes('ENOENT'));

    const second = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(editInRoot()), encoding: 'utf8', cwd: root, timeout: 30000, env: noTools });
    assert.equal(second.status, 0);
    assert.ok(second.stderr.includes('التعذّراتُ اليوم: 2 · الإجمال: 2'));
  });

  it('no reader: passes, the second known case', async () => {
    reader.kill();
    reader = null;
    await sleep(700);
    const v = runHook(editInRoot(), root);
    assert.equal(v.status, 0);
    assert.equal(v.stderr, '');
  });

  it('the file exists and is wired on the editors and on Bash in settings.json', () => {
    assert.ok(existsSync(HOOK));
    const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
    const pre = settings.hooks?.PreToolUse ?? [];
    const wiredOn = (matcher) => pre.some((e) => e.matcher === matcher && (e.hooks ?? []).some((h) => runsHook(h.command ?? '', 'block-edit-while-reading.mjs')));
    assert.ok(wiredOn('Bash'));
    assert.ok(wiredOn('Edit|Write|MultiEdit|NotebookEdit'));
  });
});
