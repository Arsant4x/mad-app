// Registries and index: docs/engines.md, docs/decisions.md and docs/INDEX.md.
// A number is reserved from a registry, never chosen. The gate fails when:
//   1. an engine id L<layer>-<n> cited in docs/plans is not in engines.md;
//   2. an id appears twice in either registry;
//   3. a file in docs/plans has no index row, or an index row has no file.
//
// It leans to false alarms over false silence: an unindexed plan or an
// unreserved number alarms, and an alarm costs a minute to read.
//
// Limit: decision ids are only checked for uniqueness in the registry, not as
// citations in plans, because older plans reuse the same symbol for local
// constraints. The local C1 to C18 scheme declared in engines.md is not checked.
//
// Moved from apps/api/src/common/registry-numbering.spec.ts so the work method
// gates run apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './repo.mjs';

const DOCS = join(REPO, 'docs');
const PLANS = join(DOCS, 'plans');

const read = (p) => readFileSync(p, 'utf8');

/** Engine ids: an explicit Latin range, independent of the shell locale. */
const ENGINE_ID = /\bL[0-4]-[0-9]{1,2}\b/g;
/** Decision ids: Arabic digits are mapped to Latin before comparing. */
const DECISION_ID = /ق-([0-9]+|[٠-٩]+)/g;
const toLatin = (s) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/**
 * Registered ids: those in the first table cell inside code or bold spans,
 * not in prose and not as bare text (summary tables cite ids bare on purpose).
 * Every span in the cell is read, not only the first.
 */
export function registeredIds(markdown, idRe) {
  const ids = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const firstCell = line.split('|')[1] ?? '';
    const spans = [...firstCell.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)].map((m) => m[1] ?? m[2] ?? '');
    const seen = new Set();
    for (const span of spans) for (const id of span.match(idRe) ?? []) seen.add(toLatin(id));
    ids.push(...seen);
  }
  return ids;
}

/** Every engine id mentioned in the plan documents, wherever it appears. */
export function citedEngineIds(dir) {
  const where = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
    const text = read(join(dir, f));
    for (const id of new Set(text.match(ENGINE_ID) ?? [])) {
      where.set(id, [...(where.get(id) ?? []), f]);
    }
  }
  return where;
}

/** File names the index links under plans/. */
export function indexedFiles(indexMd) {
  return [...indexMd.matchAll(/\]\(plans\/([^)]+)\)/g)].map((m) => decodeURIComponent(m[1]));
}

const dup = (xs) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

describe('registries and index: a number is reserved, never chosen', () => {
  const engines = read(join(DOCS, 'engines.md'));
  const decisions = read(join(DOCS, 'decisions.md'));
  const index = read(join(DOCS, 'INDEX.md'));
  const plans = readdirSync(PLANS).filter((n) => n.endsWith('.md')).sort();

  it('reads a non-empty surface', () => {
    assert.ok(plans.length >= 53, `plans: ${plans.length}`);
    assert.ok(registeredIds(engines, ENGINE_ID).length >= 64);
    assert.ok(registeredIds(decisions, DECISION_ID).length >= 18);
  });

  it('1. every engine id cited in docs/plans is registered in engines.md', () => {
    const registered = new Set(registeredIds(engines, ENGINE_ID));
    const offenders = [...citedEngineIds(PLANS)]
      .filter(([id]) => !registered.has(id))
      .map(([id, files]) => `${id} <- ${files.join(', ')}`);
    assert.deepEqual(offenders, []);
  });

  it('2. no id appears twice in engines.md or decisions.md', () => {
    assert.deepEqual(dup(registeredIds(engines, ENGINE_ID)), []);
    assert.deepEqual(dup(registeredIds(decisions, DECISION_ID)), []);
  });

  it('3. the index and docs/plans match in both directions', () => {
    const indexed = indexedFiles(index).sort();
    const missingFromIndex = plans.filter((f) => !indexed.includes(f));
    const missingOnDisk = indexed.filter((f) => !plans.includes(f));
    assert.deepEqual({ missingFromIndex, missingOnDisk }, { missingFromIndex: [], missingOnDisk: [] });
  });

  it('the extractors hit what they must and miss what they must', () => {
    const sample = '| `L2-19` | التذكيرات | 4 |\n| `L2-19` | مكرَّر | 1 |\nنثرٌ يذكر L9-99 لا يُحتسب مسجَّلاً\n| **ق-١ — التكلفة** | يحجب | 12 |\n| **ق-1 — مكرَّر بلاتيني** | x | 0 |';
    assert.deepEqual(registeredIds(sample, ENGINE_ID), ['L2-19', 'L2-19']);
    assert.deepEqual(dup(registeredIds(sample, ENGINE_ID)), ['L2-19']);
    assert.deepEqual(registeredIds(sample, DECISION_ID), ['ق-1', 'ق-1']);
    assert.deepEqual(indexedFiles('[`a.md`](plans/a.md) · [x](other/b.md)'), ['a.md']);
    // A bold span holding an inner code span without a number: the number is read from the bold span.
    assert.deepEqual(registeredIds('| **ق-٥ — تعدد الأنشطة (`SPEC §15.9`)** | x |', DECISION_ID), ['ق-5']);
    assert.deepEqual(registeredIds('| L2-19 نصٌّ مجرَّد | إحالة |', ENGINE_ID), []);
  });
});
