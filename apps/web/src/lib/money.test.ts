import { describe, expect, it } from 'vitest';
import { formatMoney, num, num0, round2, roundMoney, sumMoney } from './money';

/** مرآة اختبارات الخادم (`rounding.spec.ts`) — إن افترقت السياستان افترق ما يراه المستخدم عمّا يُحفظ. */
describe('تدوير الواجهة = تدوير الخادم', () => {
  it('حدّ IEEE-754: 1.005 تعطي 1.01، وعلى المقادير الكبيرة كذلك', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1234567.005)).toBe(1234567.01);
    expect(Math.round(1.005 * 100) / 100).toBe(1); // ما كانت الشاشات تحسبه
  });

  it('متناظرٌ حول الصفر: التخصيص العكسي يردّ ما خُصّص بالضبط', () => {
    for (const x of [1.005, 0.125, 0.375, 2.5, 0.015, 12345.675]) expect(round2(-x)).toBe(-round2(x));
    expect(round2(-0.125)).toBe(-0.13);
    expect(Math.round(-12.5)).toBe(-12); // العيب القديم
  });

  it('لا صفرٌ سالب، والخانات تُحترم، والنصّ بعد التدوير', () => {
    expect(Object.is(round2(-0.001), 0)).toBe(true);
    expect(roundMoney(1.23456789, 3)).toBe(1.235);
    expect(formatMoney(1.005)).toBe('1.01');
    expect(formatMoney(-0.001)).toBe('0.00');
    expect(formatMoney(280)).toBe('280.00');
  });
});

describe('② المالُ نصّاً — القراءةُ رقماً (ق-١٢٣٥)', () => {
  it('num: النصُّ العشريُّ رقماً، والرقمُ كما هو، والغائبُ والفارغُ والفاسدُ null لا صفراً', () => {
    expect(num('1500.00')).toBe(1500);
    expect(num('-12.35')).toBe(-12.35);
    expect(num(' 0.125 ')).toBe(0.125);
    expect(num(7)).toBe(7);
    expect(num(null)).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num('')).toBeNull();
    expect(num('abc')).toBeNull();
    expect(num(Number.NaN)).toBeNull();
  });

  it('num0: الغائبُ صفر — للمجاميع والمقارنات التي صفرُها صحيح', () => {
    expect(num0(null)).toBe(0);
    expect(num0('99.50')).toBe(99.5);
  });

  it('sumMoney: يجمع نصوصاً وأرقاماً وغياباً بتدوير السياسة — لا وصلاً (`"100.00" + "50.00"` ليس 150)', () => {
    expect(sumMoney(['100.00', '50.00'])).toBe(150);
    expect('100.00' + '50.00').toBe('100.0050.00'); // ما يمنعه الحارسُ الشجريّ
    expect(sumMoney(['0.10', '0.20'])).toBe(0.3); // لا 0.30000000000000004
    expect(sumMoney(['1.005', null, 2])).toBe(3.01);
    expect(sumMoney([])).toBe(0);
  });
});
