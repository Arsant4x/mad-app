import { describe, expect, it, vi } from 'vitest';
import { buildPhase1Qr, decodePhase1Qr, tlv } from './zatcaQr';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.2 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

/**
 * `ق-١٨٨` — الوسوم الخمسة على الجهاز، **وبطول البايتات لا الحروف**.
 *
 * الحالة العربية ذاتُ وجهَين بالضرورة: بايتُ الطول يساوي عددَ البايتات
 * **ولا يساوي** عددَ الحروف — فدالةٌ تعدّ الحروف تسقط في الوجه الثاني حتماً.
 */
describe('رمز الهيئة للمرحلة الأولى على الجهاز', () => {
  const issued = { date: '2026-09-05', time: '01:15:00' };

  it('🔴 طولُ الوسم بالبايتات — نصٌّ عربي: البايتات ≠ الحروف', () => {
    const name = 'شركة الأفق';
    const bytes = tlv(1, name);
    const utf8Len = new TextEncoder().encode(name).length;
    expect(bytes[0]).toBe(1);
    expect(bytes[1]).toBe(utf8Len);
    expect(bytes[1]).not.toBe(name.length); // الوجه الثاني — عدُّ الحروف كان سيمرّ هنا كذباً
    expect(utf8Len).toBeGreaterThan(name.length);
  });

  it('الوسوم الخمسة بترتيب الهيئة وقيمها — والطابع من ساعة الجهاز حرفاً', () => {
    const qr = buildPhase1Qr({ sellerName: 'مؤسسة الإيصال', vatNumber: '300000000000003', issued, total: 115, vatAmount: 15 })!;
    const fields = decodePhase1Qr(qr);
    expect(fields[1]).toBe('مؤسسة الإيصال');
    expect(fields[2]).toBe('300000000000003');
    expect(fields[3]).toBe('2026-09-05T01:15:00');
    expect(fields[4]).toBe('115.00');
    expect(fields[5]).toBe('15.00');
  });

  it('المبالغ بمنزلتَين بعد التدوير — لا ذيلَ عائمٍ على الإيصال', () => {
    // 100 × 1.15 في العائم = 114.99999999999999 — يجب أن يُكتب 115.00 لا 114.99.
    const qr = buildPhase1Qr({ sellerName: 'X', vatNumber: '3', issued, total: 100 * 1.15, vatAmount: 100 * 0.15 })!;
    const fields = decodePhase1Qr(qr);
    expect(fields[4]).toBe('115.00');
    expect(fields[5]).toBe('15.00');
  });

  it('لا رمزَ وهميّاً: ملفٌ بلا اسمٍ قانوني أو رقمٍ ضريبي ⇒ null', () => {
    expect(buildPhase1Qr({ sellerName: '', vatNumber: '300000000000003', issued, total: 1, vatAmount: 0 })).toBeNull();
    expect(buildPhase1Qr({ sellerName: 'X', vatNumber: '   ', issued, total: 1, vatAmount: 0 })).toBeNull();
    expect(buildPhase1Qr({ sellerName: null, vatNumber: undefined, issued, total: 1, vatAmount: 0 })).toBeNull();
  });
});
