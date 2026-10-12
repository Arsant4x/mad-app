// Bilingual UI gate (standing rule in CLAUDE.md, decision 1691).
//
//   1. A web UI file added or changed by the pull request has no direct text.
//   2. No file has more direct text than its entry in docs/i18n-literals-debt.json,
//      and no file outside the list has any.
//   3. The list matches the code: an entry above the real count is lowered.
//
// Usage:
//   node ops/ci/i18n-literals-check.mjs [event.json]   check (pull request diff when given)
//   node ops/ci/i18n-literals-check.mjs --write-debt   rewrite the debt counts from the tree
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEBT_FILE, REPO, inScope, literals } from './i18n-literals.mjs';

const git = (...a) => execFileSync('git', ['-C', REPO, '-c', 'core.quotePath=false', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });

const files = git('ls-files', 'apps/web/src').split('\n').filter(inScope);
const counts = {};
let total = 0;
for (const f of files) {
  const n = literals(readFileSync(join(REPO, f), 'utf8'), f).length;
  if (n) counts[f] = n;
  total += n;
}

const debtPath = join(REPO, DEBT_FILE);
const debt = JSON.parse(readFileSync(debtPath, 'utf8'));

if (process.argv.includes('--write-debt')) {
  // Only lowers: a file never gets more debt than it had, and a new file gets none.
  const kept = Object.fromEntries(
    Object.entries(debt.files)
      .map(([f, allowed]) => [f, Math.min(allowed, counts[f] ?? 0)])
      .filter(([, n]) => n > 0)
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
  debt.files = kept;
  writeFileSync(debtPath, JSON.stringify(debt, null, 2) + '\n');
  console.log(`debt rewritten: ${Object.keys(kept).length} files, ${Object.values(kept).reduce((a, b) => a + b, 0)} literals`);
  process.exit(0);
}

const problems = [];
const eventPath = process.argv[2];
if (eventPath) {
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  if (event.pull_request) {
    const base = git('merge-base', event.pull_request.base.sha, 'HEAD').trim();
    const changed = git('diff', '--name-only', '--diff-filter=AMR', base, 'HEAD', '--', 'apps/web/src').split('\n').filter(inScope);
    for (const f of changed) if (counts[f]) problems.push(`${f}: changed in this pull request and still has ${counts[f]} direct texts; move them to translation keys`);
  }
}
for (const [f, n] of Object.entries(counts)) {
  const allowed = debt.files[f] ?? 0;
  if (n > allowed) problems.push(`${f}: ${n} direct texts, debt allows ${allowed}`);
}
for (const [f, allowed] of Object.entries(debt.files)) {
  const n = counts[f] ?? 0;
  if (n < allowed) problems.push(`${f}: debt says ${allowed} but the file has ${n}; lower the debt (node ops/ci/i18n-literals-check.mjs --write-debt)`);
}
const debtTotal = Object.values(debt.files).reduce((a, b) => a + b, 0);
console.log(`files=${files.length} with-literals=${Object.keys(counts).length} literals=${total} debt-files=${Object.keys(debt.files).length} debt-literals=${debtTotal} problems=${problems.length}`);
for (const p of problems) console.log(`x ${p}`);
process.exit(problems.length ? 1 : 0);
