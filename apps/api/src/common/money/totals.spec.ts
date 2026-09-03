import { buildUnsignedInvoiceXml, type UblInvoiceInput } from '../../zatca/ubl/invoice-xml.util';
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
  { quantity: 3, unitPrice: 0.335, taxRate: 15 }, // ثلاثة بنودٍ نصفية: 1.005 ← صافيها 1.01 لا 1.00
  { quantity: 1.5, unitPrice: 0.67, taxRate: 15 }, // 1.005
  { quantity: 2.333, unitPrice: 1.234567, taxRate: 15 }, // كميةٌ بثلاث وسعرٌ بست
  { quantity: 1, unitPrice: 0.125, taxRate: 0 }, // نصفٌ ثنائيٌّ دقيق على نسبة صفر
  { quantity: 7, unitPrice: 0.015, taxRate: 15 }, // 0.105
];

const baseInput = (lines: MoneyLine[], totals = computeDocumentTotals(lines)): UblInvoiceInput => ({
  number: 'INV-1',
  uuid: '11111111-1111-1111-1111-111111111111',
  issuedAt: new Date('2026-06-01T09:30:00.000Z'),
  invoiceType: 'standard',
  icv: 1,
  pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
  seller: { name: 'بائع', vatNumber: '300000000000003' },
  buyer: { name: 'مشترٍ', vatNumber: '300000000000003' },
  lines: lines.map((l, i) => ({ description: `بند ${i + 1}`, ...l })),
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

  it('lineTax للعرض على السطر فقط — ضريبة النسبة تُحسب من الوعاء لا من مجموع ضرائب البنود', () => {
    // خمسة بنودٍ ضريبة كلٍّ 0.15075 → تُعرض 0.15، لكن الوعاء 5.025 → 5.03 × 15% = 0.7545 → 0.75 لا 0.75+…
    const lines: MoneyLine[] = [1, 2, 3, 4, 5].map(() => ({ quantity: 1, unitPrice: 1.005, taxRate: 15 }));
    const t = computeDocumentTotals(lines);
    expect(t.byRate[0].taxable).toBe(5.05); // 1.01 × 5
    expect(t.byRate[0].tax).toBe(roundTo(5.05 * 0.15, 'VAT_AMOUNT'));
    expect(lines.map(lineTax).every((x) => x === 0.15)).toBe(true);
  });
});
