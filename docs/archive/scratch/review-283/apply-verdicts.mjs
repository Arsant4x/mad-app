// يطبّق pairs-verdict.tsv على final-*.tsv ويكتب النتيجة في m/final-*.tsv: الصفُّ المحذوف يُسقط، والمُبقى يأخذ الحالَ والمراجع.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const DIR = 'D:/mad-app-scratch/review-283';
mkdirSync(`${DIR}/m`, { recursive: true });
const STATES = ['مسجَّل', 'مُسح', 'قيد البناء', 'مبنيّ', 'ينتظر قرار صاحب المشروع', 'مؤجَّل', 'مستبعَد', 'غير محسوم'];
const files = readdirSync(DIR).filter((n) => /^final-\d+\.tsv$/.test(n)).sort();
const lines = {};
for (const f of files) lines[f] = readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/);
const idOf = (id) => { const [F, n] = id.split(':'); return [`final-${F.slice(1)}.tsv`, Number(n) - 1]; };
const drop = new Set();
const set = new Map();
let same = 0, diff = 0;
const problems = [];
for (const l of readFileSync(`${DIR}/pairs-verdict.tsv`, 'utf8').split(/\r?\n/)) {
  if (!l.trim() || l.startsWith('#')) continue;
  const c = l.split('\t');
  if (c[1] === 'DIFF') { diff++; continue; }
  if (c[1] !== 'SAME') { problems.push('verdict? ' + l.slice(0, 80)); continue; }
  same++;
  if (!STATES.includes(c[4])) problems.push('status? ' + c[0] + ' ' + c[4]);
  drop.add(c[3]);
  set.set(c[2], { st: c[4], ref: c[5] });
}
for (const k of set.keys()) if (drop.has(k)) problems.push('kept id is also dropped: ' + k);
for (const [k, v] of set) { const [f, i] = idOf(k); const c = lines[f][i].split('\t'); c[3] = v.st; c[4] = v.ref; lines[f][i] = c.join('\t'); }
let dropped = 0;
for (const k of drop) { const [f, i] = idOf(k); if (lines[f][i] && !lines[f][i].startsWith('#')) { lines[f][i] = ''; dropped++; } }
for (const f of files) writeFileSync(`${DIR}/m/${f}`, lines[f].filter((x) => x !== '').join('\n') + '\n');
console.log(`same=${same} diff=${diff} dropped=${dropped} problems=${problems.length}`);
for (const p of problems) console.log('✖ ' + p);
