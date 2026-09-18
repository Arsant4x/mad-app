import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../source-scan.util';
import { UNITS_OF_MEASURE, isUnitCode, unitLabel } from './units';

// يقرأ ملفَّ الواجهة نصّاً لأن **بياناتِه** سلاسلُ معلَنة (رموزُ الوحدات وأسماؤها) — إعلانُ الصنف (ق-٣٧٥).
readsDeclaredStrings();

/**
 * ① وحداتُ القياس — القائمةُ مغلقةٌ ومكرَّرةٌ في الواجهة بيد (`apps/web/src/lib/units.ts`)؛
 * والنسخُ اليدويّ يتخلّف بصمت (دَينُ توليد التعدادات، `§4`). فهذا الحارس يقرأ ملفَّ الواجهة نصّاً
 * ويوجب أن يحمل الرموزَ نفسَها بالترتيب نفسِه وبالأسماء العربية نفسِها.
 */
describe('وحداتُ القياس المرمَّزة (① · ق-١٠٦٩)', () => {
  it('الرموزُ فريدة، وكلُّ رمزٍ من التوصية 20 بشكله (أحرفٌ وأرقام كبيرة، 2–3 خانات)', () => {
    const codes = UNITS_OF_MEASURE.map((u) => u.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z0-9]{2,3}$/);
    expect(codes).toContain('H87');
    // مثالُ الهيئة `PCE` ليس في القائمة التي توصي بها — فلا يُقبل إعلاناً (يُوثَّق لا يُقبل).
    expect(isUnitCode('PCE')).toBe(false);
    expect(isUnitCode('H87')).toBe(true);
    expect(isUnitCode('')).toBe(false);
    expect(isUnitCode(null)).toBe(false);
  });

  it('لكلِّ رمزٍ اسمٌ عربيّ واسمٌ إنجليزيّ غيرُ فارغين', () => {
    for (const u of UNITS_OF_MEASURE) {
      expect(u.ar.trim().length).toBeGreaterThan(0);
      expect(u.en.trim().length).toBeGreaterThan(0);
    }
    expect(unitLabel('KGM')).toBe('كيلوغرام');
    expect(unitLabel('KGM', 'en')).toBe('kilogram');
    expect(unitLabel(null)).toBeNull();
    expect(unitLabel('ZZZ')).toBeNull();
  });

  it('نسخةُ الواجهة تطابق الخادم رمزاً رمزاً وبالترتيب والاسم العربيّ', () => {
    const webFile = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'lib', 'units.ts');
    const text = readFileSync(webFile, 'utf8');
    const rows = [...text.matchAll(/\{\s*code:\s*'([A-Z0-9]+)',\s*ar:\s*'([^']+)'\s*\}/g)].map((m) => ({ code: m[1], ar: m[2] }));
    // حارسٌ للحارس: قرأ شيئاً فعلاً — لا يمرّ على ملفٍّ فارغ أو نمطٍ لا يطابق.
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows).toEqual(UNITS_OF_MEASURE.map((u) => ({ code: u.code, ar: u.ar })));
  });
});
