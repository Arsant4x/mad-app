import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.0 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * (ج) `ق-٢٠١`/٢ب — **حدُّ الاستنتاج يُعرَض في التقرير نفسه**: «واقعة مستنتَجة، والفصل
 * N دقيقة» — وN من إعداد المنشأة لا من نصٍّ مكتوب، وإلا عاد الحكم «دقيقتان» ثابتاً
 * في الواجهة وإن صار إعداداً في الخادم.
 */
describe('تقرير وقائع الانقطاع في بطاقة الهيئة', () => {
  const source = readFileSync(resolve(__dirname, 'ZatcaOnboardingCard.tsx'), 'utf8');
  const start = source.indexOf('data-testid="pos-offline-incidents"');

  it('القسم قائم، ويعلن الاستنتاج وحدَّه من الإعداد', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(start).toBeGreaterThan(-1);
    expect(source).toContain('وقائع الانقطاع — مستنتَجة، والفصل {incidents.gapMinutes} دقيقة');
    expect(source).toContain('استنتاجٌ لا قياسٌ');
  });

  it('🔴 ولا يكتب الحدّ نصاً ثابتاً', () => {
    const block = source.slice(start);
    expect(block.length).toBeGreaterThan(500);
    expect(block).not.toMatch(/الفصل دقيقتان|الفصل ٢ دقيقة|الفصل 2 دقيقة/);
  });

  it('🔴 وكل واقعةٍ تعرض حدَّها هي — لا حدَّ اليوم', () => {
    const block = source.slice(start);
    expect(block).toContain('{it.gapMinutes} د');
  });

  it('والحدّ يُعدَّل من الملف — PATCH جزئيّ يحمل الاسم الواجب', () => {
    expect(source).toContain('id="pos-gap-minutes"');
    expect(source).toContain('updateCompanyProfile({ posOfflineGapMinutes: minutes })');
    const api = readFileSync(resolve(__dirname, '..', '..', 'api', 'pos.ts'), 'utf8');
    expect(api).toContain("apiClient.get<PosOfflineIncidents>('/pos/incidents')");
  });
});
