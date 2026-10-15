// No agent signature in what is written on GitHub (standing rule 41, its third gate).
//
// The commit-msg hook cannot see a pull request title, its description, or the
// message GitHub writes for a squash merge, so ops/ci/attribution-check.mjs reads
// them from the workflow event. This gate runs that script on made-up events: cases
// that must fail and cases that must pass. It also checks that the pattern is read
// from the hook and that the workflow calls the script by its path.
//
// Moved from apps/api/src/common/attribution-ci.spec.ts so the work method gates run
// apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO } from './repo.mjs';

const SCRIPT = join(REPO, 'ops', 'ci', 'attribution-check.mjs');

// Signature lines are built by a function, not written out, so this file never
// carries one as text that could be copied into a message.
const sig = {
  co: () => ['Co', 'Authored', 'By: Someone <a@b.c>'].join('-'),
  session: () => ['Claude', 'Session: 0f1e2d3c'].join('-'),
  tool: () => 'Generated with [' + 'Claude Code](https://example.invalid)',
};

function run(event, commits) {
  const dir = mkdtempSync(join(tmpdir(), 'attr-'));
  try {
    const ev = join(dir, 'event.json');
    writeFileSync(ev, JSON.stringify(event));
    const args = [SCRIPT, ev];
    if (commits) {
      const c = join(dir, 'commits.jsonl');
      writeFileSync(c, commits.map((m) => JSON.stringify(m)).join('\n') + '\n');
      args.push(c);
    }
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const pr = (title, body) => ({ pull_request: { title, body } });

describe('no signature in what is written on GitHub', () => {
  it('reads the pattern from the hook, and the workflow calls the script by its path', () => {
    const hook = readFileSync(join(REPO, '.githooks', 'commit-msg'), 'utf8');
    assert.match(hook, /^PATTERN='[^']+'$/m);
    assert.ok(readFileSync(SCRIPT, 'utf8').includes("readFileSync(new URL('../../.githooks/commit-msg'"));
    const wf = readFileSync(join(REPO, '.github', 'workflows', 'attribution.yml'), 'utf8');
    assert.ok(wf.includes('node ops/ci/attribution-check.mjs "$GITHUB_EVENT_PATH"'));
    assert.match(wf, /types: \[[^\]]*\bedited\b[^\]]*\]/); // editing the description runs it
    assert.match(wf, /push:\s*\n\s*branches: \[main\]/); // and the merge message on main
  });

  it('fails on a signature line in the description, the title, the commits and the merge message', () => {
    assert.equal(run(pr('عنوان', `وصفٌ واضح\n\n${sig.tool()}`)).code, 1);
    assert.equal(run(pr(`عنوان ${sig.tool()}`, 'وصف')).code, 1);
    assert.equal(run(pr('عنوان', 'وصف'), ['fix: شيء', `fix: آخر\n\n${sig.session()}`]).code, 1);
    const merged = run({ commits: [{ id: 'abcdef1234', message: `docs: x (#1)\n\n${sig.co()}` }] });
    assert.equal(merged.code, 1);
    assert.ok(merged.out.includes('الالتزام abcdef12'));
  });

  it('passes on plain text, and on the name in the middle of a line', () => {
    const r = run(pr('عنوان', `وصفٌ يذكر ${sig.co()} في وسطه لا في أوّله`), ['fix: شيء']);
    assert.equal(r.code, 0);
    assert.ok(r.out.includes('checked=3 problems=0'));
    assert.equal(run({ commits: [{ id: 'a', message: 'docs: x (#1)\n\nنصٌّ واضح.' }] }).code, 0);
    assert.equal(run(pr('عنوان', null)).code, 0); // empty description
  });

  it('an event with no pull request and no commits gives no verdict', () => {
    assert.equal(run({ ref: 'x' }).code, 2);
  });
});
