import { createHash } from 'node:crypto';
import { buildUnsignedInvoiceXml, transactionCode, type UblInvoiceInput } from './invoice-xml.util';

/**
 * ⑤A3 (`ق-١٢٦١` ب) — رمزُ المعاملة KSA-2 سباعيٌّ `NNPNESB` (BR-KSA-06): الموضعان الأوّلان نوعُ الفاتورة، ثم خمسةُ أعلامٍ
 * تُشتقّ ولا تُثبَّت — كان الرمزُ ثابتَين (`0100000` · `0200000`) فلا صادراتَ تُعلَم. والهيئةُ ترفض ما يخالف بنيتَها قبل أن
 * يصلها: المبسّطةُ لا تحمل صادراتٍ ولا ذاتية (BR-KSA-31)، ولا ذاتيةَ على صادرات (BR-KSA-07)، وفاتورةُ الصادرات بلا رقمٍ
 * ضريبيٍّ للمشتري (BR-KSA-46).
 */
describe('رمزُ المعاملة KSA-2 — يُشتقّ من الأعلام ويُرمى ما تمنعه الهيئة (⑤A3)', () => {
  it('الغائبُ أصفار، والصادراتُ في الموضع الخامس، وكلُّ علَمٍ في موضعه', () => {
    expect(transactionCode('standard')).toBe('0100000');
    expect(transactionCode('simplified')).toBe('0200000');
    expect(transactionCode('standard', { export: true })).toBe('0100100');
    expect(transactionCode('standard', { thirdParty: true, nominal: true, summary: true, selfBilled: true })).toBe('0111011');
    expect(transactionCode('simplified', { thirdParty: true, nominal: true, summary: true })).toBe('0211010');
  });

  it('المبسّطةُ لا تكون صادراتٍ ولا ذاتية (BR-KSA-31)، ولا ذاتيةَ على صادرات (BR-KSA-07)', () => {
    expect(() => transactionCode('simplified', { export: true })).toThrow('BR-KSA-31');
    expect(() => transactionCode('simplified', { selfBilled: true })).toThrow('BR-KSA-31');
    expect(() => transactionCode('standard', { export: true, selfBilled: true })).toThrow('BR-KSA-07');
  });

  const base: UblInvoiceInput = {
    number: 'INV-2026-0021',
    uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28b9',
    issued: { date: '2026-06-01', time: '09:30:00' },
    invoiceType: 'standard',
    icv: 21,
    pih: createHash('sha256').update('0').digest('base64'),
    seller: { name: 'شركة الأفق التجارية المحدودة', vatNumber: '300000000000003', crNumber: '1010101010', street: 'طريق الملك فهد', buildingNumber: '1234', district: 'العليا', city: 'الرياض', postalCode: '12345' },
    buyer: { name: 'مشترٍ في الإمارات', vatNumber: null, country: 'AE', otherId: { scheme: 'TIN', id: 'AE1234567' } },
    lines: [{ description: 'خدمة مصدَّرة', quantity: 1, unitPrice: 100, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-33' }],
    currency: 'SAR',
    subtotal: 100,
    taxTotal: 0,
    total: 100,
    taxTotalSar: 0,
  };

  it('المستندُ يحمل الرمزَ المشتقّ في سمة الاسم — وبلا أعلامٍ يبقى كما كان', () => {
    expect(buildUnsignedInvoiceXml({ ...base, flags: { export: true } })).toContain('<cbc:InvoiceTypeCode name="0100100">388</cbc:InvoiceTypeCode>');
    expect(buildUnsignedInvoiceXml(base)).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');
    expect(buildUnsignedInvoiceXml({ ...base, invoiceType: 'simplified', buyer: { name: 'عميل نقدي', vatNumber: null } })).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
  });

  it('فاتورةُ الصادرات لا تحمل رقمَ تسجيلٍ ضريبيٍّ للمشتري (BR-KSA-46) — يُرمى قبل البناء', () => {
    expect(() => buildUnsignedInvoiceXml({ ...base, flags: { export: true }, buyer: { ...base.buyer, vatNumber: '311111111111113' } })).toThrow('BR-KSA-46');
  });
});
