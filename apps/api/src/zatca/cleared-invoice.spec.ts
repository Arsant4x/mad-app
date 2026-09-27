import { clearedInvoiceFrom, zatcaFileName } from './cleared-invoice.util';

/**
 * ⚖️ `ق-١٥٠٦` — **النسخةُ المجازة تُقرأ من جواب الهيئة بلا تعديل، واسمُ ملفّها من المستند نفسِه** (معيارُ XML ١.٢، القسم 14).
 * وحالاتُ الرفض (لا نصّ · base64 مكسور · بايتٌ صفريّ · ليس فاتورة UBL) كلُّها «غيرُ واصل» — لا تُنقّى ولا تُقصّ.
 */
const NUL = String.fromCharCode(0);
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

/** مستندٌ أدنى بالعناصر الأربعة التي يُبنى منها الاسم — والمثالُ مثالُ المعيار نفسِه (ص71). */
function invoiceXml(fields: { id?: string; date?: string; time?: string; vat?: string } = {}): string {
  const { id = '2021-05-26-23555', date = '2021-05-26', time = '13:24:00', vat = '300000000000003' } = fields;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"' +
    ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"' +
    ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">' +
    (id ? `<cbc:ID>${id}</cbc:ID>` : '') +
    (date ? `<cbc:IssueDate>${date}</cbc:IssueDate>` : '') +
    (time ? `<cbc:IssueTime>${time}</cbc:IssueTime>` : '') +
    '<cac:AccountingSupplierParty><cac:Party>' +
    (vat ? `<cac:PartyTaxScheme><cbc:CompanyID>${vat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '') +
    '</cac:Party></cac:AccountingSupplierParty>' +
    // مرجعُ فاتورةٍ سابقة يحمل `ID` و`IssueDate`/`IssueTime` أعمق — فالاسمُ من عناصر الجذر لا من أوّل ما يُصادَف.
    '<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>OLD-1</cbc:ID><cbc:IssueDate>2020-01-01</cbc:IssueDate><cbc:IssueTime>01:02:03</cbc:IssueTime></cac:InvoiceDocumentReference></cac:BillingReference>' +
    '</Invoice>'
  );
}

describe('ق-١٥٠٦ النسخةُ المجازة من جواب الهيئة', () => {
  it('تُفكّ كما هي حرفاً — والفراغاتُ في base64 لا تغيّرها', () => {
    const xml = invoiceXml();
    expect(clearedInvoiceFrom({ clearedInvoice: b64(xml) })).toBe(xml);
    const wrapped = b64(xml).replace(/(.{60})/g, '$1\n');
    expect(clearedInvoiceFrom({ clearedInvoice: wrapped })).toBe(xml);
  });

  it('غيرُ واصل: غائبٌ · ليس نصّاً · فارغٌ · base64 مكسور', () => {
    expect(clearedInvoiceFrom({})).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: 42 })).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: '   ' })).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: `${b64(invoiceXml())}!` })).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: b64(invoiceXml()).slice(0, -1) })).toBeNull();
  });

  it('غيرُ واصل: بايتٌ صفريّ (لا يُنقّى مستندُ الهيئة) · ليس فاتورة UBL · نصٌّ ليس XML', () => {
    expect(clearedInvoiceFrom({ clearedInvoice: b64(invoiceXml().replace('</Invoice>', `${NUL}</Invoice>`)) })).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: b64('<Invoice xmlns="urn:other"><ID>1</ID></Invoice>') })).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: b64('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>') })).toBeNull();
    expect(clearedInvoiceFrom({ clearedInvoice: b64('ليس مستنداً') })).toBeNull();
  });
});

describe('ق-١٥٠٦ اسمُ الملف النظاميّ (معيارُ XML ١.٢، القسم 14)', () => {
  it('مثالُ المعيار نفسُه: رقمُ المورّد _ التاريخ T الوقت _ رقمُ الفاتورة', () => {
    expect(zatcaFileName(invoiceXml())).toBe('300000000000003_20210526T132400_2021-05-26-23555.xml');
  });

  it('كلُّ ما ليس حرفاً لاتينياً أو رقماً في رقم الفاتورة شَرطة — والقيمُ من الجذر لا من المرجع', () => {
    expect(zatcaFileName(invoiceXml({ id: 'INV/2026 0001' }))).toBe('300000000000003_20210526T132400_INV-2026-0001.xml');
  });

  it('قيمةٌ غائبة ⟵ null (يسمّيه المستدعي برقمه) — ونصٌّ ليس XML كذلك', () => {
    expect(zatcaFileName(invoiceXml({ vat: '' }))).toBeNull();
    expect(zatcaFileName(invoiceXml({ time: '' }))).toBeNull();
    expect(zatcaFileName('ليس مستنداً')).toBeNull();
  });
});
