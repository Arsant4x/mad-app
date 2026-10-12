// Head rule: docs/decisions.md holds decisions only. Tasks, session notes and
// run results go to the session facts file. This gate fails on a registry row
// numbered after 1644 whose title is one of the two task kinds the owner named:
// "session directive" or "directive results", or a title that starts with
// "directive" and a number. Diacritics are stripped before matching.
//
// Limit: it reads the title only. A task row with another title passes, so the
// author still applies the rule's third test ("would this still hold after the
// task ends?").
//
// Moved from apps/api/src/common/registry-decisions-only.spec.ts so the work
// method gates run apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPO } from './repo.mjs';

const LAST_BEFORE_RULE = 1644;

const toLatin = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
const bare = (s) => s.replace(/[ً-ْـ]/g, '');

// The third kind only at the start of the title, so a decision that mentions a
// directive number in the middle is not hit.
const TASK_TITLE = /توجيه الجلسة|نتائج (ال)?توجيه|^توجيه\s+[0-9٠-٩]/;

/** Registry rows: the first cell is bold and starts with the decision number. */
export function registryRows(markdown) {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cell = line.split('|')[1] ?? '';
    const m = cell.match(/\*\*[^*]*?ق-([0-9٠-٩]+)\s*—\s*([^*]+)\*\*/);
    if (!m) continue;
    rows.push({ id: Number(toLatin(m[1])), title: bare(m[2]).trim() });
  }
  return rows;
}

export function taskRowsAfterRule(markdown) {
  return registryRows(markdown)
    .filter((r) => r.id > LAST_BEFORE_RULE && TASK_TITLE.test(r.title))
    .map((r) => `ق-${r.id} — ${r.title}`);
}

describe('decisions.md holds decisions only: no task rows after 1644', () => {
  const decisions = readFileSync(`${REPO}/docs/decisions.md`, 'utf8');

  it('reads a non-empty surface that reaches past 1644', () => {
    const rows = registryRows(decisions);
    assert.ok(rows.length >= 1000, `rows: ${rows.length}`);
    assert.ok(rows.some((r) => r.id > LAST_BEFORE_RULE));
    // The known task row before the rule is seen, so titles are read.
    assert.ok(rows.some((r) => r.id === 1612 && TASK_TITLE.test(r.title)));
  });

  it('has no task row after 1644', () => {
    assert.deepEqual(taskRowsAfterRule(decisions), []);
  });

  it('the detector hits what it must and misses what it must', () => {
    const sample = [
      '| **▶️ ق-١٦٥٠ — توجيهُ الجلسة ٢٩٠: أحكامٌ ثم البناء** | x | y | ▶️ |',
      '| **✅ ق-١٦٥١ — نتائجُ توجيه ٢٩٠** | x | y | ✅ |',
      '| **ق-1652 — نتائج التوجيه الأخير** | x | y | ✅ |',
      '| **ق-١٦٥٣ — توجيه ٢٩١: دليلُ الجهاز** | x | y | ▶️ |',
      '| **⚖️ ق-١٦٥٤ — أحكامُ صاحب المشروع على تقرير ٢٩٠** | x | y | ⚖️ |',
      '| **⚖️ ق-١٦٥٥ — حارسٌ يُبنى مع أوّل توجيهٍ يمسّه** | x | y | ⚖️ |',
      '| **⚖️ ق-١٦٥٦ — سلّمُ «الحالة» ثابتٌ (توجيه ٢٨١)** | x | y | ⚖️ |',
      '| **▶️ ق-١٦١٢ — توجيهُ الجلسة ٢٧٧: قبل القاعدة** | x | y | ▶️ |',
    ].join('\n');
    assert.deepEqual(
      taskRowsAfterRule(sample).map((s) => s.split(' — ')[0]),
      ['ق-1650', 'ق-1651', 'ق-1652', 'ق-1653'],
    );
  });
});
