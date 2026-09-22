import { buildUnsignedInvoiceXml, type UblInvoiceInput, type UblInvoiceLine } from '../../zatca/ubl/invoice-xml.util';
import { formatMoney, roundTo } from './rounding';
import { computeDocumentTotals, lineNet, lineTax, type MoneyLine } from './totals';

/**
 * حارس «المختوم = المرحَّل» — كنسة التدوير (قرار المالك 2026-09-03).
 *
 * الدفتر (`invoices.service.ts` عبر `computeDocumentTotals`) والمستند المختوم
 * (`invoice-xml.util.ts`) يجب أن يذكرا **الأرقام نفسها** حتى على البنود العدائية:
 * أنصافٌ عشرية، أسعارٌ بست خانات، كمياتٌ بثلاث، وإشعارٌ دائن ينفي فاتورةً كاملة.
 * ولا يُكتفى بأن الدالة واحدة — بل يُقرأ المستند المولَّد ويُقارَن رقماً برقم.
 */

const ADVERSARIAL: MoneyLine[] = [
  { quantity: 3, unitPrice: 0.335, taxRate: 15, taxCategory: 'S' }, // ثلاثة بنودٍ نصفية: 1.005 ← صافيها 1.01 لا 1.00
  { quantity: 1.5, unitPrice: 0.67, taxRate: 15, taxCategory: 'S' }, // 1.005
  { quantity: 2.333, unitPrice: 1.234567, taxRate: 15, taxCategory: 'S' }, // كميةٌ بثلاث وسعرٌ بست
  { quantity: 1, unitPrice: 0.125, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' }, // نصفٌ ثنائيٌّ دقيق على نسبة صفر
  { quantity: 7, unitPrice: 0.015, taxRate: 15, taxCategory: 'S' }, // 0.105
];

/** ⑧ سطرُ المستند يحمل فئتَه: بندٌ بلا فئةٍ في هذه العيّنات يُصنَّف من نسبته (`S` للأساسية · `Z` بسبب الأدوية للصفر). */
const ublLine = (l: MoneyLine, i: number): UblInvoiceLine => ({
  description: `بند ${i + 1}`,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  discount: l.discount ?? 0,
  taxRate: l.taxRate,
  taxCategory: (l.taxCategory as UblInvoiceLine['taxCategory']) ?? (l.taxRate > 0 ? 'S' : 'Z'),
  taxExemptionReasonCode: l.taxExemptionReasonCode ?? (l.taxRate > 0 ? null : 'VATEX-SA-35'),
  taxExemptionReason: l.taxExemptionReason ?? null,
});

const baseInput = (lines: MoneyLine[], totals = computeDocumentTotals(lines)): UblInvoiceInput => ({
  number: 'INV-1',
  uuid: '11111111-1111-1111-1111-111111111111',
  issued: { date: '2026-06-01', time: '09:30:00' },
  invoiceType: 'standard',
  icv: 1,
  pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
  seller: { name: 'بائع', vatNumber: '300000000000003' },
  buyer: { name: 'مشترٍ', vatNumber: '300000000000003' },
  lines: lines.map(ublLine),
  currency: 'SAR',
  subtotal: totals.subtotal,
  taxTotal: totals.taxTotal,
  total: totals.total,
  taxTotalSar: totals.taxTotal,
});

/** كل مبالغ عنصرٍ معيَّن في المستند — بالترتيب. */
const amountsOf = (xml: string, tag: string): string[] =>
  [...xml.matchAll(new RegExp(`<${tag}[^>]*>([-0-9.]+)</${tag}>`, 'g'))].map((m) => m[1]);

describe('مجاميع المستند — خصائصٌ مضمونة', () => {
  it('[SPEC 6.1] ⭐ subtotal + taxTotal === total بالضبط، وsubtotal === Σ صوافي البنود، وtaxTotal === Σ ضريبة النِّسَب', () => {
    const t = computeDocumentTotals(ADVERSARIAL);
    expect(roundTo(t.subtotal + t.taxTotal, 'INVOICE_TOTAL')).toBe(t.total);
    expect(t.subtotal).toBe(ADVERSARIAL.reduce((s, l) => roundTo(s + lineNet(l), 'INVOICE_TOTAL'), 0));
    expect(t.taxTotal).toBe(t.byRate.reduce((s, b) => roundTo(s + b.tax, 'VAT_AMOUNT'), 0));
    for (const b of t.byRate) expect(b.tax).toBe(roundTo(b.taxable * (b.rate / 100), 'VAT_AMOUNT'));
  });

  it('⭐ الطريقة القديمة كانت تختلف بهللة على البنود النصفية — والفرق مقيسٌ لا مزعوم', () => {
    // ثلاثة بنود بـ 0.335: صافي كلٍّ 1.005 → 1.01، فالمجموع 3.03؛ والقديمة تجمع 3.015 ثم تدوّر → 3.02
    const lines: MoneyLine[] = [1, 2, 3].map(() => ({ quantity: 1, unitPrice: 1.005, taxRate: 15 }));
    const old = Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
    expect(old).toBe(3.01); // 3.015 * 100 = 301.49999… في IEEE-754
    expect(computeDocumentTotals(lines).subtotal).toBe(3.03);
  });

  it('[SPEC 6.1] ⭐ التناظر: إشعارٌ دائن ينفي البنود يعطي نفيَ المجاميع بالضبط — لا هللةٌ تبقى', () => {
    const invoice = computeDocumentTotals(ADVERSARIAL);
    const credit = computeDocumentTotals(ADVERSARIAL.map((l) => ({ ...l, quantity: -l.quantity })));
    expect(credit.subtotal).toBe(-invoice.subtotal);
    expect(credit.taxTotal).toBe(-invoice.taxTotal);
    expect(credit.total).toBe(-invoice.total);
    expect(roundTo(invoice.total + credit.total, 'INVOICE_TOTAL')).toBe(0);
  });

  it('ترتيب النِّسَب بترتيب أول ظهورها — وهو ترتيب cac:TaxSubtotal', () => {
    expect(computeDocumentTotals(ADVERSARIAL).byRate.map((b) => b.rate)).toEqual([15, 0]);
  });
});

describe('⭐⭐ المختوم = المرحَّل — يُقرأ المستند المولَّد ويُقارَن رقماً برقم', () => {
  it('كل مبلغٍ في المستند هو ما يحسبه الدفتر — البنود والنِّسَب والمجاميع', () => {
    const totals = computeDocumentTotals(ADVERSARIAL);
    const xml = buildUnsignedInvoiceXml(baseInput(ADVERSARIAL, totals));

    // البنود: صافي كلٍّ كما في الدفتر
    expect(amountsOf(xml, 'cbc:LineExtensionAmount')).toEqual([formatMoney(totals.subtotal), ...ADVERSARIAL.map((l) => formatMoney(lineNet(l)))]);
    // النِّسَب: الوعاء والضريبة كما في الدفتر، بالترتيب
    expect(amountsOf(xml, 'cbc:TaxableAmount')).toEqual(totals.byRate.map((b) => formatMoney(b.taxable)));
    // المجاميع الثلاثة
    expect(amountsOf(xml, 'cbc:TaxInclusiveAmount')).toEqual([formatMoney(totals.total)]);
    expect(amountsOf(xml, 'cbc:PayableAmount')).toEqual([formatMoney(totals.total)]);
    expect(amountsOf(xml, 'cbc:TaxExclusiveAmount')).toEqual([formatMoney(totals.subtotal)]);
    // ضريبة النِّسَب داخل TaxTotal الثاني تساوي taxTotal مجموعاً
    const taxAmounts = amountsOf(xml, 'cbc:TaxAmount');
    expect(taxAmounts[0]).toBe(formatMoney(totals.taxTotal)); // SAR
    expect(taxAmounts[1]).toBe(formatMoney(totals.taxTotal)); // عملة المستند
    expect(taxAmounts.slice(2, 2 + totals.byRate.length)).toEqual(totals.byRate.map((b) => formatMoney(b.tax)));
  });

  it('وإشعارٌ دائن كامل يذكر نفيَ الفاتورة حرفاً بحرف في المبالغ', () => {
    const inv = computeDocumentTotals(ADVERSARIAL);
    const creditLines = ADVERSARIAL.map((l) => ({ ...l, quantity: -l.quantity }));
    const cr = computeDocumentTotals(creditLines);
    const xml = buildUnsignedInvoiceXml({
      ...baseInput(creditLines, cr),
      documentType: 'credit',
      billingReference: { invoiceNumber: 'INV-1' },
      adjustmentReason: 'مرتجع كامل',
    });
    expect(amountsOf(xml, 'cbc:PayableAmount')).toEqual([formatMoney(-inv.total)]);
    expect(amountsOf(xml, 'cbc:TaxExclusiveAmount')).toEqual([formatMoney(-inv.subtotal)]);
  });

  it('المستند يعمل على الأمثلة الكنسية كما كان: 250 · 30 · 280', () => {
    const lines: MoneyLine[] = [
      { quantity: 2, unitPrice: 100, taxRate: 15 },
      { quantity: 1, unitPrice: 50, taxRate: 0 },
    ];
    const t = computeDocumentTotals(lines);
    expect([t.subtotal, t.taxTotal, t.total]).toEqual([250, 30, 280]);
    const xml = buildUnsignedInvoiceXml(baseInput(lines, t));
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">280.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="SAR">200.00</cbc:TaxableAmount>');
    expect(xml).toContain('<cbc:TaxableAmount currencyID="SAR">50.00</cbc:TaxableAmount>');
  });

  it('[SPEC 6.1] ⑧ الوعاءُ بالمفتاح الثلاثي: بندان بصفرٍ بفئتين (Z · E) صفّان في التفصيل لا صفّ — وبندا O بسببين صفّان', () => {
    const lines: MoneyLine[] = [
      { quantity: 1, unitPrice: 100, taxRate: 15, taxCategory: 'S' },
      { quantity: 1, unitPrice: 40, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' },
      { quantity: 1, unitPrice: 60, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' },
      { quantity: 1, unitPrice: 10, taxRate: 0, taxCategory: 'O', taxExemptionReasonCode: 'VATEX-SA-OOS', taxExemptionReason: 'رسوم حكومية مُحصَّلة نيابةً' },
      { quantity: 1, unitPrice: 5, taxRate: 0, taxCategory: 'O', taxExemptionReasonCode: 'VATEX-SA-OOS', taxExemptionReason: 'تعويضٌ لا يقابله توريد' },
      // وسطرٌ يُباع من صنفٍ لم يُعلَن — قديمٌ بالأساسية — يقع في وعاء `S` نفسِه لا في وعاءٍ رابع.
      { quantity: 1, unitPrice: 20, taxRate: 15, taxCategory: 'LEGACY_STANDARD' },
    ];
    const t = computeDocumentTotals(lines);
    expect(t.byRate.map((b) => [b.category, b.reasonCode, b.taxable, b.tax])).toEqual([
      ['S', null, 120, 18],
      ['Z', 'VATEX-SA-35', 40, 0],
      ['E', 'VATEX-SA-29', 60, 0],
      ['O', 'VATEX-SA-OOS', 10, 0],
      ['O', 'VATEX-SA-OOS', 5, 0],
    ]);
    expect([t.subtotal, t.taxTotal, t.total]).toEqual([235, 18, 253]);
    // والدفترُ لم يتغيّر: ضريبةُ الثلاث صفرٌ، والمجموعُ مجموعُ الأوعية.
    const xml = buildUnsignedInvoiceXml(baseInput(lines, t));
    expect(xml.match(/<cac:TaxSubtotal>/g)).toHaveLength(5);
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-SA-35</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>الأدوية والمعدات الطبية</cbc:TaxExemptionReason>');
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-SA-29</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>الخدمات المالية</cbc:TaxExemptionReason>');
    expect(xml).toContain('<cbc:TaxExemptionReason>رسوم حكومية مُحصَّلة نيابةً</cbc:TaxExemptionReason>');
    // فئةُ `O` بلا نسبة — على السطر وفي التفصيل (BR-O-05 · BR-O-06).
    expect(xml).toContain('<cac:TaxCategory><cbc:ID>O</cbc:ID><cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cac:TaxScheme>');
  });

  it('lineTax للعرض على السطر فقط — ضريبة النسبة تُحسب من الوعاء لا من مجموع ضرائب البنود', () => {
    // خمسة بنودٍ ضريبة كلٍّ 0.15075 → تُعرض 0.15، لكن الوعاء 5.025 → 5.03 × 15% = 0.7545 → 0.75 لا 0.75+…
    const lines: MoneyLine[] = [1, 2, 3, 4, 5].map(() => ({ quantity: 1, unitPrice: 1.005, taxRate: 15 }));
    const t = computeDocumentTotals(lines);
    expect(t.byRate[0].taxable).toBe(5.05); // 1.01 × 5
    expect(t.byRate[0].tax).toBe(roundTo(5.05 * 0.15, 'VAT_AMOUNT'));
    expect(lines.map(lineTax).every((x) => x === 0.15)).toBe(true);
  });

  it('[SPEC 4.11] ④B1 الخصمُ على السطر: الصافي = الكمية × السعر − الخصم (BT-131)، والمستندُ يذكر الخصمَ AllowanceCharge والصافيَ بعده — ولا يفترق عن الدفتر', () => {
    // 2 × 100 − 20 = 180 صافياً؛ الضريبةُ من الصافي: 27؛ والإجمالي 207 — وسطرٌ بلا خصم كما كان.
    const lines: MoneyLine[] = [
      { quantity: 2, unitPrice: 100, discount: 20, taxRate: 15, taxCategory: 'S' },
      { quantity: 1, unitPrice: 50, taxRate: 15, taxCategory: 'S' },
    ];
    expect(lineNet(lines[0])).toBe(180);
    expect(lineNet(lines[1])).toBe(50);
    const t = computeDocumentTotals(lines);
    expect([t.subtotal, t.taxTotal, t.total]).toEqual([230, 34.5, 264.5]);
    const xml = buildUnsignedInvoiceXml(baseInput(lines.map((l) => ({ ...l })), t));
    // السطرُ الأوّل يحمل الخصمَ مبلغاً وأساسَه، والصافي بعده؛ والثاني بلا AllowanceCharge.
    const first = xml.slice(xml.indexOf('<cac:InvoiceLine>'), xml.indexOf('</cac:InvoiceLine>'));
    expect(first).toContain('<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
    expect(first).toContain('<cbc:Amount currencyID="SAR">20.00</cbc:Amount>');
    expect(first).toContain('<cbc:BaseAmount currencyID="SAR">200.00</cbc:BaseAmount>');
    expect(amountsOf(first, 'cbc:LineExtensionAmount')).toEqual(['180.00']);
    expect((xml.match(/<cac:AllowanceCharge>/g) ?? []).length).toBe(1);
    // ومجاميعُ المستند هي مجاميعُ الدفتر — الخصمُ على السطر لا على المستند (BT-107 لا يُمسّ).
    expect(amountsOf(xml, 'cbc:TaxExclusiveAmount')).toEqual([formatMoney(t.subtotal)]);
    expect(amountsOf(xml, 'cbc:TaxInclusiveAmount')).toEqual([formatMoney(t.total)]);
    // ⑧ خصمٌ يساوي الإجماليَّ صافيُه صفر — وما يفوقه يرفضه الخادمُ قبل الحساب (يُثبت في e2e).
    expect(lineNet({ quantity: 1, unitPrice: 10, discount: 10, taxRate: 15 })).toBe(0);
  });
});
