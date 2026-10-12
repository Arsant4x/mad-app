import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// File budget: three times its highest measured time under the full suite load, which stays under the default.
// Declared here rather than in the shared config, so a slow file is named instead of hidden.
vi.setConfig({ testTimeout: 5_000 });

const ar = JSON.parse(readFileSync(resolve(__dirname, '../../i18n/locales/ar/company_profile.json'), 'utf8'));

/**
 * The inference threshold is shown in the report itself ("inferred, separation N
 * minutes"), and N comes from the company setting, not from fixed text; otherwise
 * the screen would keep a fixed threshold after the server made it a setting.
 */
describe('تقرير وقائع الانقطاع في بطاقة الهيئة', () => {
  const source = readFileSync(resolve(__dirname, 'ZatcaOnboardingCard.tsx'), 'utf8');
  const start = source.indexOf('data-testid="pos-offline-incidents"');

  it('القسم قائم، ويعلن الاستنتاج وحدَّه من الإعداد', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(start).toBeGreaterThan(-1);
    // The text lives behind translation keys; the Arabic wording is unchanged.
    expect(source).toContain("t('company_profile.zatca.incidents_title', { n: incidents.gapMinutes })");
    expect(ar.zatca.incidents_title).toBe('وقائع الانقطاع — مستنتَجة، والفصل {{n}} دقيقة');
    expect(source).toContain("t('company_profile.zatca.incidents_hint')");
    expect(ar.zatca.incidents_hint).toContain('استنتاجٌ لا قياسٌ');
  });

  it('🔴 ولا يكتب الحدّ نصاً ثابتاً', () => {
    const block = source.slice(start);
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toMatch(/الفصل دقيقتان|الفصل ٢ دقيقة|الفصل 2 دقيقة/);
    expect(ar.zatca.incidents_title).not.toMatch(/الفصل دقيقتان|الفصل ٢ دقيقة|الفصل 2 دقيقة/);
  });

  it('🔴 وكل واقعةٍ تعرض حدَّها هي — لا حدَّ اليوم', () => {
    const block = source.slice(start);
    expect(block).toContain("t('company_profile.zatca.minutes_short', { n: it.gapMinutes })");
    expect(ar.zatca.minutes_short).toBe('{{n}} د');
  });

  it('والحدّ يُعدَّل من الملف — PATCH جزئيّ يحمل الاسم الواجب', () => {
    expect(source).toContain('id="pos-gap-minutes"');
    expect(source).toContain('updateCompanyProfile({ posOfflineGapMinutes: minutes })');
    const api = readFileSync(resolve(__dirname, '..', '..', 'api', 'pos.ts'), 'utf8');
    expect(api).toContain("apiClient.get<PosOfflineIncidents>('/pos/incidents')");
  });
});
