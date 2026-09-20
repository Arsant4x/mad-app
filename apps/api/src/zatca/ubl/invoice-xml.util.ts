/**
 * Builds the UBL 2.1 invoice document ZATCA expects.
 *
 * ⚠️ **Not yet validated against the authority.** The element set, ordering and
 * codes below follow the published E-Invoicing technical guideline, but that
 * document is versioned and validation happens at ZATCA, not here. Treat a
 * rejection as a spec-drift question first.
 *
 * Two structural notes that are easy to get wrong:
 *
 * 1. **Element order is significant.** UBL is defined by an XSD sequence, so
 *    these fields cannot be reordered for readability.
 * 2. **The document is emitted without `UBLExtensions`, the QR reference, or
 *    `cac:Signature`.** That is deliberate — those three are exactly what the
 *    invoice hash excludes, so hashing this document *before* they exist gives
 *    the same digest as applying ZATCA's XPath removals afterwards, without
 *    needing an XPath engine. `xades.util.ts` inserts them after hashing.
 *
 * **كنسة التدوير (قرار المالك 2026-09-03):** كل مبلغٍ هنا يمرّ من سياسة التدوير
 * المركزية (`formatMoney`) ومجاميعُ البنود والنِّسَب من `computeDocumentTotals` —
 * **الدالة نفسها التي يحسب بها الدفتر** — فلا يفترق المستند المختوم عن المرحَّل.
 * كان هذا الملف يدوّر بـ`Math.round` و`toFixed` الخام، ولـ`toFixed` تدويرٌ يخالف
 * `Math.round` عند الأنصاف السالبة (إشعارٌ دائن)، فكان الفرق هللةً لا تُقفل.
 */

import { formatMoney } from '../../common/money/rounding';
import { computeDocumentTotals, lineNet, lineTax, type BucketCategory } from '../../common/money/totals';
import { exemptionReasonByCode } from '../../common/vat/exemption-reasons';
import type { WallClock } from '../../common/wall-clock.util';

/** ⑧ فئةُ السطر كما على المستند — `LEGACY_STANDARD` يخرج `S`؛ و`LEGACY_ZERO` لا يخرج أبداً (يُرفض قبل الختم). */
export type UblTaxCategory = 'S' | 'Z' | 'E' | 'O' | 'LEGACY_STANDARD' | 'LEGACY_ZERO';

export interface UblInvoiceLine {
  description: string;
  quantity: number;
  /** ① رمزُ وحدة الكمّية كما كُتب على السطر (UN/ECE Rec 20)؛ `null` ⇒ لا تُرسَل السمةُ أصلاً —
   * فهي اختياريةٌ في قاموس الهيئة (`BT-130`، `0..1`)، ولا يُرسَل `PCE` صامتاً لما لم يُعلَن. */
  unitCode?: string | null;
  unitPrice: number;
  /** Percentage, e.g. 15. */
  taxRate: number;
  /** ⑧ فئةُ ضريبة القيمة المضافة (`BT-151` على السطر · `BT-118` في التفصيل) — إلزاميّة. */
  taxCategory: UblTaxCategory;
  /** ⑧ رمزُ سبب الإعفاء (`BT-121`) — إلزاميٌّ لغير `S` (`BR-KSA-CL-04`)، ممنوعٌ على `S` (`BR-S`). */
  taxExemptionReasonCode?: string | null;
  /** ⑧ نصُّ السبب (`BT-120`): نصُّ `O` الحرّ؛ ولغيرها يُشتقّ من القائمة إن غاب. */
  taxExemptionReason?: string | null;
}

/**
 * ⑧ الفئةُ كما تُكتب في `cbc:ID`، بعد فحص ما تشترطه الهيئة — يُرمى **قبل الختم** لا يُكتشف رفضاً بعد أسابيع:
 * `LEGACY_ZERO` لا فئةَ له فلا يُختم؛ و`Z`/`E`/`O` بلا سبب مخالفةٌ لـ`BR-KSA-CL-04`؛ و`S` لا يحمل سبباً.
 */
export function ublCategoryOf(line: Pick<UblInvoiceLine, 'taxCategory' | 'taxExemptionReasonCode'>): 'S' | 'Z' | 'E' | 'O' {
  if (line.taxCategory === 'LEGACY_ZERO') throw new Error('A legacy zero-rate line has no VAT category — it cannot be stamped (declare its category on a new document).');
  const category = line.taxCategory === 'LEGACY_STANDARD' ? 'S' : line.taxCategory;
  if (category === 'S' && line.taxExemptionReasonCode) throw new Error('A standard-rated line must not carry an exemption reason (BR-S).');
  if (category !== 'S' && !line.taxExemptionReasonCode) throw new Error(`A ${category} line requires a VAT exemption reason code (BR-KSA-CL-04).`);
  return category;
}

