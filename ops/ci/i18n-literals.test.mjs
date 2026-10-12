// The bilingual UI scanner is proven with literals it must find and code it must leave.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, inScope, literals } from './i18n-literals.mjs';

const kinds = (src, path = 'apps/web/src/pages/X.tsx') => literals(src, path).map((h) => h.kind);

describe('i18n literal scanner', () => {
  it('finds direct text a user would see', () => {
    assert.deepEqual(kinds('const A = () => <button>حفظ</button>;'), ['jsx-text']);
    assert.deepEqual(kinds('const A = () => <button>Save</button>;'), ['jsx-text']);
    assert.deepEqual(kinds("const msg = 'تعذّر الحفظ';", 'apps/web/src/lib/x.ts'), ['arabic-string']);
    assert.deepEqual(kinds('const msg = `بقي ${n} يوماً`;', 'apps/web/src/lib/x.ts'), ['arabic-string', 'arabic-string']);
    assert.deepEqual(kinds('const A = () => <input placeholder="Search" />;'), ['visible-attr']);
    assert.deepEqual(kinds("const A = () => <img alt={'شعار'} />;"), ['arabic-string']);
  });

  it('leaves code that is not visible text', () => {
    assert.deepEqual(kinds("const A = () => <button>{t('common.save')}</button>;"), []);
    assert.deepEqual(kinds('const A = () => <div className="row-actions">{n} — {m}</div>;'), []);
    assert.deepEqual(kinds("const url = '/api/invoices';", 'apps/web/src/lib/x.ts'), []);
    assert.deepEqual(kinds('const A = () => <input type="text" name="email" />;'), []);
    assert.deepEqual(kinds("const re = 'ب'; // i18n-exempt: Arabic letter test, not shown", 'apps/web/src/lib/x.ts'), []);
  });

  it('scopes web UI sources only', () => {
    assert.equal(inScope('apps/web/src/pages/ReportsPage.tsx'), true);
    assert.equal(inScope('apps/web/src/lib/statusBadge.ts'), true);
    assert.equal(inScope('apps/web/src/pages/ReportsPage.test.tsx'), false);
    assert.equal(inScope('apps/web/src/i18n/index.ts'), false);
    assert.equal(inScope('apps/api/src/invoices/invoices.service.ts'), false);
  });

  it('reads files from disk: a fixture screen has its two texts and a pure helper has none', () => {
    // A fixture, not a real screen: real screens are converted one by one and would stop being a known case.
    const read = (p) => readFileSync(join(REPO, p), 'utf8');
    assert.deepEqual(literals(read('ops/ci/fixtures/i18n-sample.tsx'), 'ops/ci/fixtures/i18n-sample.tsx').map((h) => h.kind), ['jsx-text', 'visible-attr']);
    assert.equal(literals(read('apps/web/src/lib/money.ts'), 'apps/web/src/lib/money.ts').length, 0);
  });
});
