import { describe, expect, it } from 'vitest';
import { formatMoney, round2, roundMoney } from './money';

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
