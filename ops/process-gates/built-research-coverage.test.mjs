// Rule 48: what is built is not complete until it passes its research. This gate reads
// docs/management/scope-register.md and, for every section that has an item marked built
// or in progress, requires a file in docs/research/built/ whose name starts with the two
// digit section number and a dash, that carries every required heading, and whose
// measured table names every such item of the section in its first column.
//
// Limit: it reads that a section has a file covering its items, not that the research is
// true. Every report states which sections were researched.
//
// Arabic text is matched with literal strings only: no character classes or dots.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './repo.mjs';
import { BUILT_EXTRA_HEADINGS, REQUIRED_HEADINGS } from './research-headings.mjs';

export const BUILT_DIR = 'docs/research/built';
export const BUILT_HEADINGS = [...REQUIRED_HEADINGS, ...BUILT_EXTRA_HEADINGS];
const MEASURED = '## الحال المقيس في الشيفرة';
const STATES = ['**مبنيّ**', '**قيد البناء**'];

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const LATIN_DIGITS = '0123456789';
const digitOf = (c) => {
  const a = ARABIC_DIGITS.indexOf(c);
  if (a >= 0) return a;
  const l = LATIN_DIGITS.indexOf(c);
  return l >= 0 && c.length === 1 ? l : -1;
};

/** The number at the head of text followed by a dot, or null. */
function leadingNumber(text) {
  let i = 0;
  let n = 0;
  for (const c of text) {
    const d = digitOf(c);
    if (d < 0) break;
    n = n * 10 + d;
    i += c.length;
  }
  return i > 0 && text[i] === '.' ? { n, rest: text.slice(i + 1) } : null;
}

/** Every number written in text, in either digit set. */
function numbersIn(text) {
  const out = [];
  let n = -1;
  for (const c of `${text} `) {
    const d = digitOf(c);
    if (d >= 0) n = (n < 0 ? 0 : n * 10) + d;
    else if (n >= 0) {
      out.push(n);
      n = -1;
    }
  }
  return out;
}

/** Sections with the numbers of their built and in progress items. */
export function builtItemsBySection(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      const head = leadingNumber(line.slice(3));
      current = head ? { no: head.n, title: head.rest.trim(), items: [] } : null;
      if (current) sections.push(current);
      continue;
    }
    if (!current || !line.startsWith('* ')) continue;
    const head = leadingNumber(line.slice(2));
    if (!head) continue;
    const cells = line.split(' · ').map((s) => s.trim());
    if (STATES.some((s) => cells.includes(s))) current.items.push(head.n);
  }
  return sections;
}

export const filePrefix = (no) => `${String(no).padStart(2, '0')}-`;

/** Item numbers in the first column of the measured table. */
export function measuredItems(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === MEASURED);
  if (start < 0) return new Set();
  const items = new Set();
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    if (!line.startsWith('|')) continue;
    for (const n of numbersIn(line.split('|')[1] ?? '')) items.add(n);
  }
  return items;
}

/**
 * Problems for every section with built items. files maps a file name in the built
 * folder to its text.
 */
export function coverageProblems(sections, files) {
  const names = Object.keys(files);
  const problems = [];
  for (const s of sections) {
    if (s.items.length === 0) continue;
    const prefix = filePrefix(s.no);
    const matches = names.filter((f) => f.startsWith(prefix) && f.endsWith('.md'));
    const label = `section ${s.no} (${s.title})`;
    if (matches.length === 0) {
      problems.push(`${label}: no file ${BUILT_DIR}/${prefix}*.md for items ${s.items.join(', ')}`);
      continue;
    }
    if (matches.length > 1) {
      problems.push(`${label}: more than one file ${matches.join(', ')}`);
      continue;
    }
    const file = matches[0];
    const text = files[file];
    const lines = new Set(text.split(/\r?\n/).map((l) => l.trim()));
    const missing = BUILT_HEADINGS.filter((h) => !lines.has(h));
    if (missing.length) problems.push(`${label}: ${BUILT_DIR}/${file} lacks ${missing.join(' / ')}`);
    const measured = measuredItems(text);
    for (const n of s.items) {
      if (!measured.has(n)) problems.push(`${label}: item ${n} is not in the measured table of ${BUILT_DIR}/${file}`);
    }
  }
  return problems;
}

