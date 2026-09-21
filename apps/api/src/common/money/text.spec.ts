import { Prisma } from '@prisma/client';
import { SCALE } from './rounding';
import { money, moneyText, numericText, percentText, qty, qtyText, rateText, TEXT_SCALE } from './text';

/**
 * **المالُ نصّاً بدقّة صنفه** (`ق-١٢٣٥`) — الآليةُ وحدَها: الدقّةُ من جدول التدوير، والتدويرُ بسياسته (نصفٌ بعيداً
 * عن الصفر على القيمة العشرية)، والغائبُ `null`، والفاسدُ خطأٌ لا نصّ.
 */
describe('numericText — الدقّةُ صفةُ الصنف', () => {
  it('الدقّاتُ الأربع تُقرأ من SCALE لا تُكتب: مالٌ 2 · كمّيةٌ 3 · سعرُ صرفٍ 6 · نسبةٌ 2', () => {
    expect(TEXT_SCALE).toEqual({ money: SCALE.INVOICE_TOTAL, quantity: SCALE.DERIVED_QUANTITY, rate: SCALE.EXCHANGE_RATE, percent: SCALE.PERCENT });
    expect(TEXT_SCALE).toEqual({ money: 2, quantity: 3, rate: 6, percent: 2 });
  });

  it('كلُّ صنفٍ بخاناته الثابتة — والكمّيةُ لا تُقصّ إلى خانتين (0.125 كيلو تبقى 0.125)', () => {
    expect(moneyText(1234.5)).toBe('1234.50');
    expect(qtyText(0.125)).toBe('0.125');
    expect(rateText(3.75)).toBe('3.750000');
    expect(percentText(15)).toBe('15.00');
  });

  it('التدويرُ بسياسة الخادم لا بـtoFixed الخام: 1.005 ⟵ 1.01، و-12.345 ⟵ -12.35 (نصفٌ بعيداً عن الصفر)', () => {
    // `(1.005).toFixed(2)` في JavaScript تعطي "1.00" — حدُّ IEEE-754 الذي أُصلح في كنسة التدوير.
    expect(moneyText(1.005)).toBe('1.01');
    expect(moneyText(-12.345)).toBe('-12.35');
    expect(moneyText(12.345)).toBe('12.35');
    expect(qtyText(2.0005)).toBe('2.001');
  });

  it('المدخلُ: رقمٌ أو Decimal من القاعدة أو نصٌّ رقميّ — والنتيجةُ واحدة', () => {
    expect(moneyText(new Prisma.Decimal('99.999'))).toBe('100.00');
    expect(moneyText('99.999')).toBe('100.00');
    expect(moneyText(99.999)).toBe('100.00');
  });

  it('الغائبُ يبقى غائباً: null و undefined والنصُّ الفارغ ⟵ null — لا صفراً صامتاً', () => {
    expect(moneyText(null)).toBeNull();
    expect(moneyText(undefined)).toBeNull();
    expect(moneyText('   ')).toBeNull();
    expect(qtyText(null)).toBeNull();
  });

  it('⛔ الفاسدُ خطأٌ لا نصّ: NaN و Infinity ونصٌّ غيرُ رقميّ', () => {
    expect(() => moneyText(Number.NaN)).toThrow(TypeError);
    expect(() => moneyText(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => moneyText('abc')).toThrow(TypeError);
  });

  it('لا صفرَ سالب: -0.001 مالاً ⟵ "0.00" لا "-0.00"', () => {
    expect(moneyText(-0.001)).toBe('0.00');
    expect(numericText(-0.0004, 'quantity')).toBe('0.000');
  });

  it('الصيغةُ الواجبة (money · qty) لا تقبل غائباً: تُرجع نصّاً أو ترمي', () => {
    expect(money(0)).toBe('0.00');
    expect(qty(0)).toBe('0.000');
    expect(() => money('')).toThrow(TypeError);
  });
});
