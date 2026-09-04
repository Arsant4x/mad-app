import { allocateEvenly, moneyEquals, MONEY_EPSILON, sumMoney } from './allocation';
import { roundTo } from './rounding';

/**
 * **خاصيةٌ لا مثال** (قرار المالك 2026-09-04): مجموع الدفعات يساوي الأصل **لأي
 * قيمة وأي عدد** — لا لأمثلةٍ منتقاة تصادف أن تمرّ.
 *
 * والعطل الذي وُلد الملف لإغلاقه مثالٌ واحد يكفي لبيانه: `3.03` على ثلاثة كان
 * يعطي `1.00 · 1.00 · 1.03`. لكنّ المثال يثبت العطل ولا يثبت غيابه — فالخاصية
 * هي الإثبات.
 */
describe('توزيع المبالغ', () => {
  /** مولّدٌ حتميّ (بذرةٌ ثابتة) — فسقوطٌ يُعاد إنتاجه، لا يظهر مرةً ويختفي. */
  function* pseudoRandom(seed: number): Generator<number> {
    let x = seed;
    for (;;) {
      x = (x * 1103515245 + 12345) % 2147483648;
      yield x / 2147483648;
    }
  }

  it('المجموع يساوي الأصل — لأي قيمة وأي عدد', () => {
    const rnd = pseudoRandom(20260904);
    const failures: string[] = [];

    for (let i = 0; i < 2000; i += 1) {
      const total = roundTo((rnd.next().value - 0.15) * 100000, 'LINE_AMOUNT');
      const count = 1 + Math.floor(rnd.next().value * 60);
      const parts = allocateEvenly(total, count);

      if (parts.length !== count) failures.push(`${total}/${count}: العدد ${parts.length}`);
      const sum = sumMoney(parts);
      if (sum !== total) failures.push(`${total}/${count}: المجموع ${sum}`);
    }

    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('والفرق على قسطٍ واحد معلوم — لا يتناثر', () => {
    const rnd = pseudoRandom(7);
    for (let i = 0; i < 500; i += 1) {
      const total = roundTo(rnd.next().value * 5000, 'LINE_AMOUNT');
      const count = 2 + Math.floor(rnd.next().value * 20);
      const parts = allocateEvenly(total, count);

      // كل ما عدا الأخير متساوٍ تماماً، والأخير وحده يحمل الفرق.
      const head = parts.slice(0, -1);
      expect(new Set(head).size).toBeLessThanOrEqual(1);
    }
  });

  it('والفرق يُحمَّل على الأولى عند الطلب', () => {
    const first = allocateEvenly(3.03, 3, { remainderOn: 'first' });
    expect(sumMoney(first)).toBe(3.03);
    expect(new Set(first.slice(1)).size).toBe(1);
  });

  it('العطل المسمّى: 3.03 على ثلاثة تعطي 1.01 ثلاثاً لا 1.00 · 1.00 · 1.03', () => {
    expect(allocateEvenly(3.03, 3)).toEqual([1.01, 1.01, 1.01]);
  });

  it('والسالب يوزَّع كالموجب — فمرتجعٌ يُقسَّط لا يفقد هللة', () => {
    const parts = allocateEvenly(-3.03, 3);
    expect(sumMoney(parts)).toBe(-3.03);
    expect(parts).toEqual([-1.01, -1.01, -1.01]);
  });

  it('دفعةٌ واحدة تأخذ المبلغ كلّه، والصفر يبقى صفراً', () => {
    expect(allocateEvenly(99.99, 1)).toEqual([99.99]);
    expect(allocateEvenly(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it('وعددٌ غير صالح يُرفض صراحةً — لا يُصحَّح بصمت', () => {
    for (const bad of [0, -1, 2.5, NaN]) {
      expect(() => allocateEvenly(100, bad)).toThrow(RangeError);
    }
    expect(() => allocateEvenly(NaN, 3)).toThrow(RangeError);
  });

  it('الجمع مدوَّرٌ عند كل تراكم — لا عائماً ثم مدوَّراً', () => {
    // ثلاثُ هللاتٍ ثلثية: الجمع الخام يعطي 0.30000000000000004.
    expect(sumMoney([0.1, 0.1, 0.1])).toBe(0.3);
    expect(sumMoney([])).toBe(0);
  });

  it('والتسامح ثابتٌ واحد لا يخترعه كل ملف', () => {
    expect(MONEY_EPSILON).toBe(0.01);
    expect(moneyEquals(100, 100.01)).toBe(true);
    expect(moneyEquals(100, 100.02)).toBe(false);
  });
});