/** نصُّ السبب كما يخرج: نصُّ السطر إن وُجد (خارج النطاق)، وإلا النصُّ العربي للرمز من قائمة الهيئة. */
function reasonTextFor(category: BucketCategory, code: string | null, text: string | null): string | null {
  if (category === 'S' || category === 'LEGACY_ZERO') return null;
  return text ?? exemptionReasonByCode(code)?.ar ?? null;
}

export interface UblParty {
  name: string;
  vatNumber: string | null;
  crNumber?: string | null;
  /** ZATCA wants a structured address; see `address` on the input for what we
   * currently have and the gap it leaves. */
  street?: string | null;
  buildingNumber?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
}

export interface UblInvoiceInput {
  /** Human invoice number (cbc:ID) — not the UUID. */
  number: string;
  uuid: string;
  /** يومُ الإصدار ووقتُه كما يقرؤهما الجهاز — `issuedWallClock`/`wallClockOf` (`ق-١٨٥`). */
  issued: WallClock;
  /** 'standard' (B2B, cleared) or 'simplified' (B2C, reported). */
  invoiceType: 'standard' | 'simplified';
  /** Which of the three ZATCA document kinds this is. Defaults to 'invoice'.
   * Credit and debit notes keep the same `Invoice` root element — ZATCA does
   * not use UBL's separate CreditNote/DebitNote documents; only the type code
   * and the two fields below distinguish them. */
  documentType?: UblDocumentType;
  /** Credit/debit notes only (BR-KSA-56): the invoice being adjusted, referenced
   * by its human number via cac:BillingReference. */
  billingReference?: { invoiceNumber: string };
  /** Credit/debit notes only (BR-KSA-17): why the adjustment was issued.
   * Travels as cac:PaymentMeans/cbc:InstructionNote. */
  adjustmentReason?: string;
  /** Invoice Counter Value — a gapless per-company sequence starting at 1. */
  icv: number;
  /** Previous Invoice Hash, base64. */
  pih: string;

  seller: UblParty;
  buyer: UblParty;
  lines: UblInvoiceLine[];

  currency: string;
  subtotal: number;
  taxTotal: number;
  total: number;
  /** The tax figures again in SAR. ZATCA always wants the tax in the local
   * currency, even when the invoice itself is issued in another one. */
  taxTotalSar: number;
}

export type UblDocumentType = 'invoice' | 'credit' | 'debit';

/** UNTDID 1001: 388 tax invoice, 381 credit note, 383 debit note. ZATCA's
 * compliance check demands all three, in both standard and simplified form,
 * before it will issue a production CSID. */
const DOCUMENT_TYPE_CODE: Record<UblDocumentType, string> = {
  invoice: '388',
  credit: '381',
  debit: '383',
};

/** UNTDID 4461 payment means. Our data model doesn't capture how an adjustment
 * is settled, and ZATCA validates only that the element and its InstructionNote
 * are present on 381/383 — so a fixed `10` (cash) is emitted. */
const ADJUSTMENT_PAYMENT_MEANS_CODE = '10';

/**
 * The `name` attribute on the type code is a seven-digit flag string. Position 1
 * distinguishes standard (1) from simplified (2); the rest cover third-party,
 * nominal, export, summary and self-billing, none of which apply here.
 */
const TRANSACTION_CODE = { standard: '0100000', simplified: '0200000' } as const;

/** Standard invoices are cleared before issue, simplified ones reported after. */
const PROFILE_ID = 'reporting:1.0';

const NAMESPACES = [
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"',
  'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"',
  'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"',
  'xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"',
].join(' ');

/** XML text escaping. Arabic names routinely contain `&`, and an unescaped one
 * makes the whole document unparseable at the authority. */
function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Money is always two decimals in UBL, regardless of the currency — rounded by
 * the central policy first, then formatted; never `toFixed` on a raw value. */
function money(value: number): string {
  return formatMoney(value);
}

function quantity(value: number): string {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0');
}

function partyXml(tag: string, party: UblParty): string {
  // The VAT number travels as a PartyTaxScheme; the CR number, when present, is
  // the PartyIdentification with a CRN scheme.
  const identification = party.crNumber
    ? `<cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(party.crNumber)}</cbc:ID></cac:PartyIdentification>`
    : '';

  // A simplified invoice's buyer usually has no VAT registration at all, and
  // ZATCA rejects an empty PartyTaxScheme — so it is omitted entirely.
  const taxScheme = party.vatNumber
    ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(party.vatNumber)}</cbc:CompanyID>` +
      `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
    : `<cac:PartyTaxScheme><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`;

  return (
    `<${tag}><cac:Party>` +
    identification +
    '<cac:PostalAddress>' +
    `<cbc:StreetName>${esc(party.street ?? '')}</cbc:StreetName>` +
    `<cbc:BuildingNumber>${esc(party.buildingNumber ?? '')}</cbc:BuildingNumber>` +
    `<cbc:CitySubdivisionName>${esc(party.district ?? '')}</cbc:CitySubdivisionName>` +
    `<cbc:CityName>${esc(party.city ?? '')}</cbc:CityName>` +
    `<cbc:PostalZone>${esc(party.postalCode ?? '')}</cbc:PostalZone>` +
    '<cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>' +
    '</cac:PostalAddress>' +
    taxScheme +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(party.name)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    `</cac:Party></${tag}>`
  );
}

