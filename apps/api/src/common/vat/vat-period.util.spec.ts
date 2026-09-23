import { calendarYear, isLastPeriodOfYear, MONTHLY_PERIOD_THRESHOLD, previousVatPeriod, resolveVatPeriod, trailingTwelveMonths } from './vat-period.util';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('⑥A2 — الفترةُ الضريبية: ربعاً أو شهراً بمدىً واحد', () => {
  it('① الأرباعُ الأربعة بمداها، وآخرُ يومٍ محسوبٌ لا مجدول', () => {
    expect([1, 2, 3, 4].map((q) => [iso(resolveVatPeriod({ year: 2026, quarter: q }).from), iso(resolveVatPeriod({ year: 2026, quarter: q }).to)])).toEqual([
      ['2026-01-01', '2026-03-31'],
      ['2026-04-01', '2026-06-30'],
      ['2026-07-01', '2026-09-30'],
      ['2026-10-01', '2026-12-31'],
    ]);
  });

  it('② الشهور — ومنها فبراير في سنةٍ كبيسة وأخرى غيرِ كبيسة', () => {
    expect(iso(resolveVatPeriod({ year: 2026, month: 2 }).to)).toBe('2026-02-28');
    // 2028 كبيسة — والمدى يُحسب بـ«اليوم صفر من الشهر التالي» فلا جدولَ أطوالٍ يُصان.
    expect(iso(resolveVatPeriod({ year: 2028, month: 2 }).to)).toBe('2028-02-29');
    expect(iso(resolveVatPeriod({ year: 2026, month: 12 }).from)).toBe('2026-12-01');
    expect(iso(resolveVatPeriod({ year: 2026, month: 12 }).to)).toBe('2026-12-31');
  });

  it('③ النوعُ والرقمُ والنصّ يخرجان معاً — فما يُوسَم «قُدِّم» يُعرف نوعُه', () => {
    expect(resolveVatPeriod({ year: 2026, quarter: 3 })).toMatchObject({ periodType: 'QUARTERLY', periodNo: 3, year: 2026, label: 'الربع 3 من 2026' });
    expect(resolveVatPeriod({ year: 2026, month: 3 })).toMatchObject({ periodType: 'MONTHLY', periodNo: 3, year: 2026, label: 'شهر 3 من 2026' });
  });

  it('④ المستحيلُ يُرمى ولا يُخترع: كلاهما · لا واحدَ · وخارجُ المدى', () => {
    expect(() => resolveVatPeriod({ year: 2026, quarter: 1, month: 1 })).toThrow(/both/);
    expect(() => resolveVatPeriod({ year: 2026 })).toThrow(/neither/);
    expect(() => resolveVatPeriod({ year: 2026, quarter: 5 })).toThrow(/quarter out of range/);
    expect(() => resolveVatPeriod({ year: 2026, month: 0 })).toThrow(/month out of range/);
    expect(() => resolveVatPeriod({ year: 2026, month: 13 })).toThrow(/month out of range/);
  });

  it('⑤ نافذةُ الاثني عشر شهراً مغلقةٌ من الطرفين وطولُها سنةٌ بالضبط', () => {
    const w = trailingTwelveMonths(resolveVatPeriod({ year: 2026, quarter: 4 }));
    expect([iso(w.from), iso(w.to)]).toEqual(['2026-01-01', '2026-12-31']);
    const m = trailingTwelveMonths(resolveVatPeriod({ year: 2026, month: 7 }));
    expect([iso(m.from), iso(m.to)]).toEqual(['2025-08-01', '2026-07-31']);
  });

  it('⑥ السنةُ التقويمية — مقامُ الخصم النسبيّ (م٥١/٤)', () => {
    const y = calendarYear(2025);
    expect([iso(y.from), iso(y.to)]).toEqual(['2025-01-01', '2025-12-31']);
  });

  it('⑦ آخرُ فترةٍ في السنة — فيها تقع تسويةُ الخصم النسبيّ (م٥١/٧)', () => {
    expect(isLastPeriodOfYear(resolveVatPeriod({ year: 2026, quarter: 4 }))).toBe(true);
    expect(isLastPeriodOfYear(resolveVatPeriod({ year: 2026, quarter: 3 }))).toBe(false);
    expect(isLastPeriodOfYear(resolveVatPeriod({ year: 2026, month: 12 }))).toBe(true);
    expect(isLastPeriodOfYear(resolveVatPeriod({ year: 2026, month: 11 }))).toBe(false);
  });

  it('⑧ السابقةُ تعبر رأسَ السنة ولا تقف عنده', () => {
    expect(previousVatPeriod(resolveVatPeriod({ year: 2026, quarter: 1 }))).toMatchObject({ year: 2025, periodNo: 4, periodType: 'QUARTERLY' });
    expect(previousVatPeriod(resolveVatPeriod({ year: 2026, month: 1 }))).toMatchObject({ year: 2025, periodNo: 12, periodType: 'MONTHLY' });
    expect(previousVatPeriod(resolveVatPeriod({ year: 2026, month: 8 }))).toMatchObject({ year: 2026, periodNo: 7 });
  });

  it('⑨ الحدُّ أربعون مليوناً بنصّ اللائحة — رقمٌ واحدٌ لا يُكرَّر في الخدمة', () => {
    expect(MONTHLY_PERIOD_THRESHOLD).toBe(40_000_000);
  });
});
