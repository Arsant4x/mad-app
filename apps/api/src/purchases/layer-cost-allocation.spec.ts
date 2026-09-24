import { allocationOf, splitByWeights, type CostShareNode } from './layer-cost-allocation.util';

/**
 * ⚖️ `ق-١٣٦٤` — القسمةُ على المخارج بالباقي الأكبر: المجموعُ يساوي المبلغَ حرفاً، ولا هللةَ تضيع، وكلُّ نصيبٍ على بُعد هللةٍ من نسبته.
 * (السلوكُ على الطبقات والدفتر يحرسه `inventory-ledger-reconciliation.e2e-spec` — هنا الحسابُ النقيّ وحدَه.)
 */
describe('قسمةُ حصّة ما خرج على مخارجه (ق-١٣٦٤)', () => {
  const sum = (xs: number[]) => Math.round(xs.reduce((t, x) => t + x, 0) * 100) / 100;

  it('المجموعُ حرفاً — ولو لم تنقسم الهللاتُ على الأوزان', () => {
    const parts = splitByWeights(10, [1, 1, 1]);
    expect(sum(parts)).toBe(10);
    expect(parts).toEqual([3.34, 3.33, 3.33]);
  });

  it('بالنسب حين تنقسم — ٥٠ على بيعٍ ٢ وتحويلٍ ٢ وشطبٍ ١', () => {
    expect(splitByWeights(50, [2, 2, 1])).toEqual([20, 20, 10]);
  });

  it('الإشارةُ تُحفظ — خفضٌ بإشعارٍ دائن', () => {
    const parts = splitByWeights(-10, [2, 2, 1]);
    expect(parts).toEqual([-4, -4, -2]);
    expect(sum(parts)).toBe(-10);
  });

  it('وزنٌ صفريّ لا يأخذ شيئاً، وأوزانٌ كلُّها صفرٌ لا تقسم', () => {
    expect(splitByWeights(7, [0, 3, 0])).toEqual([0, 7, 0]);
    expect(splitByWeights(7, [0, 0])).toEqual([0, 0]);
  });

  it('المجموعُ من شجرة الحصص: الرفوفُ كلُّها إلى 1300، والتابعُ لا يُعدّ مرّتين', () => {
    const leaf = (over: Partial<CostShareNode>): CostShareNode => ({
      layerId: 'x',
      qtyReceived: 0,
      qtyRemainingAt: 0,
      baseAmount: 0,
      baseShelf: 0,
      baseCogs: 0,
      baseWriteOff: 0,
      baseVariance: 0,
      baseFollow: 0,
      unitCostBefore: 0,
      unitCostAfter: 0,
      exitedRaiseBefore: 0,
      exitedRaiseAfter: 0,
      children: [],
      ...over,
    });
    const child = leaf({ baseAmount: 20, baseShelf: 15, baseCogs: 5 });
    const root = leaf({ baseAmount: 100, baseShelf: 50, baseCogs: 20, baseWriteOff: 10, baseFollow: 20, children: [child] });
    expect(allocationOf([root])).toEqual({ shelf: 65, cogs: 25, writeOff: 10, variance: 0 });
  });
});
