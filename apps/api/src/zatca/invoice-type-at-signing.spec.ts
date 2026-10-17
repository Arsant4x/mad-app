import { withClearedCopyState } from './cleared-invoice.util';
import { documentInvoiceType, gatedReceiptFields, signedTypeOf, zatcaTypeOf } from './hash-chain.util';
import { transactionCode } from './ubl/invoice-xml.util';

/**
 * A signed document keeps the type it was signed as. The readers that name a document's type (the receipt gate, the
 * cleared copy state, the list) follow the stored type once there is one, and derive it from the buyer only before.
 */
const typeCode = (code: string, doc = '388') => `<cbc:ProfileID>reporting:1.0</cbc:ProfileID><cbc:InvoiceTypeCode name="${code}">${doc}</cbc:InvoiceTypeCode>`;

const naturalWithVat = { kind: 'NATURAL', vatNumber: '310000000000003', country: 'SA' };
const naturalNoVat = { kind: 'NATURAL', vatNumber: null, country: 'SA' };
const localLine = [{ taxExemptionReasonCode: null }];

describe('ZATCA type fixed at signing', () => {
  it('reads the transaction code and its type from a signed document, as the builder writes them', () => {
    expect(signedTypeOf(typeCode(transactionCode('standard')))).toEqual({ zatcaInvoiceType: 'STANDARD', zatcaTransactionCode: '0100000' });
    expect(signedTypeOf(typeCode(transactionCode('simplified')))).toEqual({ zatcaInvoiceType: 'SIMPLIFIED', zatcaTransactionCode: '0200000' });
    expect(signedTypeOf(typeCode(transactionCode('standard', { export: true }), '381'))).toEqual({ zatcaInvoiceType: 'STANDARD', zatcaTransactionCode: '0100100' });
  });

  it('finds no type in a document without a readable code', () => {
    expect(signedTypeOf('<Invoice><cbc:ID>INV-1</cbc:ID></Invoice>')).toBeNull();
    expect(signedTypeOf(typeCode('0300000'))).toBeNull();
    expect(signedTypeOf(typeCode('02000'))).toBeNull();
  });

  it('names the stored type in the builder form', () => {
    expect(zatcaTypeOf('STANDARD')).toBe('standard');
    expect(zatcaTypeOf('SIMPLIFIED')).toBe('simplified');
  });

  it('follows the stored type over the buyer card, and derives from the buyer only when nothing is stored', () => {
    expect(documentInvoiceType({ zatcaInvoiceType: 'SIMPLIFIED', customer: naturalWithVat, lines: localLine })).toBe('simplified');
    expect(documentInvoiceType({ zatcaInvoiceType: 'STANDARD', customer: naturalNoVat, lines: localLine })).toBe('standard');
    expect(documentInvoiceType({ zatcaInvoiceType: null, customer: naturalWithVat, lines: localLine })).toBe('standard');
    expect(documentInvoiceType({ zatcaInvoiceType: null, customer: naturalNoVat, lines: localLine })).toBe('simplified');
  });

  it('keeps the receipt of a signed simplified sale open after its buyer gets a VAT number', () => {
    expect(gatedReceiptFields({ zatcaInvoiceType: 'SIMPLIFIED', customer: naturalWithVat, lines: localLine, zatcaStatus: 'STAMPED' }, 'gate')).toBeNull();
    expect(gatedReceiptFields({ zatcaInvoiceType: 'STANDARD', customer: naturalNoVat, lines: localLine, zatcaStatus: 'STAMPED' }, 'gate')).toEqual({
      receiptQr: null,
      stamped: false,
      clearance: { required: true, status: 'STAMPED', message: 'gate' },
    });
  });

  it('waits for no cleared copy of a signed simplified document, and for one of a signed standard document', () => {
    const cleared = { zatcaStatus: 'CLEARED', zatcaClearedXml: null, lines: localLine };
    expect(withClearedCopyState({ ...cleared, zatcaInvoiceType: 'SIMPLIFIED' as const, customer: naturalWithVat }).clearedCopy).toBeNull();
    expect(withClearedCopyState({ ...cleared, zatcaInvoiceType: 'STANDARD' as const, customer: naturalNoVat }).clearedCopy).toBe('missing');
  });
});
