// No agent signature in commits or pull requests (standing rule 41), with two gates:
// 1) .claude/settings.json sets `attribution` to two empty strings, so the tool adds
//    no signature of its own;
// 2) .githooks/commit-msg removes three lines from the commit message before it is
//    saved: those starting with Co-Authored-By: or Claude-Session:, and the tool's
//    "Generated with Claude Code" line.
//
// The second is proven by running it, not by reading it: a real commit in a
// throwaway repository whose hook is a copy of this repository's hook, then the saved
// message is read back. With both cases: lines that must go and lines that look like
// them and must stay, since a hook that removes everything fails like one that
// removes nothing.
//
// Moved from apps/api/src/common/commit-msg-attribution.spec.ts so the work method
// gates run apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO } from './repo.mjs';

const HOOK = join(REPO, '.githooks', 'commit-msg');

const DROP = [
  'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>',
  'co-authored-by: someone <someone@example.invalid>',
  'Claude-Session: 0f1e2d3c',
  '\u{1F916} Generated with [Claude Code](https://claude.com/claude-code)',
  'Generated with Claude Code',
];
const KEEP = [
  'docs(السجلّ): عنوانٌ عربيٌّ لا يُمسّ',
  'سطرٌ يذكر Claude Code في وسطه فيبقى',
  'وسطرٌ يذكر Co-Authored-By: في وسطه لا في أوّله فيبقى',
];

describe('no agent signature in a commit or a pull request', () => {
  it('the settings turn off the tool signature, and what was there before stays', () => {
    const settings = JSON.parse(readFileSync(join(REPO, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(settings.attribution, { commit: '', pr: '' });
    assert.ok((settings.hooks?.PreToolUse?.length ?? 0) > 0);
  });

  it('the hook removes signature lines from a real commit and keeps lines that look like them', () => {
    assert.ok(existsSync(HOOK));
    const dir = mkdtempSync(join(tmpdir(), 'commit-msg-'));
    try {
      const hooks = join(dir, '.probe-hooks');
      mkdirSync(hooks);
      copyFileSync(HOOK, join(hooks, 'commit-msg'));
      chmodSync(join(hooks, 'commit-msg'), 0o755);
      const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      git('init', '-q');
      git('config', 'user.name', 'probe');
      git('config', 'user.email', 'probe@example.invalid');
      git('config', 'core.hooksPath', hooks);
      writeFileSync(join(dir, 'a.txt'), 'x\n');
      git('add', 'a.txt');
      const message = [KEEP[0], '', KEEP[1], KEEP[2], '', ...DROP, ''].join('\n');
      writeFileSync(join(dir, '.probe-msg'), message);
      git('commit', '-q', '-F', '.probe-msg');
      const saved = git('log', '-1', '--format=%B');
      for (const line of KEEP) assert.ok(saved.includes(line), `kept: ${line}`);
      for (const line of DROP) assert.ok(!saved.includes(line), `removed: ${line}`);
      assert.doesNotMatch(saved, /generated with/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