function lineXml(line: UblInvoiceLine, index: number, currency: string): string {
  // نفس صافي البند وضريبته اللذين يبني بهما الدفتر مجاميعه — لا حسابٌ ثانٍ هنا.
  const lineExtension = lineNet(line);
  const lineTaxAmount = lineTax(line);

  // ⑧ الفئةُ من السطر كما نُسخت لحظةَ البيع (كانت تُشتقّ من النسبة: `S` لما فوق الصفر و`Z` لغيره —
  // فخرج المعفى «نسبةَ صفر» بلا سبب). والسببُ يُكتب في تفصيل الضريبة (`BG-23`) لا على السطر؛
  // ولفئة `O` لا تُكتب النسبةُ أصلاً (`BR-O-05`).
  const category = ublCategoryOf(line);
  const percent = category === 'O' ? '' : `<cbc:Percent>${money(line.taxRate)}</cbc:Percent>`;

  // ① وحدةُ الكمّية تُقرأ من السطر لا تُثبَّت: كان `unitCode="PCE"` ثابتاً لكلِّ سطر (حدٌّ أُعلن في
  // ق-١٠٦٠ وقِيس في ق-١٠٦٩). سطرٌ بلا وحدةٍ معلَنة يخرج بلا السمة — لا برمزٍ مخمَّن.
  const unit = line.unitCode ? ` unitCode="${esc(line.unitCode)}"` : '';

  return (
    '<cac:InvoiceLine>' +
    `<cbc:ID>${index + 1}</cbc:ID>` +
    `<cbc:InvoicedQuantity${unit}>${quantity(line.quantity)}</cbc:InvoicedQuantity>` +
    `<cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(lineExtension)}</cbc:LineExtensionAmount>` +
    '<cac:TaxTotal>' +
    `<cbc:TaxAmount currencyID="${esc(currency)}">${money(lineTaxAmount)}</cbc:TaxAmount>` +
    `<cbc:RoundingAmount currencyID="${esc(currency)}">${money(lineExtension + lineTaxAmount)}</cbc:RoundingAmount>` +
    '</cac:TaxTotal>' +
    '<cac:Item>' +
    `<cbc:Name>${esc(line.description)}</cbc:Name>` +
    '<cac:ClassifiedTaxCategory>' +
    `<cbc:ID>${category}</cbc:ID>` +
    percent +
    '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>' +
    '</cac:ClassifiedTaxCategory>' +
    '</cac:Item>' +
    '<cac:Price>' +
    `<cbc:PriceAmount currencyID="${esc(currency)}">${money(line.unitPrice)}</cbc:PriceAmount>` +
    '</cac:Price>' +
    '</cac:InvoiceLine>'
  );
}

/**
 * The invoice as it stands before signing: no UBLExtensions, no QR, no
 * cac:Signature. This is the document that gets hashed.
 */
