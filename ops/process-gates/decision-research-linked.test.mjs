// Rule 9 as extended in round 291: every decision is researched from all its aspects
// before it is executed. This gate fails on a registry row numbered from 1705 on that
// does not name an existing research file under docs/research/, or whose research file
// lacks one of the required headings (the nine aspects, the research limit and the
// conclusion).
//
// Limit: it reads that the file exists and carries the headings, not that the research
// is sound or that work stopped when the research contradicted the decision. Those are
// read by hand in every report.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './repo.mjs';

export const FIRST_UNDER_RULE = 1705;

export const REQUIRED_HEADINGS = [
  '## الموضوع',
  '## الحال المقيس في الشيفرة',
  '## ١. الأنظمة السعودية بنصوصها ومصادرها من الجهة نفسها',
  '## ٢. المحاسبة والضريبة',
  '## ٣. الأمن والخصوصية',
  '## ٤. الجانب التقني',
  '## ٥. السوق والمنافسون',
  '## ٦. الفرق بين الأنشطة',
  '## ٧. تجربة المستخدم',
  '## ٨. التشغيل والتكلفة',
  '## ٩. التوسع لدولة أو نشاط أو شركة كبيرة',
  '## جوانبُ ظهر أنها غابت',
  '## حدّ البحث',
  '## الخلاصة',
];

const toLatin = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const RESEARCH_LINK = /`(docs\/research\/[^`\s]+\.md)`/g;

/** Every registry row with the research paths its line names. */
function allRows(markdown) {
  const out = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const m = (line.split('|')[1] ?? '').match(/\*\*[^*]*?ق-([0-9٠-٩]+)\s*—/);
    if (!m) continue;
    out.push({ id: Number(toLatin(m[1])), links: [...line.matchAll(RESEARCH_LINK)].map((x) => x[1]) });
  }
  return out;
}

/** Rows from FIRST_UNDER_RULE on. */
export const rowsUnderRule = (markdown) => allRows(markdown).filter((r) => r.id >= FIRST_UNDER_RULE);

/** Problems for one row; read(path) returns the file text or null when it is absent. */
export function rowProblems(row, read) {
  if (row.links.length === 0) return [`ق-${row.id}: names no docs/research/ file`];
  const problems = [];
  for (const p of row.links) {
    const text = read(p);
    if (text === null) {
      problems.push(`ق-${row.id}: ${p} does not exist`);
      continue;
    }
    const lines = new Set(text.split(/\r?\n/).map((l) => l.trim()));
    const missing = REQUIRED_HEADINGS.filter((h) => !lines.has(h));
    if (missing.length) problems.push(`ق-${row.id}: ${p} lacks ${missing.join(' / ')}`);
  }
  return problems;
}

const readRepo = (p) => {
  const f = join(REPO, p);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};

describe('every decision from 1705 on links its research', () => {
  const decisions = readFileSync(`${REPO}/docs/decisions.md`, 'utf8');

  it('reads a surface that reaches the rule', () => {
    const rows = rowsUnderRule(decisions);
    assert.ok(rows.length >= 13, `rows from ${FIRST_UNDER_RULE}: ${rows.length}`);
    // The reader sees rows before the rule too, so a zero here would not be blindness.
    assert.ok(allRows(decisions).some((r) => r.id === 1704));
  });

  it('each row names an existing research file with every heading', () => {
    const problems = rowsUnderRule(decisions).flatMap((r) => rowProblems(r, readRepo));
    assert.deepEqual(problems, []);
  });

  it('the check hits what it must and misses what it must', () => {
    const full = REQUIRED_HEADINGS.join('\n');
    const files = { 'docs/research/rulings/ok.md': full, 'docs/research/rulings/short.md': REQUIRED_HEADINGS.slice(1).join('\n') };
    const read = (p) => (p in files ? files[p] : null);
    const sample = [
      '| **⚖️ ق-١٧٠٥ — a** | x | **والبحث** في `docs/research/rulings/ok.md` | ✅ |',
      '| **⚖️ ق-١٧٠٦ — b** | x | no link | ✅ |',
      '| **⚖️ ق-١٧٠٧ — c** | x | `docs/research/rulings/missing.md` | ✅ |',
      '| **⚖️ ق-١٧٠٨ — d** | x | `docs/research/rulings/short.md` | ✅ |',
      '| **⚖️ ق-١٧٠٠ — before the rule** | x | no link | ✅ |',
    ].join('\n');
    const rows = rowsUnderRule(sample);
    assert.deepEqual(rows.map((r) => r.id), [1705, 1706, 1707, 1708]);
    const hit = rows.filter((r) => rowProblems(r, read).length > 0).map((r) => r.id);
    assert.deepEqual(hit, [1706, 1707, 1708]);
  });
});
