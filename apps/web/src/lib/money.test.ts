import { describe, expect, it, vi } from 'vitest';
import { documentTotals, formatMoney, netTotals, num, num0, round2, roundMoney, roundPercentOf, roundProduct, sumMoney } from './money';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.1 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

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

/** n / d for integers with d > 0, rounded half away from zero: an exact oracle in whole halalas. */
const divideHalfAway = (n: number, d: number) => Math.sign(n) * Math.floor((Math.abs(n) + d / 2) / d);

describe('Net document totals match the server on half halala ties', () => {
  it('roundPercentOf rounds an exact half halala away from zero, keeps the sign and gives no negative zero', () => {
    expect(roundPercentOf(100.3, 15)).toBe(15.05);
    expect(roundPercentOf(-100.3, 15)).toBe(-15.05);
    expect(roundPercentOf(100.2, 15)).toBe(15.03);
    expect(roundPercentOf(33.3, 15)).toBe(5);
    expect(Object.is(roundPercentOf(-0.01, 15), 0)).toBe(true);
    expect(roundPercentOf(1e21, 15)).toBe(1.5e20);
    expect(roundPercentOf(Number.NaN, 15)).toBeNaN();
  });

  it('netTotals gives the stored tax and total on every tie from 0.01 to 10,000.00', () => {
    let checked = 0;
    const misses: string[] = [];
    for (let halalas = 10; halalas <= 1_000_000; halalas += 20) {
      checked++;
      const tax = divideHalfAway(halalas * 15, 100);
      const got = netTotals(halalas / 100, 15);
      if (got.subtotal !== halalas / 100 || got.tax !== tax / 100 || got.total !== (halalas + tax) / 100) misses.push(`${halalas / 100}: ${got.tax} ${got.total}`);
    }
    expect({ checked, misses: misses.length, first: misses.slice(0, 3) }).toEqual({ checked: 50_000, misses: 0, first: [] });
  });

  it('netTotals at a zero rate keeps the rounded net as the total', () => {
    expect(netTotals(100.3, 0)).toEqual({ subtotal: 100.3, tax: 0, total: 100.3 });
    expect(netTotals(1.005, 0)).toEqual({ subtotal: 1.01, tax: 0, total: 1.01 });
  });

  it('roundProduct multiplies the decimal values: 0.375 x 0.6 is 0.23, and just under the half stays down', () => {
    expect(roundProduct(0.375, 0.6)).toBe(0.23);
    expect(roundProduct(-0.375, 0.6)).toBe(-0.23);
    expect(roundProduct(0.374, 0.6)).toBe(0.22);
  });

  it('documentTotals taxes each rate on the sum of its nets, not the sum of the line taxes', () => {
    // 0.03 and 0.07 at 15%: the line taxes 0.0045 and 0.0105 add to 0.015, the rate on 0.10 gives 0.02.
    const lines = [
      { quantity: 1, unitPrice: 0.03, taxRate: 15, taxCategory: 'S' },
      { quantity: 1, unitPrice: 0.07, taxRate: 15, taxCategory: 'S' },
      { quantity: 1, unitPrice: 5, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-32' },
    ];
    expect(documentTotals(lines)).toEqual({ subtotal: 5.1, tax: 0.02, total: 5.12 });
    expect(documentTotals([{ quantity: 1, unitPrice: 100.3, discount: 0, taxRate: 15, taxCategory: 'S' }])).toEqual({ subtotal: 100.3, tax: 15.05, total: 115.35 });
    expect(documentTotals([{ quantity: 2, unitPrice: 10, discount: 4.5, taxRate: 15, taxCategory: 'S' }])).toEqual({ subtotal: 15.5, tax: 2.33, total: 17.83 });
  });
});