export function buildUnsignedInvoiceXml(input: UblInvoiceInput): string {
  const { currency } = input;
  const documentType = input.documentType ?? 'invoice';

  // A 381/383 without its original-invoice reference or reason is rejected by
  // the authority unconditionally (BR-KSA-56 / BR-KSA-17) — failing here keeps
  // that a programming error instead of a clearance rejection weeks later.
  if (documentType !== 'invoice' && (!input.billingReference || !input.adjustmentReason?.trim())) {
    throw new Error(`A ${documentType} note requires billingReference and adjustmentReason.`);
  }

  // UBL's sequence puts BillingReference *before* AdditionalDocumentReference
  // (the ICV/PIH blocks) and PaymentMeans after the customer party.
  const billingReference =
    documentType !== 'invoice'
      ? '<cac:BillingReference><cac:InvoiceDocumentReference>' +
        `<cbc:ID>${esc(input.billingReference!.invoiceNumber)}</cbc:ID>` +
        '</cac:InvoiceDocumentReference></cac:BillingReference>'
      : '';
  const paymentMeans =
    documentType !== 'invoice'
      ? '<cac:PaymentMeans>' +
        `<cbc:PaymentMeansCode>${ADJUSTMENT_PAYMENT_MEANS_CODE}</cbc:PaymentMeansCode>` +
        `<cbc:InstructionNote>${esc(input.adjustmentReason!)}</cbc:InstructionNote>` +
        '</cac:PaymentMeans>'
      : '';

  // ⑧ كلُّ سطرٍ يُفحص قبل التفصيل — فمستندٌ فيه سطرٌ لا يُختم يُرمى هنا لا في منتصف بنائه.
  input.lines.forEach(ublCategoryOf);

  // Tax is reported per category — ⑧ one `TaxSubtotal` per (category · rate · reason), the
  // taxable amount being the sum of that key's rounded line nets and the tax being
  // taxable × rate rounded once (BR-S-08/09), exactly as the ledger does. The exemption
  // reason (BT-121 code, BT-120 text) lives here in the VAT breakdown (BG-23) per
  // BR-KSA-23…26 — not on the line; and a category-O breakdown carries no rate (BR-O-06).
  const { byRate } = computeDocumentTotals(input.lines);

  const subtotals = byRate
    .map(({ category, rate, reasonCode, reasonText, taxable, tax }) => {
      const text = reasonTextFor(category, reasonCode, reasonText);
      const reason =
        category === 'S' || category === 'LEGACY_ZERO'
          ? ''
          : `<cbc:TaxExemptionReasonCode>${esc(reasonCode ?? '')}</cbc:TaxExemptionReasonCode>` + (text ? `<cbc:TaxExemptionReason>${esc(text)}</cbc:TaxExemptionReason>` : '');
      return (
        '<cac:TaxSubtotal>' +
        `<cbc:TaxableAmount currencyID="${esc(currency)}">${money(taxable)}</cbc:TaxableAmount>` +
        `<cbc:TaxAmount currencyID="${esc(currency)}">${money(tax)}</cbc:TaxAmount>` +
        '<cac:TaxCategory>' +
        `<cbc:ID>${category}</cbc:ID>` +
        (category === 'O' ? '' : `<cbc:Percent>${money(rate)}</cbc:Percent>`) +
        reason +
        '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>' +
        '</cac:TaxCategory>' +
        '</cac:TaxSubtotal>'
      );
    })
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8"?><Invoice ${NAMESPACES}>` +
    `<cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>` +
    `<cbc:ID>${esc(input.number)}</cbc:ID>` +
    `<cbc:UUID>${esc(input.uuid)}</cbc:UUID>` +
    // ساعةُ حائطٍ جاهزة من `wall-clock.util.ts` — لا حسابَ منطقةٍ هنا: محلّيةٌ بلا
    // لاحقة أو UTC بـ`Z`، وهما الصيغتان الوحيدتان في معيار الهيئة (`ق-١٨٥`).
    `<cbc:IssueDate>${esc(input.issued.date)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${esc(input.issued.time)}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode name="${TRANSACTION_CODE[input.invoiceType]}">${DOCUMENT_TYPE_CODE[documentType]}</cbc:InvoiceTypeCode>` +
    `<cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>` +
    // Always SAR: the authority accounts for the tax in local currency even
    // when the invoice is denominated in another one.
    '<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>' +
    billingReference +
    // ICV and PIH: the two references that make the invoice chain verifiable.
    '<cac:AdditionalDocumentReference>' +
    '<cbc:ID>ICV</cbc:ID>' +
    `<cbc:UUID>${input.icv}</cbc:UUID>` +
    '</cac:AdditionalDocumentReference>' +
    '<cac:AdditionalDocumentReference>' +
    '<cbc:ID>PIH</cbc:ID>' +
    '<cac:Attachment>' +
    `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(input.pih)}</cbc:EmbeddedDocumentBinaryObject>` +
    '</cac:Attachment>' +
    '</cac:AdditionalDocumentReference>' +
    partyXml('cac:AccountingSupplierParty', input.seller) +
    partyXml('cac:AccountingCustomerParty', input.buyer) +
    paymentMeans +
    '<cac:TaxTotal>' +
    `<cbc:TaxAmount currencyID="SAR">${money(input.taxTotalSar)}</cbc:TaxAmount>` +
    '</cac:TaxTotal>' +
    '<cac:TaxTotal>' +
    `<cbc:TaxAmount currencyID="${esc(currency)}">${money(input.taxTotal)}</cbc:TaxAmount>` +
    subtotals +
    '</cac:TaxTotal>' +
    '<cac:LegalMonetaryTotal>' +
    `<cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(input.subtotal)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount currencyID="${esc(currency)}">${money(input.subtotal)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="${esc(currency)}">${money(input.total)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="${esc(currency)}">${money(input.total)}</cbc:PayableAmount>` +
    '</cac:LegalMonetaryTotal>' +
    input.lines.map((line, i) => lineXml(line, i, currency)).join('') +
    '</Invoice>'
  );
}
