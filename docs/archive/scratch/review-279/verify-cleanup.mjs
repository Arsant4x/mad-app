// يُثبت أن التنظيف لم يُفقد صفّاً ولم يغيّر حرفاً: الصفوفُ قبلُ = الباقيةُ + المنقولة، كلٌّ بنصّه.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const ID = /ق-([٠-٩0-9]+)/;
const isRow = (l) => l.startsWith('| **') && ID.test(l.split(' | ')[0]);
const split = (t) => t.split(/\r?\n/);
const before = split(execFileSync('git', ['-C', 'D:/worktrees/d279-cleanup', 'show', 'origin/main:docs/decisions.md'], { encoding: 'utf8', maxBuffer: 1 << 26 })).filter(isRow);
const after = split(readFileSync('D:/worktrees/d279-cleanup/docs/decisions.md', 'utf8')).filter(isRow);
const moved = split(readFileSync('D:/worktrees/d279-cleanup/docs/archive/decisions-task-rows.md', 'utf8')).filter(isRow);
const count = (a) => a.reduce((m, l) => m.set(l, (m.get(l) || 0) + 1), new Map());
const b = count(before), u = count([...after, ...moved]);
let missing = 0, extra = 0;
for (const [l, n] of b) if ((u.get(l) || 0) !== n) missing++;
for (const [l, n] of u) if ((b.get(l) || 0) !== n) extra++;
const keptSet = new Set(after);
const overlap = moved.filter((l) => keptSet.has(l)).length;
console.log(`before=${before.length} after=${after.length} moved=${moved.length} sum=${after.length + moved.length} missingOrChanged=${missing} extra=${extra} overlap=${overlap}`);
// المسبارُ مصادَق: صفٌّ يُعدَّل حرفاً يجب أن يُرى.
const probe = count([...after.slice(1), after[0] + 'x', ...moved]);
let seen = 0;
for (const [l, n] of b) if ((probe.get(l) || 0) !== n) seen++;
console.log(`probe: a changed row is seen=${seen === 1}`);
process.exit(missing || extra || overlap || before.length !== after.length + moved.length || seen !== 1 ? 1 : 0);
