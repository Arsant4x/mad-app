import { pendingTaxPoints, quarterOf, rentAmountsOf, rentTaxTreatment, splitGrossAmount, taxPointsOfInstallment } from './rent-tax-point.util';

/**
 * **محرّكُ نقطة الضريبة — مُثبَتٌ بحالاتٍ جوابُها معروفٌ يداً** (`ق-٩٢٤` · `ق-٩٢٧/٤`).
 *
 * الحالةُ الأولى هي مثالُ المالك حرفاً: مئةٌ من خمسة آلافٍ قبل شهرٍ من الاستحقاق —
 * تُستحقّ المئةُ بتاريخها والباقي عند `dueDate`؛ **وبالمقترَح المرفوض** (القسطُ كلُّه
 * عند أوّل دفعة) كان الجوابُ خمسةَ آلافٍ في ربعٍ سابق — فالحالةُ تُسقط المقترَحَ لو عاد.
 */
const d = (s: string) => new Date(s);

describe('محرّكُ نقطة الضريبة للإيجار (م٢٠ · ق-٩٢٤)', () => {
  const commercialExclusive = rentTaxTreatment('COMMERCIAL', 'EXCLUSIVE', 'owned')!;
  const commercialInclusive = rentTaxTreatment('COMMERCIAL', 'INCLUSIVE', 'owned')!;
  const residential = rentTaxTreatment('RESIDENTIAL', 'EXCLUSIVE', 'owned')!;
  const managed = rentTaxTreatment('COMMERCIAL', 'EXCLUSIVE', 'managed')!;

  it('⚖️ مثالُ المالك: مئةٌ من خمسة آلافٍ قبل شهرٍ — المئةُ بتاريخها والباقي عند الاستحقاق', () => {
    const points = taxPointsOfInstallment({
      gross: 5000,
      dueDate: d('2026-10-01'),
      payments: [{ id: 'p1', date: d('2026-09-01'), gross: 100 }],
      asOf: d('2026-10-15'),
    });
    expect(points).toEqual([
      { date: d('2026-09-01'), gross: 100, kind: 'PREPAYMENT', paymentId: 'p1' },
      { date: d('2026-10-01'), gross: 4900, kind: 'DUE' },
    ]);
    // وفي ربعٍ سابقٍ لا يدخل إلا ما قُبض — لا الخمسةُ آلاف.
    expect(quarterOf(points[0].date)).toEqual({ year: 2026, quarter: 3 });
    expect(quarterOf(points[1].date)).toEqual({ year: 2026, quarter: 4 });
  });

  it('وقبل حلول الاستحقاق لا نقطةَ إلا للمقبوض — والباقي ينتظر موعدَه', () => {
    const points = taxPointsOfInstallment({
      gross: 5000,
      dueDate: d('2026-10-01'),
      payments: [{ date: d('2026-09-01'), gross: 100 }],
      asOf: d('2026-09-20'),
    });
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ gross: 100, kind: 'PREPAYMENT' });
  });

  it('ودفعةٌ في يوم الاستحقاق أو بعده ليست نقطةً — الاستحقاقُ سبقها', () => {
    const points = taxPointsOfInstallment({
      gross: 1000,
      dueDate: d('2026-10-01'),
      payments: [{ date: d('2026-10-01'), gross: 1000 }, { date: d('2026-10-09'), gross: 500 }],
      asOf: d('2026-10-31'),
    });
    expect(points).toEqual([{ date: d('2026-10-01'), gross: 1000, kind: 'DUE' }]);
  });

  it('ودفعةٌ مقدَّمة تفوق القسط تُقصَر على ما بقي منه — والفائضُ لغيرها', () => {
    const points = taxPointsOfInstallment({ gross: 1000, dueDate: d('2026-10-01'), payments: [{ date: d('2026-09-01'), gross: 1500 }], asOf: d('2026-12-31') });
    expect(points).toEqual([{ date: d('2026-09-01'), gross: 1000, kind: 'PREPAYMENT', paymentId: undefined }]);
  });

  it('🔴 والمستحقُّ سابقاً يُستهلك من أوّل النقاط — فتشغيلٌ مكرَّر يكتب صفراً', () => {
    const points = taxPointsOfInstallment({
      gross: 5000,
      dueDate: d('2026-10-01'),
      payments: [{ date: d('2026-09-01'), gross: 100 }],
      asOf: d('2026-10-15'),
    });
    expect(pendingTaxPoints(points, 0)).toHaveLength(2);
    expect(pendingTaxPoints(points, 100)).toEqual([{ date: d('2026-10-01'), gross: 4900, kind: 'DUE' }]);
    expect(pendingTaxPoints(points, 5000)).toEqual([]);
    // واستهلاكٌ جزئيٌّ لنقطةٍ يُبقي باقيها.
    expect(pendingTaxPoints(points, 60)).toEqual([
      { date: d('2026-09-01'), gross: 40, kind: 'PREPAYMENT', paymentId: undefined },
      { date: d('2026-10-01'), gross: 4900, kind: 'DUE' },
    ]);
  });

  it('⚠️ الحدُّ المعلَن (ق-٩٢٧/٨): دفعةٌ تُسجَّل لاحقاً بتاريخٍ أسبقَ من استحقاقٍ رُحِّل لا تُعيد ترحيلَه', () => {
    // رُحِّل الاستحقاقُ كاملاً (1000) عند حلوله، ثم سُجِّلت دفعةٌ بتاريخٍ يسبقه.
    const points = taxPointsOfInstallment({ gross: 1000, dueDate: d('2026-03-01'), payments: [{ date: d('2026-02-20'), gross: 1000 }], asOf: d('2026-09-16') });
    expect(points).toEqual([{ date: d('2026-02-20'), gross: 1000, kind: 'PREPAYMENT', paymentId: undefined }]);
    expect(pendingTaxPoints(points, 1000)).toEqual([]);
  });

  it('الشمول (م٤٥/٢): غيرُ الشامل يزيد الإجماليَّ 15%، والشاملُ يُنقص الصافي 15/115', () => {
    expect(rentAmountsOf(1000, commercialExclusive)).toEqual({ gross: 1150, net: 1000, tax: 150 });
    expect(rentAmountsOf(1150, commercialInclusive)).toEqual({ gross: 1150, net: 1000, tax: 150 });
    expect(rentAmountsOf(1000, residential)).toEqual({ gross: 1000, net: 1000, tax: 0 });
    // عقارُ تشغيل: تجاريٌّ بلا ضريبةٍ عندنا — يُعدّ ويُعلَن.
    expect(rentAmountsOf(1000, managed)).toEqual({ gross: 1000, net: 1000, tax: 0 });
    expect(managed.managed).toBe(true);
    expect(managed.taxable).toBe(false);
  });

  it('وقسمةُ المقبوض إجماليّاً: 115 ⇒ 100 + 15', () => {
    expect(splitGrossAmount(115, commercialExclusive)).toEqual({ gross: 115, net: 100, tax: 15 });
    expect(splitGrossAmount(115, residential)).toEqual({ gross: 115, net: 115, tax: 0 });
  });

  it('⛔ العقدُ القديم غيرُ المصنَّف أو غيرُ معلَنِ الشمول بلا معاملة — لا يُستحقّ ولا يدخل الإقرار', () => {
    expect(rentTaxTreatment('LEGACY_UNCLASSIFIED', 'EXCLUSIVE', 'owned')).toBeNull();
    expect(rentTaxTreatment('COMMERCIAL', 'LEGACY_UNDECLARED', 'owned')).toBeNull();
    expect(rentTaxTreatment('COMMERCIAL', 'EXCLUSIVE', 'leased')?.taxable).toBe(true);
  });
});
