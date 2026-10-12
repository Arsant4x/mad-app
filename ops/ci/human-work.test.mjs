// Each face of the "human work" gate is proven with a likely way to break it,
// and with a healthy case that must pass.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addedLines, appliesTo, commentPart, isGitMergeOfMain, lineProblems, messageProblems } from './human-work.mjs';

const TS = 'apps/api/src/invoices/invoices.service.ts';
const TSX = 'apps/web/src/pages/InvoicesPage.tsx';
const SQL = 'apps/api/prisma/migrations/20261012000000_x/migration.sql';

describe('added code lines', () => {
  it('catches an emoji', () => {
    assert.deepEqual(lineProblems('  // ✅ totals match the ledger', TS), ['emoji']);
    assert.ok(lineProblems("  const banner = '⚠️ ' + note;", TSX).includes('emoji'));
  });

  it('catches a decision reference', () => {
    assert.ok(lineProblems("  const LIMIT = 5; // see ق-1350", TS).includes('decision reference'));
    assert.ok(lineProblems("  throw new Error('blocked by ق-١٦٨٠');", TS).includes('decision reference'));
  });

  it('catches a work method word', () => {
    assert.deepEqual(lineProblems('  // Added for directive 289', TS), ['work method word']);
    assert.deepEqual(lineProblems('  // Claude: keep this branch', TS), ['work method word']);
  });

  it('catches Arabic in a comment, in every comment form', () => {
    assert.deepEqual(lineProblems('  const total = sum(lines); // يحسب الضريبة مرّة واحدة', TS), ['Arabic in a comment']);
    assert.deepEqual(lineProblems(' * يُرجع المجموع بعد الضريبة', TS), ['Arabic in a comment']);
    assert.deepEqual(lineProblems('      {/* زرّ الحفظ */}', TSX), ['Arabic in a comment']);
    assert.deepEqual(lineProblems('-- إنشاء جدول الفواتير', SQL), ['Arabic in a comment']);
  });

  it('passes healthy lines', () => {
    assert.deepEqual(lineProblems("  const url = 'https://example.com/a'; // compute the tax once", TS), []);
    assert.deepEqual(lineProblems("  const label = 'تحذير';", TSX), []);
    assert.deepEqual(lineProblems('-- create the invoices table', SQL), []);
    assert.deepEqual(lineProblems("  RAISE WARNING 'تُعدّ الصفوف: %', n;", SQL), []);
    assert.equal(commentPart("  const s = 'a // not a comment';", TS), '');
  });

  it('applies to product code only, and skips the text catalogues', () => {
    assert.equal(appliesTo(TS), true);
    assert.equal(appliesTo(SQL), true);
    assert.equal(appliesTo('apps/web/src/i18n/locales/ar.json'), false);
    assert.equal(appliesTo('apps/web/src/i18n/locales/ar/contracts.json'), false);
    assert.equal(appliesTo('apps/api/src/common/i18n/messages.ts'), false);
    assert.equal(appliesTo('docs/decisions.md'), false);
    assert.equal(appliesTo('ops/ci/attribution-check.mjs'), false);
  });
});

describe('commit messages and pull request titles', () => {
  it('passes a short English conventional subject, with or without a squash suffix', () => {
    assert.deepEqual(messageProblems('feat(web): add the language switcher'), []);
    assert.deepEqual(messageProblems('fix(deps): bump handlebars to 4.7.10 for two critical advisories (#858)'), []);
    assert.deepEqual(messageProblems('chore: tidy\n\nLonger English body is fine.'), []);
  });

  it('catches a subject that is not type(scope): subject', () => {
    assert.ok(messageProblems('Update README.md').includes('subject is not "type(scope): subject"'));
  });

  it('catches Arabic', () => {
    assert.ok(messageProblems('docs(السجل): تسجيل القرارات').includes('not English'));
  });

  it('catches a long subject', () => {
    assert.ok(messageProblems(`feat(web): ${'a'.repeat(70)}`).includes('subject longer than 72 characters'));
  });

  it('catches an emoji, a decision reference and a work method word', () => {
    assert.ok(messageProblems('fix: make it green ✅').includes('emoji'));
    assert.ok(messageProblems('chore: apply ق-1680').includes('decision reference'));
    assert.ok(messageProblems('docs(registry): record decisions for directive 289').includes('work method word'));
    assert.ok(messageProblems('fix(api): guard\n\nWritten with Claude').includes('work method word'));
  });
});

describe('git merge of main into a branch', () => {
  it('skips only the subject git writes when main is merged in', () => {
    assert.equal(isGitMergeOfMain("Merge remote-tracking branch 'origin/main' into ci/289-human-work"), true);
    assert.equal(isGitMergeOfMain("Merge branch 'main' into feat/x"), true);
    assert.equal(isGitMergeOfMain("Merge branch 'feature' into main"), false);
    assert.equal(isGitMergeOfMain('Merge everything for directive 289'), false);
  });
});

describe('diff parsing', () => {
  it('reads added lines with their file and line number', () => {
    const diff = [
      'diff --git a/apps/x.ts b/apps/x.ts',
      '--- a/apps/x.ts',
      '+++ b/apps/x.ts',
      '@@ -3,0 +4,2 @@',
      '+const a = 1;',
      '+// note',
      'diff --git a/apps/y.ts b/apps/y.ts',
      '--- a/apps/y.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-gone',
    ].join('\n');
    assert.deepEqual(addedLines(diff), [
      { path: 'apps/x.ts', line: 4, text: 'const a = 1;' },
      { path: 'apps/x.ts', line: 5, text: '// note' },
    ]);
  });
});
