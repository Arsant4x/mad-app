import { createHash } from 'node:crypto';
import { buildUnsignedInvoiceXml, type UblInvoiceInput } from './invoice-xml.util';

/**
 * ① وحدةُ الكمّية في مستند الهيئة **تُقرأ من السطر ولا تُثبَّت** (ق-١٠٦٩):
 * كان `unitCode="PCE"` ثابتاً لكلِّ سطر — حدٌّ أُعلن في ق-١٠٦٠ وقِيس هنا. صار السطرُ يحمل
 * رمزَه المعلَن، وسطرٌ بلا وحدةٍ معلَنة يخرج **بلا السمة** (اختياريةٌ في قاموس الهيئة، `BT-130`
 * بـ`0..1`) — لا برمزٍ مخمَّن.
 */
describe('مستندُ الهيئة — وحدةُ الكمّية من السطر لا ثابتة (① · ق-١٠٦٩)', () => {
  const base: UblInvoiceInput = {
    number: 'INV-2026-0009',
    uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28b9',
    issued: { date: '2026-06-01', time: '09:30:00' },
    invoiceType: 'standard',
    icv: 9,
    pih: createHash('sha256').update('0').digest('base64'),
    seller: { name: 'شركة الأفق التجارية المحدودة', vatNumber: '300000000000003', crNumber: '1010101010', street: 'طريق الملك فهد', buildingNumber: '1234', district: 'العليا', city: 'الرياض', postalCode: '12345' },
    buyer: { name: 'مؤسسة المشتري', vatNumber: '311111111111113' },
    lines: [
      { description: 'أرزّ بالكيلو', quantity: 2, unitCode: 'KGM', unitPrice: 100, taxRate: 15, taxCategory: 'S' },
      { description: 'صنفٌ قديم بلا وحدةٍ معلَنة', quantity: 1, unitCode: null, unitPrice: 50, taxRate: 15, taxCategory: 'S' },
      { description: 'خدمةٌ بلا صنف', quantity: 1, unitPrice: 30, taxRate: 15, taxCategory: 'S' },
    ],
    currency: 'SAR',
    subtotal: 280,
    taxTotal: 42,
    total: 322,
    taxTotalSar: 42,
  };

  it('السطرُ المعلَن يحمل رمزَه، وغيرُ المعلَن يخرج بلا سمةٍ — ولا `PCE` في المستند', () => {
    const xml = buildUnsignedInvoiceXml(base);
    // الكمّيةُ تُكتب بلا أصفارٍ زائدة (`2.0`) — مقروءةٌ من المولِّد لا مفترَضة.
    expect(xml).toContain('<cbc:InvoicedQuantity unitCode="KGM">2.0</cbc:InvoicedQuantity>');
    // سطران بلا وحدة (`null` وغيرُ محدَّد) — كلاهما بلا سمة.
    expect(xml.match(/<cbc:InvoicedQuantity>1\.0<\/cbc:InvoicedQuantity>/g)).toHaveLength(2);
    expect(xml).not.toContain('PCE');
    expect(xml.match(/<cac:InvoiceLine>/g)).toHaveLength(3);
  });

  it('الرمزُ يُهرَّب كأيِّ سمة — لا حقنَ من رمزٍ شاذّ', () => {
    const xml = buildUnsignedInvoiceXml({ ...base, lines: [{ description: 'x', quantity: 1, unitCode: 'A"B', unitPrice: 1, taxRate: 15, taxCategory: 'S' }] });
    expect(xml).toContain('unitCode="A&quot;B"');
  });
});
