// Registries are not mixed with code in one branch. docs/decisions.md and
// docs/engines.md reserve numbers; a branch that touches them together with
// code races other branches for numbers. The pre-push hook blocks it before
// push, and this gate covers the push the hook never sees (--no-verify, or a
// machine where the hook is not installed).
//
// CLAUDE.md is exempt by name: a rule drawn from a fix travels with the fix.
// The exemption is by name, not by kind; no third document inherits it.
//
// Moved from apps/api/src/common/registry-not-with-code.spec.ts so the work
// method gates run apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './repo.mjs';

const HOOK = join(REPO, '.githooks', 'pre-push');

/** The two registries, by name. Not derived from "everything under docs/". */
export const REGISTRIES = ['docs/decisions.md', 'docs/engines.md'];

export function mixesRegistryWithCode(changed) {
  const registry = changed.filter((f) => REGISTRIES.includes(f));
  const code = changed.filter((f) => /^(apps|packages)\//.test(f));
  return registry.length > 0 && code.length > 0;
}

/** Files changed on this branch against main; null when it cannot be read. */
function changedFiles() {
  try {
    const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { cwd: REPO, encoding: 'utf8' }).trim();
    if (!base) return null;
    return execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: REPO, encoding: 'utf8' })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return null;
  }
}

describe('registries are not mixed with code, and the hook blocks before push', () => {
  it('the detector catches a mix and leaves what is not a mix', () => {
    assert.equal(mixesRegistryWithCode(['docs/decisions.md', 'apps/api/src/common/guard-reads-declared.spec.ts']), true);
    assert.equal(mixesRegistryWithCode(['docs/engines.md', 'apps/web/src/x.tsx']), true);
    assert.equal(mixesRegistryWithCode(['docs/decisions.md', 'docs/engines.md']), false);
    assert.equal(mixesRegistryWithCode(['apps/api/src/a.ts', 'apps/api/test/b.e2e-spec.ts']), false);
    assert.equal(mixesRegistryWithCode(['CLAUDE.md', 'apps/api/src/a.ts']), false);
    assert.equal(mixesRegistryWithCode(['docs/licensing-and-operations.md', 'apps/api/src/a.ts']), false);
  });

  it('the hook exists and blocks at push, not only at merge', () => {
    assert.ok(existsSync(HOOK));
    const src = readFileSync(HOOK, 'utf8');
    assert.ok(src.includes('merge-base'));
    for (const r of REGISTRIES) assert.ok(src.includes(r.replace('docs/', '').replace('.md', '')), r);
    assert.ok(src.includes('exit 1'));
    assert.ok(src.includes('LC_ALL=C.UTF-8'));
  });

  it('this branch does not mix', (t) => {
    const changed = changedFiles();
    // A shallow clone or orphan branch is reported as a skip, not read as a pass.
    if (changed === null) {
      t.skip('branch diff against origin/main is not readable here');
      return;
    }
    assert.equal(mixesRegistryWithCode(changed), false);
  });
});
