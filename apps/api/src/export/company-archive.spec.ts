import { parentLinks, repeatParentsIntoChildYears, yearFieldOf, yearlyModels } from './company-archive.service';

/**
 * حارسُ التقسيم السنويّ لنسخة الإغلاق (`ق-٥٥٤` · `ق-٥٥٨`) — **مشتقٌّ ومُثبَتٌ على مجسّ**:
 *
 * - السنويُّ يُشتقّ من معيار الحركة وتوابعه، والسنةُ من أوّل حقل تاريخ — لا قائمةَ أسماء.
 * - روابطُ التابع بأصله تُقرأ من `DMMF` (علاقةٌ مفردة ومفتاحُها) — فعقدٌ وأقساطُه رابطٌ فعليّ.
 * - **الأصلُ يُكرَّر في كلِّ سنةٍ يقع فيها تابعٌ له** — ولا يُكرَّر الحاضر، ولا يُخترَع غائب.
 */
describe('نسخةُ الإغلاق — التقسيمُ السنويّ وتكرارُ الأصول (ق-٥٥٨)', () => {
  it('السنويُّ مشتقّ: معيارُ الحركة وتوابعه، وسطورُ الفاتورة والأقساطُ فيه، والعملاءُ خارجه', () => {
    const yearly = yearlyModels();
    for (const m of ['Invoice', 'InvoiceLine', 'Contract', 'Installment', 'JournalEntry', 'JournalLine', 'Quote']) expect(yearly.has(m)).toBe(true);
    for (const m of ['Customer', 'Product', 'Account', 'Company', 'PermissionTemplate']) expect(yearly.has(m)).toBe(false);
  });

  it('السنةُ من أوّل حقل تاريخٍ بترتيب الأولوية — مقروءاً من المخطّط', () => {
    expect(yearFieldOf('Invoice')).toBe('issueDate');
    expect(yearFieldOf('JournalEntry')).toBe('date');
    expect(yearFieldOf('Contract')).toBe('start');
    expect(yearFieldOf('PosShift')).toBe('openedAt');
    expect(yearFieldOf('NoSuchModel')).toBeNull();
  });

  it('روابطُ التابع بأصله من DMMF — القسطُ بعقده، والسطرُ بفاتورته', () => {
    const links = parentLinks();
    expect(links).toEqual(expect.arrayContaining([{ childDelegate: 'installment', parentDelegate: 'contract', fk: 'contractId' }]));
    expect(links).toEqual(expect.arrayContaining([{ childDelegate: 'invoiceLine', parentDelegate: 'invoice', fk: 'invoiceId' }]));
    // ولا رابطَ إلى غير السنويّ: العميلُ ليس أصلاً يُكرَّر.
    expect(links.some((l) => l.parentDelegate === 'customer')).toBe(false);
  });

  it('⭐ الأصلُ يُكرَّر في سنة تابعه، ولا يُكرَّر الحاضر، ولا يُخترَع الغائب', () => {
    const years: Record<number, Record<string, unknown[]>> = {
      2024: { contract: [{ id: 'c1', start: '2024-03-01' }, { id: 'c2', start: '2024-06-01' }] },
      2025: { installment: [{ id: 'i1', contractId: 'c1' }, { id: 'i2', contractId: 'c1' }, { id: 'i9', contractId: 'ghost' }] },
      2026: { installment: [{ id: 'i3', contractId: 'c1' }], contract: [{ id: 'c1', start: '2024-03-01' }] },
    };
    const links = [{ childDelegate: 'installment', parentDelegate: 'contract', fk: 'contractId' }];
    const repeated = repeatParentsIntoChildYears(years, links);
    // 2025: c1 يُكرَّر مرّةً (لقسطين) — والشبحُ لا يُخترَع؛ 2026: c1 حاضرٌ فلا يُكرَّر.
    expect(repeated).toBe(1);
    expect(years[2025].contract).toEqual([{ id: 'c1', start: '2024-03-01' }]);
    expect(years[2026].contract).toHaveLength(1);
    expect(years[2024].contract).toHaveLength(2);
    // وإعادةُ التشغيل لا تزيد شيئاً.
    expect(repeatParentsIntoChildYears(years, links)).toBe(0);
  });
});