function readBuiltFolder() {
  const dir = join(REPO, BUILT_DIR);
  if (!existsSync(dir)) return {};
  const files = {};
  for (const f of readdirSync(dir)) {
    if (f === 'README.md' || !f.endsWith('.md')) continue;
    files[f] = readFileSync(join(dir, f), 'utf8');
  }
  return files;
}

describe('every built section of the scope register has its research', () => {
  const register = readFileSync(join(REPO, 'docs/management/scope-register.md'), 'utf8');

  it('reads a surface that reaches the register and the folder', () => {
    const sections = builtItemsBySection(register);
    assert.ok(sections.length >= 20, `sections: ${sections.length}`);
    const items = sections.reduce((sum, s) => sum + s.items.length, 0);
    assert.ok(items >= 500, `built or in progress items: ${items}`);
    // The first item of the first section is built, so states are read.
    assert.ok(sections.find((s) => s.no === 1)?.items.includes(1));
    assert.ok(Object.keys(readBuiltFolder()).length >= 19);
  });

  it('each such section has a file with every heading that names every item', () => {
    assert.deepEqual(coverageProblems(builtItemsBySection(register), readBuiltFolder()), []);
  });

  it('the check hits what it must and misses what it must', () => {
    const sample = [
      '## كيف يُقرأ',
      '* **مبنيّ**: legend line, not an item.',
      '## ١. باب أول',
      '* ١. **بند** · شرح · **مبنيّ** · `x`',
      '* ٢. **بند** · شرح · **قيد البناء** · `x`',
      '* ٣. **بند** · شرح · **مسجَّل** · `x`',
      '## ٢. باب ثان',
      '* ٤. **بند** · شرح · **مبنيّ** · `x`',
      '## ٣. باب بلا مبنيّ',
      '* ٥. **بند** · شرح · **مُسح** · `x`',
    ].join('\n');
    const sections = builtItemsBySection(sample);
    assert.deepEqual(sections.map((s) => [s.no, s.items]), [[1, [1, 2]], [2, [4]], [3, []]]);

    const table = (rows) => [MEASURED, '', '| # | x |', '|---|---|', ...rows.map((r) => `| ${r} | y |`)];
    const full = (rows) => [...BUILT_HEADINGS.filter((h) => h !== MEASURED), ...table(rows)].join('\n');
    assert.deepEqual(coverageProblems(sections, { '01-a.md': full(['١', '2']), '02-b.md': full(['٤']) }), []);

    const problems = coverageProblems(sections, {
      '01-a.md': full(['١']),
      '2-b.md': full(['٤']),
    });
    assert.deepEqual(problems, [
      `section 1 (باب أول): item 2 is not in the measured table of ${BUILT_DIR}/01-a.md`,
      `section 2 (باب ثان): no file ${BUILT_DIR}/02-*.md for items 4`,
    ]);

    const short = coverageProblems(sections.slice(1), { '02-b.md': full(['٤']).replace('## الفرق\n', '') });
    assert.deepEqual(short, [`section 2 (باب ثان): ${BUILT_DIR}/02-b.md lacks ## الفرق`]);

    // A number outside the measured table does not count.
    const outside = coverageProblems(sections.slice(1), { '02-b.md': `${full(['٩'])}\n## الخلاصة\n| ٤ | y |` });
    assert.deepEqual(outside, [`section 2 (باب ثان): item 4 is not in the measured table of ${BUILT_DIR}/02-b.md`]);
  });
});
