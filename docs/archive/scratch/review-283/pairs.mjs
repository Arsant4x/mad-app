// يولّد أزواجاً مرشّحة للتكرار عبر ملفّات المُدمِجين: اسمٌ واحد بعد نزع الحركات، أو تشابهُ كلماتٍ عالٍ.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const DIR = 'D:/mad-app-scratch/review-283';
const bare = (s) => s.replace(/[\u064B-\u0652\u0640]/g, '').replace(/[«»()،,.:؛]/g, ' ');
const STOP = new Set(['في', 'من', 'على', 'إلى', 'الى', 'و', 'أو', 'لا', 'مع', 'عن', 'بلا', 'ال', 'كل', 'لكل', 'ما']);
const toks = (s) => new Set(bare(s).split(/\s+/).map((w) => w.replace(/^(وال|بال|لل|فال|ال|و)/, '')).filter((w) => w.length > 1 && !STOP.has(w)));
const rows = [];
for (const f of readdirSync(DIR).filter((n) => /^final-\d+\.tsv$/.test(n)).sort()) {
  readFileSync(`${DIR}/${f}`, 'utf8').split(/\r?\n/).forEach((l, i) => {
    if (!l.trim() || l.startsWith('#')) return;
    const c = l.split('\t');
    rows.push({ id: `${f.replace('final-', 'F').replace('.tsv', '')}:${i + 1}`, f, sec: c[0], name: c[1], expl: c[2], st: c[3], ref: c[4], t: toks(c[1]), r: new Set((c[4].match(/ق-[٠-٩]+/g) || [])) });
  });
}
const pairs = [];
for (let a = 0; a < rows.length; a++) for (let b = a + 1; b < rows.length; b++) {
  const A = rows[a], B = rows[b];
  if (A.f === B.f) continue;
  const inter = [...A.t].filter((x) => B.t.has(x)).length;
  const jac = inter / (A.t.size + B.t.size - inter || 1);
  const sharedRef = [...A.r].filter((x) => B.r.has(x)).length;
  if (bare(A.name).trim() === bare(B.name).trim() || jac >= 0.5 || (jac >= 0.3 && sharedRef > 0)) pairs.push([A, B, jac.toFixed(2), sharedRef]);
}
const fmt = (x) => `${x.id} [${x.sec}] «${x.name}» · ${x.st} · ${x.expl} · ${x.ref}`;
writeFileSync(`${DIR}/pairs.txt`, pairs.map(([A, B, j, s], k) => `P${k + 1} jac=${j} refs=${s}\n  A ${fmt(A)}\n  B ${fmt(B)}`).join('\n') + '\n');
console.log('rows', rows.length, 'pairs', pairs.length);
