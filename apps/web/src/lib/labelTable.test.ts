import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { SECTOR_LABELS } from '../api/activities';
import { BANK_KIND_LABEL } from '../api/banks';
import { BUYER_ID_SCHEME_LABEL, CUSTOMER_KIND_LABEL } from '../api/customers';
import { KIND_LABELS } from '../api/integrations';
import { ACTION_LABELS, SCREEN_LABELS } from '../api/templates';
import { BATCH_FEFO_DECLARED_LIMITS } from './batchLimits';
import { writtenValue } from './labelTable';
import { UNITS_OF_MEASURE, unitLabel } from './units';
import { BUYER_DEPENDENT_LIMIT, EXEMPTION_REASONS, TAX_CATEGORY_OPTIONS, buyerDependentLimit, exemptionReasonLabel, taxBadgeOf } from './vat';

// File budget: pure reads of tables and translation files, well under the default.
vi.setConfig({ testTimeout: 5_000 });

afterEach(async () => {
  await i18n.changeLanguage('ar');
});

describe('label tables translate when read', () => {
  it('show the Arabic text written in the source when the interface is Arabic', () => {
    // The Arabic kept in the source is compared with the server's lists; the shown text must be the same.
    for (const [key, value] of Object.entries(SCREEN_LABELS)) expect(value).toBe(writtenValue(SCREEN_LABELS, key));
    for (const [key, value] of Object.entries(SECTOR_LABELS)) expect(value).toBe(writtenValue(SECTOR_LABELS, key));
    for (const u of UNITS_OF_MEASURE) expect(u.ar).toBe(writtenValue(u, 'ar'));
    for (const r of EXEMPTION_REASONS) expect(r.ar).toBe(writtenValue(r, 'ar'));
    BATCH_FEFO_DECLARED_LIMITS.forEach((l, i) => expect(l).toBe(writtenValue(BATCH_FEFO_DECLARED_LIMITS, i)));
    expect(Object.keys(SCREEN_LABELS)).toHaveLength(25);
    expect(UNITS_OF_MEASURE).toHaveLength(23);
    expect(EXEMPTION_REASONS).toHaveLength(16);
  });

  it('follow a language switch without reloading, and keep keys and entries', async () => {
    await i18n.changeLanguage('en');
    expect(SCREEN_LABELS.contracts).toBe('Lease contracts');
    expect(ACTION_LABELS.view).toBe('View');
    expect(SECTOR_LABELS.PHARMACY).toBe('Pharmacy');
    expect(BANK_KIND_LABEL.CASH_BOX).toBe('Cash box');
    expect(CUSTOMER_KIND_LABEL.NATURAL).toBe('Individual');
    expect(BUYER_ID_SCHEME_LABEL['700']).toBe('Unified number 700');
    expect(Object.entries(KIND_LABELS)).toEqual([
      ['PAYMENT_GATEWAY', 'Payment gateway (POS terminals)'],
      ['BNPL', 'Buy now, pay later'],
      ['ECOMMERCE', 'Online store'],
    ]);
    expect(unitLabel('KGM')).toBe('kilogram');
    expect(BATCH_FEFO_DECLARED_LIMITS[0]).toMatch(/^Declared limit 1:/);
    expect(TAX_CATEGORY_OPTIONS[0].label).toBe('Standard rate (S) — 15%');
    expect(exemptionReasonLabel('VATEX-SA-35')).toBe('VATEX-SA-35 · Medicines and medical equipment');
    expect(taxBadgeOf({ taxCategory: 'O' }).text).toBe('O · Out of scope');
    expect(buyerDependentLimit()).toMatch(/^Buyer dependent categories/);
    // No table holds an untranslated key.
    for (const table of [SCREEN_LABELS, ACTION_LABELS, SECTOR_LABELS, BANK_KIND_LABEL, CUSTOMER_KIND_LABEL, BUYER_ID_SCHEME_LABEL, KIND_LABELS]) {
      for (const v of Object.values(table)) expect(v).not.toMatch(/^labels\./);
    }
    await i18n.changeLanguage('ar');
    expect(SCREEN_LABELS.contracts).toBe('عقود الإيجار');
  });

  it('read the text once at load for the constant kept for older callers', () => {
    expect(BUYER_DEPENDENT_LIMIT).toBe(buyerDependentLimit());
    expect(BUYER_DEPENDENT_LIMIT).not.toMatch(/^common\./);
  });
});
