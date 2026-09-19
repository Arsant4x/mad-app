import { spreadCostOverLayer, unitCostAfterShelfDelta } from './layer-cost-spread.util';

/**
 * ٧ الدالّةُ المشتركة بين إشعار السعر والتكلفة المحمَّلة (`ق-١١٤٦`/ج) — جوابُها معروفٌ يداً (`ق-٧١٥`):
 * ما على الرفّ يتبع الطبقة، وما استُهلك قبل الحدث إلى تكلفة المبيعات، وتكلفةُ الوحدة تُعاد من المتبقّي.
 */
describe('spreadCostOverLayer — فرقُ تكلفةٍ على طبقةٍ استُهلك منها', () => {
  it('تكلفةٌ محمَّلة على طبقةٍ كاملة على الرفّ: كلُّها إلى الرفّ وتكلفةُ الوحدة تزيد بنصيبها', () => {
    // 100 ريالٍ على 10 وحدات كلُّها على الرفّ بتكلفة 40 ⟵ 10 لكلِّ وحدة، والتكلفةُ 50.
    const s = spreadCostOverLayer({ unitsAffected: 10, perUnitAmount: 10, direction: 1, qtyRemaining: 10, unitCost: 40 });
    expect(s).toEqual({ onShelfQty: 10, consumedQty: 0, baseInventory: 100, baseCogs: 0, newUnitCost: 50 });
  });

  it('الفرقُ الثاني: استُهلك 4 من 10 قبل الوصول ⟵ 6 وحداتٍ للرفّ و4 لتكلفة المبيعات', () => {
    // 50 ريالاً على 10 وحدات (5 للوحدة)، بقي 6 بتكلفة 20 ⟵ الرفُّ 30 والمستهلَك 20 والتكلفةُ 25.
    const s = spreadCostOverLayer({ unitsAffected: 10, perUnitAmount: 5, direction: 1, qtyRemaining: 6, unitCost: 20 });
    expect(s).toEqual({ onShelfQty: 6, consumedQty: 4, baseInventory: 30, baseCogs: 20, newUnitCost: 25 });
  });

  it('طبقةٌ استُهلكت كلُّها: لا شيءَ للرفّ، وتكلفةُ الوحدة كما هي', () => {
    const s = spreadCostOverLayer({ unitsAffected: 10, perUnitAmount: 5, direction: 1, qtyRemaining: 0, unitCost: 20 });
    expect(s).toEqual({ onShelfQty: 0, consumedQty: 10, baseInventory: 0, baseCogs: 50, newUnitCost: 20 });
  });

  it('إشعارٌ دائن (نقصُ سعر) بكمّيةٍ أقلَّ من الطبقة: الوحداتُ المتأثّرة كمّيةُ الإشعار لا كلُّ الطبقة', () => {
    // إشعارٌ على 3 وحدات بـ2 للوحدة، والطبقةُ 10 بقي منها 8 بتكلفة 40 ⟵ الثلاثُ على الرفّ، والتكلفةُ (8×40 − 6)/8.
    const s = spreadCostOverLayer({ unitsAffected: 3, perUnitAmount: 2, direction: -1, qtyRemaining: 8, unitCost: 40 });
    expect(s.onShelfQty).toBe(3);
    expect(s.consumedQty).toBe(0);
    expect(s.baseInventory).toBe(6);
    expect(s.baseCogs).toBe(0);
    expect(s.newUnitCost).toBe(39.25);
  });

  it('المتبقّي أكبرُ من الوحدات المتأثّرة (مرتجعٌ أعاد أكثر): الرفُّ لا يتجاوز الوحداتِ المتأثّرة', () => {
    const s = spreadCostOverLayer({ unitsAffected: 10, perUnitAmount: 1, direction: 1, qtyRemaining: 12, unitCost: 10 });
    expect(s.onShelfQty).toBe(10);
    expect(s.baseInventory).toBe(10);
    expect(s.baseCogs).toBe(0);
    // 12 وحدةً على الرفّ تحمل 10 ريالاتٍ زيادة ⟵ 10 + 10/12.
    expect(s.newUnitCost).toBeCloseTo(10.833333, 6);
  });

  it('unitCostAfterShelfDelta: طبقةٌ فارغة تبقى على تكلفتها، والسالبُ يُنقص', () => {
    expect(unitCostAfterShelfDelta(0, 40, 100)).toBe(40);
    expect(unitCostAfterShelfDelta(10, 50, -100)).toBe(40);
  });
});
