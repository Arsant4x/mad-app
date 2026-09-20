import { buildUnsignedInvoiceXml, ublCategoryOf, type UblInvoiceInput, type UblInvoiceLine } from './invoice-xml.util';
import { computeDocumentTotals } from '../../common/money/totals';
import { STANDARD_VAT_RATE } from '../../common/vat/standard-rate';

/**
 * ⑧ حارسُ المُصدَر (`ق-١٢١٢` · معيار XML §11.2.4 · `BR-KSA-CL-04` · `BR-KSA-23`…`26` · `BR-O-05`/`06`):
 * مستندٌ فيه `Z`/`E`/`O` بلا سبب **يُرفض قبل الختم**؛ و`S` لا يحمل سبباً؛ والقديمُ بصفرٍ لا يُختم؛
 * والسببُ يخرج في تفصيل الضريبة برمزه ونصّه؛ و`O` بلا نسبة على السطر وفي التفصيل.
 */
const input = (lines: UblInvoiceLine[]): UblInvoiceInput => {
  const t = computeDocumentTotals(lines);
  return {
    number: 'INV-Z-1',
    uuid: '22222222-2222-2222-2222-222222222222',
    issued: { date: '2026-09-20', time: '10:00:00' },
    invoiceType: 'simplified',
    icv: 1,
    pih: 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==',
    seller: { name: 'صيدلية', vatNumber: '300000000000003' },
    buyer: { name: 'عميل نقدي', vatNumber: null },
    lines,
    currency: 'SAR',
    subtotal: t.subtotal,
    taxTotal: t.taxTotal,
    total: t.total,
    taxTotalSar: t.taxTotal,
  };
};
const standard = (): UblInvoiceLine => ({ description: 'خاضع', quantity: 1, unitPrice: 100, taxRate: STANDARD_VAT_RATE, taxCategory: 'S' });

describe('⑧ المُصدَر — الفئةُ والسبب', () => {
  it('⓪ حارسٌ على المسبار: مستندٌ سليم بفئة Z وسببها يُبنى', () => {
    const xml = buildUnsignedInvoiceXml(input([standard(), { description: 'دواء', quantity: 2, unitPrice: 30, taxRate: 0, taxCategory: 'Z', taxExemptionReasonCode: 'VATEX-SA-35' }]));
    expect(xml).toContain('<cac:ClassifiedTaxCategory><cbc:ID>Z</cbc:ID><cbc:Percent>0.00</cbc:Percent>');
    expect(xml).toContain('<cac:TaxCategory><cbc:ID>Z</cbc:ID><cbc:Percent>0.00</cbc:Percent><cbc:TaxExemptionReasonCode>VATEX-SA-35</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>الأدوية والمعدات الطبية</cbc:TaxExemptionReason><cac:TaxScheme>');
    // السببُ في تفصيل الضريبة (BG-23) لا على السطر.
    expect(xml.match(/TaxExemptionReasonCode/g)).toHaveLength(2);
  });

  it('🔴 Z/E/O بلا رمز سبب يُرفض قبل الختم — BR-KSA-CL-04', () => {
    for (const taxCategory of ['Z', 'E', 'O'] as const) {
      expect(() => buildUnsignedInvoiceXml(input([standard(), { description: 'بلا سبب', quantity: 1, unitPrice: 10, taxRate: 0, taxCategory }]))).toThrow('BR-KSA-CL-04');
    }
  });

  it('🔴 S بسببٍ يُرفض — BR-S؛ والقديمُ بصفرٍ (LEGACY_ZERO) لا يُختم', () => {
    expect(() => ublCategoryOf({ taxCategory: 'S', taxExemptionReasonCode: 'VATEX-SA-35' })).toThrow('BR-S');
    expect(() => buildUnsignedInvoiceXml(input([{ description: 'قديم', quantity: 1, unitPrice: 10, taxRate: 0, taxCategory: 'LEGACY_ZERO' }]))).toThrow('legacy zero-rate');
  });

  it('LEGACY_STANDARD يخرج S بالنسبة الأساسية — استمرارٌ لا تصحيح', () => {
    const xml = buildUnsignedInvoiceXml(input([{ description: 'صنفٌ لم يُعلَن', quantity: 1, unitPrice: 100, taxRate: STANDARD_VAT_RATE, taxCategory: 'LEGACY_STANDARD' }]));
    expect(xml).toContain('<cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent>');
    expect(xml).not.toContain('LEGACY');
  });

  it('O: نصٌّ حرٌّ يخرج كما كُتب، ولا نسبةَ على السطر ولا في التفصيل (BR-O-05 · BR-O-06)', () => {
    const xml = buildUnsignedInvoiceXml(
      input([standard(), { description: 'رسوم', quantity: 1, unitPrice: 25, taxRate: 0, taxCategory: 'O', taxExemptionReasonCode: 'VATEX-SA-OOS', taxExemptionReason: 'رسومٌ حكومية تُحصَّل نيابةً عن الجهة' }]),
    );
    expect(xml).toContain('<cac:ClassifiedTaxCategory><cbc:ID>O</cbc:ID><cac:TaxScheme>');
    expect(xml).toContain('<cac:TaxCategory><cbc:ID>O</cbc:ID><cbc:TaxExemptionReasonCode>VATEX-SA-OOS</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>رسومٌ حكومية تُحصَّل نيابةً عن الجهة</cbc:TaxExemptionReason>');
  });
});
