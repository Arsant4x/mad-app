import { createHash } from 'node:crypto';
import { buildUnsignedInvoiceXml, prepaidAmountOf, type UblInvoiceInput } from './invoice-xml.util';

/**
 * ④A1 (`ق-١٢٦١` ب) — مستندُ الهيئة للدفعة المقدَّمة وتعديلِها، حرفاً كمثال معيار XML (§٩ «Prepayment»):
 * مستندُ 386 أصليٌّ لا إشعار (بلا `BillingReference`)، وفاتورةُ التوريد تحمل سطرَ مرجعٍ لكلِّ دفعةٍ بأصفارٍ في الكمّية
 * والصافي والسعر وتفصيلَ ضريبتها، و`PrepaidAmount` (BT-113) = Σ(KSA-31 + KSA-32) و`PayableAmount` = الإجماليُّ − المقدَّم
 * — ومجاميعُ المستند وضريبتُه لا تُخفَّض (مثالُ المعيار: `230` بضريبة `30` ومقدَّمٍ `100` ⟵ مستحقٌّ `130`).
 */
describe('مستندُ الهيئة — الدفعةُ المقدَّمة 386 وتعديلُها في فاتورة التوريد (④A1)', () => {
  const base: UblInvoiceInput = {
    number: 'INV-2026-0012',
    uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28b9',
    issued: { date: '2026-06-15', time: '09:30:00' },
    invoiceType: 'simplified',
    icv: 12,
    pih: createHash('sha256').update('0').digest('base64'),
    seller: { name: 'شركة الأفق التجارية المحدودة', vatNumber: '300000000000003', crNumber: '1010101010', street: 'طريق الملك فهد', buildingNumber: '1234', district: 'العليا', city: 'الرياض', postalCode: '12345' },
    buyer: { name: 'مشترٍ فرد', vatNumber: null },
    lines: [{ description: 'توريد', quantity: 1, unitPrice: 200, taxRate: 15, taxCategory: 'S' }],
    currency: 'SAR',
    subtotal: 200,
    taxTotal: 30,
    total: 230,
    taxTotalSar: 30,
  };
  const reference = { number: 'PP-2026-0003', issued: { date: '2026-06-01', time: '12:28:17' }, taxable: 86.96, tax: 13.04, category: 'S' as const, rate: 15 };

  it('مستندُ 386 يخرج برمزه بلا مرجع فاتورةٍ ولا سبب — أصليٌّ لا إشعار', () => {
    const xml = buildUnsignedInvoiceXml({ ...base, number: 'PP-2026-0003', documentType: 'prepayment', lines: [{ description: 'دفعة مقدَّمة', quantity: 1, unitPrice: 86.96, taxRate: 15, taxCategory: 'S' }], subtotal: 86.96, taxTotal: 13.04, total: 100, taxTotalSar: 13.04 });
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">386</cbc:InvoiceTypeCode>');
    expect(xml).not.toContain('BillingReference');
    expect(xml).not.toContain('PaymentMeans');
    expect(xml).not.toContain('PrepaidAmount');
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">100.00</cbc:PayableAmount>');
  });

  it('فاتورةُ التوريد: سطرُ مرجعٍ بأصفارٍ وتفصيلِ ضريبة الدفعة، والمقدَّمُ Σ(KSA-31 + KSA-32) والمستحقُّ بعده — والمجاميعُ لا تُخفَّض', () => {
    const xml = buildUnsignedInvoiceXml({ ...base, prepayments: [reference] });
    expect(prepaidAmountOf([reference])).toBe(100);
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="SAR">230.00</cbc:TaxInclusiveAmount><cbc:PrepaidAmount currencyID="SAR">100.00</cbc:PrepaidAmount><cbc:PayableAmount currencyID="SAR">130.00</cbc:PayableAmount>');
    // ضريبةُ المستند كاملة (`30`) — لا تُخفَّض بالمقدَّم.
    expect(xml).toContain('<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">30.00</cbc:TaxAmount></cac:TaxTotal>');
    expect(xml.match(/<cac:InvoiceLine>/g)).toHaveLength(2);
    const line = xml.slice(xml.lastIndexOf('<cac:InvoiceLine>'));
    expect(line).toContain('<cbc:ID>2</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">0.00</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">0.00</cbc:LineExtensionAmount>');
    expect(line).toContain('<cac:DocumentReference><cbc:ID>PP-2026-0003</cbc:ID><cbc:IssueDate>2026-06-01</cbc:IssueDate><cbc:IssueTime>12:28:17</cbc:IssueTime><cbc:DocumentTypeCode>386</cbc:DocumentTypeCode></cac:DocumentReference>');
    expect(line).toContain('<cac:TaxTotal><cbc:TaxAmount currencyID="SAR">0.00</cbc:TaxAmount><cbc:RoundingAmount currencyID="SAR">0.00</cbc:RoundingAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">86.96</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">13.04</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent>');
    expect(line).toContain('<cbc:PriceAmount currencyID="SAR">0.00</cbc:PriceAmount>');
    // والدفعةُ لا تدخل سطورَ المستند الأصلية: صافي السطر الأوّل كما هو.
    expect(xml).toContain('<cbc:ID>1</cbc:ID><cbc:InvoicedQuantity>1.0</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">200.00</cbc:LineExtensionAmount>');
  });

  it('بلا دفعاتٍ لا `PrepaidAmount` والمستحقُّ هو الإجماليُّ — كما كان', () => {
    const xml = buildUnsignedInvoiceXml(base);
    expect(xml).not.toContain('PrepaidAmount');
    expect(xml).toContain('<cbc:PayableAmount currencyID="SAR">230.00</cbc:PayableAmount>');
    expect(xml.match(/<cac:InvoiceLine>/g)).toHaveLength(1);
  });
});
