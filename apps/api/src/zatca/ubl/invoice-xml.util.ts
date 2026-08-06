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
 */

export interface UblInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  /** Percentage, e.g. 15. */
  taxRate: number;
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
  issuedAt: Date;
  /** 'standard' (B2B, cleared) or 'simplified' (B2C, reported). */
  invoiceType: 'standard' | 'simplified';
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

/** `388` is UBL's code for a tax invoice; credit/debit notes would be 381/383. */
const INVOICE_TYPE_CODE = '388';

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

/** Money is always two decimals in UBL, regardless of the currency. */
function money(value: number): string {
  return value.toFixed(2);
}

function quantity(value: number): string {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0');
}

/** ZATCA takes the date and the time as separate elements, both UTC. */
function datePart(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timePart(d: Date): string {
  return d.toISOString().slice(11, 19);
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
  const lineExtension = Math.round(line.quantity * line.unitPrice * 100) / 100;
  const lineTax = Math.round(lineExtension * (line.taxRate / 100) * 100) / 100;

  // S = standard rate, Z = zero-rated. A zero-rate line additionally needs an
  // exemption reason, which our data model does not capture yet.
  const category = line.taxRate > 0 ? 'S' : 'Z';

  return (
    '<cac:InvoiceLine>' +
    `<cbc:ID>${index + 1}</cbc:ID>` +
    `<cbc:InvoicedQuantity unitCode="PCE">${quantity(line.quantity)}</cbc:InvoicedQuantity>` +
    `<cbc:LineExtensionAmount currencyID="${esc(currency)}">${money(lineExtension)}</cbc:LineExtensionAmount>` +
    '<cac:TaxTotal>' +
    `<cbc:TaxAmount currencyID="${esc(currency)}">${money(lineTax)}</cbc:TaxAmount>` +
    `<cbc:RoundingAmount currencyID="${esc(currency)}">${money(lineExtension + lineTax)}</cbc:RoundingAmount>` +
    '</cac:TaxTotal>' +
    '<cac:Item>' +
    `<cbc:Name>${esc(line.description)}</cbc:Name>` +
    '<cac:ClassifiedTaxCategory>' +
    `<cbc:ID>${category}</cbc:ID>` +
    `<cbc:Percent>${money(line.taxRate)}</cbc:Percent>` +
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

  // Tax is reported per category. One category per distinct rate keeps the
  // subtotals reconcilable line by line.
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const line of input.lines) {
    const taxable = Math.round(line.quantity * line.unitPrice * 100) / 100;
    const tax = Math.round(taxable * (line.taxRate / 100) * 100) / 100;
    const bucket = byRate.get(line.taxRate) ?? { taxable: 0, tax: 0 };
    bucket.taxable += taxable;
    bucket.tax += tax;
    byRate.set(line.taxRate, bucket);
  }

  const subtotals = [...byRate.entries()]
    .map(
      ([rate, { taxable, tax }]) =>
        '<cac:TaxSubtotal>' +
        `<cbc:TaxableAmount currencyID="${esc(currency)}">${money(taxable)}</cbc:TaxableAmount>` +
        `<cbc:TaxAmount currencyID="${esc(currency)}">${money(tax)}</cbc:TaxAmount>` +
        '<cac:TaxCategory>' +
        `<cbc:ID>${rate > 0 ? 'S' : 'Z'}</cbc:ID>` +
        `<cbc:Percent>${money(rate)}</cbc:Percent>` +
        '<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>' +
        '</cac:TaxCategory>' +
        '</cac:TaxSubtotal>',
    )
    .join('');

  return (
    `<?xml version="1.0" encoding="UTF-8"?><Invoice ${NAMESPACES}>` +
    `<cbc:ProfileID>${PROFILE_ID}</cbc:ProfileID>` +
    `<cbc:ID>${esc(input.number)}</cbc:ID>` +
    `<cbc:UUID>${esc(input.uuid)}</cbc:UUID>` +
    `<cbc:IssueDate>${datePart(input.issuedAt)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${timePart(input.issuedAt)}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode name="${TRANSACTION_CODE[input.invoiceType]}">${INVOICE_TYPE_CODE}</cbc:InvoiceTypeCode>` +
    `<cbc:DocumentCurrencyCode>${esc(currency)}</cbc:DocumentCurrencyCode>` +
    // Always SAR: the authority accounts for the tax in local currency even
    // when the invoice is denominated in another one.
    '<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>' +
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
