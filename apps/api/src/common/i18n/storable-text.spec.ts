import { formatMessage, MSG } from './messages';
import { STORABLE_TEXT_MAX, storableError, storableText } from './storable-text';

/** البايتُ الصفريّ يُسمّى بالرمز لا يُكتب حرفاً (`ق-٩٧٤`). */
const NUL = String.fromCharCode(0);

describe('storableText / storableError — المصدرُ الواحد لنصٍّ خارجيٍّ يُكتب في القاعدة (ق-٩٨٢)', () => {
  it('يجرّد البايتَ الصفريّ حيثما وقع — أوّلاً ووسطاً وآخراً — ولا يحذف غيرَه', () => {
    expect(storableText(`${NUL}أ${NUL}${NUL}ب ج${NUL}`)).toBe('أب ج');
    expect(storableText('نصٌّ سليم — يبقى كما هو')).toBe('نصٌّ سليم — يبقى كما هو');
  });

  it('يقصّ عند الحدّ الواحد الذي كانت المواضعُ تقصّ عنده كلٌّ على حدة', () => {
    expect(STORABLE_TEXT_MAX).toBe(500);
    expect(storableText('x'.repeat(700))).toHaveLength(500);
    // القصُّ بعد التجريد: الأصفارُ لا تُحسب من الحدّ.
    expect(storableText(NUL.repeat(300) + 'y'.repeat(600))).toBe('y'.repeat(500));
  });

  it('الفارغُ يبقى فارغاً (عمودٌ اختياريّ يُصفَّر)، والرقمُ يصير نصّاً (معرّفُ الهيئة)', () => {
    expect(storableText(null)).toBeNull();
    expect(storableText(undefined)).toBeNull();
    expect(storableText(1234567890123)).toBe('1234567890123');
    expect(storableText(`12${NUL}34`)).toBe('1234');
  });

  it('storableError يحلّ رسالةَ formatMessage (مفتاحٌ وفاصلٌ صفريٌّ ومعامِلات) إلى نصّها العربيّ بلا بايت', () => {
    const raw = formatMessage(MSG.zatca_attempt_failed, { reason: `HTTP 503 ${NUL}— stub` });
    expect(raw).toContain(NUL);
    const stored = storableError(new Error(raw));
    expect(stored).not.toContain(NUL);
    expect(stored).toContain('HTTP 503');
    expect(stored).not.toContain('zatca.attempt_failed');
    expect(storableError('نصٌّ خام')).toBe('نصٌّ خام');
  });
});
