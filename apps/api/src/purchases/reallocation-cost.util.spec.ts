import { reallocationCostShifts } from './reallocation-cost.util';

/**
 * ⚖️ فرقُ السعر في إعادة توزيع سند صرف المورّد (توجيه ٢٨٦): ما زيد على شراءٍ من سندٍ سبقه تكلفةٌ بسعر السند، وما نُقص يردّ
 * ما رُحِّل بقدره. والجوابُ محسوبٌ يداً: السندُ ١٠٠ دولار بـ3.80 يومَ ١ يناير.
 */
describe('reallocationCostShifts — ما يُرحَّل إلى تكلفة الشراء عند إعادة التوزيع (توجيه ٢٨٦)', () => {
  const base = { paymentRate: 3.8, paymentDay: '2026-01-01' };
  const purchases = new Map([
    ['later', { rate: 3.7, day: '2026-02-01' }],
    ['earlier', { rate: 3.7, day: '2025-12-01' }],
    ['other', { rate: 3.6, day: '2026-03-01' }],
  ]);

  it('دفعةٌ مقدّمة تُطبَّق على شراءٍ لاحق: ١٠٠ × (3.80 − 3.70) = ١٠ تكلفةً مدينة', () => {
    const out = reallocationCostShifts({ ...base, before: new Map(), after: new Map([['later', 100]]), purchases });
    expect(out.get('later')).toEqual({ cost: 10, shift: 10 });
  });

  it('وعلى شراءٍ سبق السند: تسويةٌ عادية، لا تكلفة (والفرقُ في 5600)', () => {
    const out = reallocationCostShifts({ ...base, before: new Map(), after: new Map([['earlier', 100]]), purchases });
    expect(out.get('earlier')).toEqual({ cost: 0, shift: 0 });
  });

  it('ونقلٌ من شراءٍ إلى آخر: المنقوصُ يردّ ما رُحِّل بقدره، والمزيدُ يُقاس بسعر السند', () => {
    const out = reallocationCostShifts({
      ...base,
      before: new Map([['later', { amount: 100, cost: 10 }]]),
      after: new Map([['later', 40], ['other', 60]]),
      purchases,
    });
    expect(out.get('later')).toEqual({ cost: 4, shift: -6 });
    expect(out.get('other')).toEqual({ cost: 12, shift: 12 });
  });

  it('وشراءٌ بلا سعرٍ معروف خطأٌ يُرمى لا صفرٌ يُفترض', () => {
    expect(() => reallocationCostShifts({ ...base, before: new Map(), after: new Map([['ghost', 1]]), purchases })).toThrow('ghost');
  });
});
