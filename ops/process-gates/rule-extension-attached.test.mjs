// A decision that extends an existing rule is attached to that rule in
// CLAUDE.md, or the gate fails. It reads registry rows whose title names a
// family ("عائلة §8.N" or "§8.N بوجه") and requires the decision number inside
// the "### 8.N" section of CLAUDE.md.
//
// Limit: a decision that extends a rule without naming it in its title is not
// seen; naming the family in the title is the contract.
//
// Moved from apps/api/src/common/rule-extension-attached.spec.ts so the work
// method gates run apart from the product tests.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REPO } from './repo.mjs';

const latin = (s) => s.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48));

/** Registry rows whose title names a family. */
export function familyExtensions(decisionsMd) {
  const out = [];
  for (const line of decisionsMd.split(/\r?\n/)) {
    if (!line.startsWith('| **')) continue;
    const title = line.split('|')[1] ?? '';
    const id = title.match(/ق-[٠-٩0-9]+/)?.[0];
    const fam = title.match(/عائلة\s+§8\.(\d+)|§8\.(\d+)\s+بوجه/);
    if (id && fam) out.push({ id, section: fam[1] ?? fam[2] });
  }
  return out;
}

/** Text of section "### 8.N" in CLAUDE.md up to the next "###", or null. */
export function sectionText(claudeMd, section) {
  const lines = claudeMd.split(/\r?\n/);
  const heading = new RegExp(`^###\\s+(?:\\S+\\s+)?8\\.${section}(?!\\d)`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** Decisions that name a family but are not mentioned in its section. */
export function unattached(decisionsMd, claudeMd) {
  return familyExtensions(decisionsMd)
    .filter(({ id, section }) => {
      const text = sectionText(claudeMd, section);
      return text === null || !latin(text).includes(latin(id));
    })
    .map(({ id, section }) => `${id} يسمّي §8.${section} ولا يُذكَر فيها`);
}

describe('a decision that extends a rule is attached to it in CLAUDE.md', () => {
  const decisionsMd = readFileSync(`${REPO}/docs/decisions.md`, 'utf8');
  const claudeMd = readFileSync(`${REPO}/CLAUDE.md`, 'utf8');

  it('the detector catches a named family and leaves an unnamed one', () => {
    const rows = ['| **ق-٩٠٠ — عائلة §8.7: مثالٌ** | حكم |', '| **ق-٩٠١ — §8.3 بوجهٍ ثانٍ: مثال** | حكم |', '| **ق-٩٠٢ — قرارٌ بلا عائلة** | حكم |'].join('\n');
    assert.deepEqual(familyExtensions(rows), [
      { id: 'ق-٩٠٠', section: '7' },
      { id: 'ق-٩٠١', section: '3' },
    ]);
    const claude = ['### 8.7 عائلة', 'الوجه (ق-900)', '### 8.3 أخرى', 'لا شيء هنا', '### 8.4'].join('\n');
    assert.deepEqual(unattached(rows, claude), ['ق-٩٠١ يسمّي §8.3 ولا يُذكَر فيها']);
    assert.deepEqual(unattached(rows, '### 8.7 فقط'), ['ق-٩٠٠ يسمّي §8.7 ولا يُذكَر فيها', 'ق-٩٠١ يسمّي §8.3 ولا يُذكَر فيها']);
    assert.ok(sectionText(claude, '7').includes('الوجه (ق-900)'));
    assert.ok(!sectionText(claude, '7').includes('أخرى'));
    assert.equal(sectionText(claude, '9'), null);
  });

  it('reads a non-empty surface: families are named and numbered sections are found', () => {
    assert.ok(familyExtensions(decisionsMd).length >= 2);
    assert.notEqual(sectionText(claudeMd, '7'), null);
    assert.notEqual(sectionText(claudeMd, '11'), null);
  });

  it('every decision that names a family is mentioned in its section', () => {
    assert.deepEqual(unattached(decisionsMd, claudeMd), []);
  });
});
