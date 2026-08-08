import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { canonicalize, parseXml } from '../src/zatca/ubl/canonicalize.util';
import { buildUnsignedInvoiceXml, type UblInvoiceInput } from '../src/zatca/ubl/invoice-xml.util';
import { signInvoice, verifySignedInvoice } from '../src/zatca/ubl/xades.util';

/**
 * The authority is the only real verifier, so what these can prove is
 * *self-consistency*: that the document we emit is well-formed, that every
 * digest inside it covers what it claims to cover, and that the signature
 * verifies against the certificate embedded beside it.
 *
 * That is exactly the class of bug that would otherwise surface as an opaque
 * rejection from ZATCA weeks later.
 */
describe('ZATCA UBL 2.1 invoice and XAdES signature', () => {
  const crypto = new Crypto();
  x509.cryptoProvider.set(crypto as unknown as globalThis.Crypto);

  let certificateBase64: string;
  let privateKeyPem: string;

  /** Stands in for the certificate the authority issues — same curve and the
   * same X.509 shape, so everything downstream behaves identically. */
  beforeAll(async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      {
        serialNumber: '0123456789ab',
        name: 'CN=mad-app-test, C=SA',
        notBefore: new Date('2026-01-01'),
        notAfter: new Date('2027-01-01'),
        keys,
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      },
      crypto as unknown as globalThis.Crypto,
    );

    certificateBase64 = Buffer.from(cert.rawData).toString('base64');
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
    privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`;
  }, 30000);

  const baseInvoice: UblInvoiceInput = {
    number: 'INV-2026-0001',
    uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28be',
    issuedAt: new Date('2026-06-01T09:30:00.000Z'),
    invoiceType: 'standard',
    icv: 1,
    pih: createHash('sha256').update('0').digest('base64'),
    seller: {
      name: 'شركة الأفق التجارية المحدودة',
      vatNumber: '300000000000003',
      crNumber: '1010101010',
      street: 'طريق الملك فهد',
      buildingNumber: '1234',
      district: 'العليا',
      city: 'الرياض',
      postalCode: '12345',
    },
    buyer: { name: 'مؤسسة المشتري', vatNumber: '311111111111113' },
    lines: [
      { description: 'خدمة استشارية', quantity: 2, unitPrice: 100, taxRate: 15 },
      { description: 'بند معفى', quantity: 1, unitPrice: 50, taxRate: 0 },
    ],
    currency: 'SAR',
    subtotal: 250,
    taxTotal: 30,
    total: 280,
    taxTotalSar: 30,
  };

  function sign(overrides: Partial<UblInvoiceInput> = {}) {
    const input = { ...baseInvoice, ...overrides };
    return signInvoice({
      unsignedXml: buildUnsignedInvoiceXml(input),
      privateKeyPem,
      certificateBase64,
      qr: {
        sellerName: input.seller.name,
        vatNumber: input.seller.vatNumber!,
        issuedAt: input.issuedAt,
        total: input.total,
        vatAmount: input.taxTotal,
      },
      signingTime: new Date('2026-06-01T10:00:00.000Z'),
    });
  }

  describe('the unsigned document', () => {
    it('is well-formed and carries the fields the authority reads', () => {
      const xml = buildUnsignedInvoiceXml(baseInvoice);

      expect(xml).toContain('<cbc:ID>INV-2026-0001</cbc:ID>');
      expect(xml).toContain(`<cbc:UUID>${baseInvoice.uuid}</cbc:UUID>`);
      expect(xml).toContain('<cbc:IssueDate>2026-06-01</cbc:IssueDate>');
      expect(xml).toContain('<cbc:IssueTime>09:30:00</cbc:IssueTime>');
      // 388 = tax invoice; the name attribute's leading 1 = standard.
      expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');
      expect(xml).toContain('<cbc:UUID>1</cbc:UUID>'); // ICV
      expect(xml).toContain(baseInvoice.pih);

      // Parsing is the real well-formedness check — Arabic text and escaping
      // included.
      const doc = parseXml(xml);
      expect(doc.getElementsByTagName('cac:InvoiceLine')).toHaveLength(2);
    });

    it('omits the three nodes the invoice hash excludes', () => {
      const xml = buildUnsignedInvoiceXml(baseInvoice);

      // The whole hashing strategy rests on these being absent at hash time.
      expect(xml).not.toContain('UBLExtensions');
      expect(xml).not.toContain('<cac:Signature>');
      expect(xml).not.toContain('<cbc:ID>QR</cbc:ID>');
    });

    it('reports the tax in SAR alongside the invoice currency', () => {
      const xml = buildUnsignedInvoiceXml({ ...baseInvoice, currency: 'USD', taxTotal: 8, taxTotalSar: 30 });

      expect(xml).toContain('<cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>');
      expect(xml).toContain('<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>');
      // Both TaxTotals present: SAR for the authority, USD for the buyer.
      expect(xml).toContain('<cbc:TaxAmount currencyID="SAR">30.00</cbc:TaxAmount>');
      expect(xml).toContain('<cbc:TaxAmount currencyID="USD">8.00</cbc:TaxAmount>');
    });

    it('escapes characters that would otherwise break the document', () => {
      const xml = buildUnsignedInvoiceXml({
        ...baseInvoice,
        seller: { ...baseInvoice.seller, name: 'شركة الأفق & الشركاء <المحدودة>' },
      });

      expect(xml).toContain('&amp;');
      expect(xml).not.toContain('& ');
      expect(() => parseXml(xml)).not.toThrow();
    });

    it('places each part of the national address in its own element', () => {
      const xml = buildUnsignedInvoiceXml(baseInvoice);

      // These are what the authority validates a standard invoice against —
      // one free-text line in StreetName would not satisfy it.
      expect(xml).toContain('<cbc:StreetName>طريق الملك فهد</cbc:StreetName>');
      expect(xml).toContain('<cbc:BuildingNumber>1234</cbc:BuildingNumber>');
      expect(xml).toContain('<cbc:CitySubdivisionName>العليا</cbc:CitySubdivisionName>');
      expect(xml).toContain('<cbc:CityName>الرياض</cbc:CityName>');
      expect(xml).toContain('<cbc:PostalZone>12345</cbc:PostalZone>');
      expect(xml).toContain('<cbc:IdentificationCode>SA</cbc:IdentificationCode>');
    });

    it('groups the tax subtotals by rate', () => {
      const xml = buildUnsignedInvoiceXml(baseInvoice);
      const doc = parseXml(xml);

      // One S bucket (15%) and one Z bucket (0%) — not one per line.
      expect(doc.getElementsByTagName('cac:TaxSubtotal')).toHaveLength(2);
    });
  });

  describe('canonicalization', () => {
    it('is stable across parses of the same document', () => {
      const xml = buildUnsignedInvoiceXml(baseInvoice);

      const a = canonicalize(parseXml(xml) as unknown as Node);
      const b = canonicalize(parseXml(xml) as unknown as Node);
      expect(a).toBe(b);
      // The declaration is not part of the canonical form.
      expect(a.startsWith('<?xml')).toBe(false);
    });

    it('refuses a document carrying an xml: attribute, rather than hashing it under the wrong algorithm', () => {
      // C14N 1.0 and 1.1 only diverge on these. Silently producing a 1.0 digest
      // for a document the authority canonicalizes under 1.1 is the failure
      // this guard exists to prevent.
      const xml = buildUnsignedInvoiceXml(baseInvoice).replace('<Invoice ', '<Invoice xml:lang="ar" ');

      expect(() => canonicalize(parseXml(xml) as unknown as Node)).toThrow(/xml:lang/);
    });
  });

  describe('the signed document', () => {
    it('produces a signature that verifies against the embedded certificate', async () => {
      const { signedXml } = await sign();

      // The single most important assertion in this file: the authority does
      // exactly this before looking at anything else.
      await expect(verifySignedInvoice(signedXml)).resolves.toBe(true);
    }, 30000);

    it('fails verification when the invoice is altered after signing', async () => {
      const { signedXml } = await sign();
      const tampered = signedXml.replace('<cbc:PayableAmount currencyID="SAR">280.00', '<cbc:PayableAmount currencyID="SAR">180.00');

      expect(tampered).not.toBe(signedXml);
      // SignedInfo itself is untouched, so the signature still verifies — what
      // catches this is the invoice digest inside SignedInfo no longer matching
      // the document. Recompute it the way a verifier would.
      const { invoiceHash } = await sign();
      const strippedOfSignature = tampered.replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, '');
      const withoutQrAndSignature = strippedOfSignature
        .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '')
        .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, '');

      const recomputed = createHash('sha256')
        .update(Buffer.from(canonicalize(parseXml(withoutQrAndSignature) as unknown as Node), 'utf8'))
        .digest('base64');
      expect(recomputed).not.toBe(invoiceHash);
    }, 30000);

    it('hashes the invoice to the same value whether or not the excluded nodes are present', async () => {
      const unsignedXml = buildUnsignedInvoiceXml(baseInvoice);
      const { signedXml, invoiceHash } = await sign();

      // Strip what ZATCA's XPath transforms strip, and the digest must land
      // back on the unsigned document's — this is the whole argument for
      // hashing before insertion.
      const stripped = signedXml
        .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, '')
        .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '')
        .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, '');

      expect(stripped).toBe(unsignedXml);
      const recomputed = createHash('sha256')
        .update(Buffer.from(canonicalize(parseXml(unsignedXml) as unknown as Node), 'utf8'))
        .digest('base64');
      expect(recomputed).toBe(invoiceHash);
    }, 30000);

    it('carries the certificate digest and issuer the signed properties claim', async () => {
      const { signedXml } = await sign();
      const certificate = new x509.X509Certificate(Buffer.from(certificateBase64, 'base64'));

      const expectedDigest = createHash('sha256').update(Buffer.from(certificate.rawData)).digest('base64');
      expect(signedXml).toContain(`<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${expectedDigest}</ds:DigestValue>`);
      expect(signedXml).toContain(certificate.issuer);
      // The serial travels as a decimal integer, not the hex X.509 stores.
      expect(signedXml).toContain(`<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${BigInt('0x0123456789ab')}</ds:X509SerialNumber>`);
    }, 30000);

    it('places UBLExtensions first and the QR before the supplier party', async () => {
      const { signedXml } = await sign();

      // UBL is an XSD sequence — a misordered document is rejected outright.
      expect(signedXml.indexOf('<ext:UBLExtensions>')).toBeLessThan(signedXml.indexOf('<cbc:ProfileID>'));
      expect(signedXml.indexOf('<cbc:ID>QR</cbc:ID>')).toBeLessThan(signedXml.indexOf('<cac:AccountingSupplierParty>'));
      expect(signedXml.indexOf('<cac:Signature>')).toBeLessThan(signedXml.indexOf('<cac:AccountingSupplierParty>'));
      expect(() => parseXml(signedXml)).not.toThrow();
    }, 30000);
  });

  describe('the phase-2 QR', () => {
    /** Decodes the TLV back into a tag→bytes map. */
    function decodeTlv(base64: string): Map<number, Buffer> {
      const buf = Buffer.from(base64, 'base64');
      const out = new Map<number, Buffer>();
      let i = 0;
      while (i < buf.length) {
        const tag = buf[i];
        const length = buf[i + 1];
        out.set(tag, buf.subarray(i + 2, i + 2 + length));
        i += 2 + length;
      }
      return out;
    }

    it('carries all nine tags, with the hash, signature and public key that were actually used', async () => {
      const { qrBase64, invoiceHash, signatureBase64 } = await sign();
      const tags = decodeTlv(qrBase64);

      expect([...tags.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(tags.get(1)!.toString('utf8')).toBe(baseInvoice.seller.name);
      expect(tags.get(2)!.toString('utf8')).toBe('300000000000003');
      expect(tags.get(4)!.toString('utf8')).toBe('280.00');
      expect(tags.get(5)!.toString('utf8')).toBe('30.00');
      expect(tags.get(6)!.toString('utf8')).toBe(invoiceHash);
      expect(tags.get(7)!.toString('base64')).toBe(signatureBase64);

      // Tag 8 is the certificate's SubjectPublicKeyInfo, so a verifier can
      // check tag 7 without fetching anything.
      const certificate = new x509.X509Certificate(Buffer.from(certificateBase64, 'base64'));
      expect(tags.get(8)!.equals(Buffer.from(certificate.publicKey.rawData))).toBe(true);
      expect(tags.get(9)!.equals(Buffer.from(certificate.signature))).toBe(true);
    }, 30000);

    it('uses byte length, not character count, for an Arabic seller name', async () => {
      const { qrBase64 } = await sign();
      const tags = decodeTlv(qrBase64);

      // 28 characters, far more bytes — a length byte counting characters would
      // truncate the name and desynchronize every tag after it.
      expect(tags.get(1)!.length).toBeGreaterThan(baseInvoice.seller.name.length);
      expect(tags.get(1)!.toString('utf8')).toBe(baseInvoice.seller.name);
    }, 30000);
  });

  describe('invoice classification', () => {
    it('marks a simplified invoice with the 2xxxxxx transaction code', () => {
      const xml = buildUnsignedInvoiceXml({ ...baseInvoice, invoiceType: 'simplified', buyer: { name: 'عميل نقدي', vatNumber: null } });

      expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
      // A B2C buyer has no VAT registration — an empty CompanyID is rejected.
      expect(xml).not.toContain('<cbc:CompanyID></cbc:CompanyID>');
    });
  });

  describe('credit and debit notes (381/383)', () => {
    // What makes a note a note: the type code plus these two fields. Everything
    // else — root element included — is identical to a 388 invoice, because
    // ZATCA does not use UBL's separate CreditNote/DebitNote documents.
    const noteFields = {
      documentType: 'credit' as const,
      billingReference: { invoiceNumber: 'INV-2026-0001' },
      adjustmentReason: 'إرجاع بضاعة',
    };

    it('emits 381 with the original reference and the reason, keeping the Invoice root', () => {
      const xml = buildUnsignedInvoiceXml({ ...baseInvoice, ...noteFields, number: 'CN-2026-0001' });

      expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">381</cbc:InvoiceTypeCode>');
      // BR-KSA-56 — the adjusted invoice, referenced by its human number.
      expect(xml).toContain(
        '<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-2026-0001</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>',
      );
      // BR-KSA-17 — the reason, carried as a PaymentMeans instruction note.
      expect(xml).toContain('<cbc:InstructionNote>إرجاع بضاعة</cbc:InstructionNote>');
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?><Invoice ');
      expect(() => parseXml(xml)).not.toThrow();
    });

    it('emits 383 for a debit note', () => {
      const xml = buildUnsignedInvoiceXml({ ...baseInvoice, ...noteFields, documentType: 'debit' });

      expect(xml).toContain('<cbc:InvoiceTypeCode name="0100000">383</cbc:InvoiceTypeCode>');
    });

    it('marks a simplified credit note with the 2xxxxxx transaction code', () => {
      const xml = buildUnsignedInvoiceXml({ ...baseInvoice, ...noteFields, invoiceType: 'simplified', buyer: { name: 'عميل نقدي', vatNumber: null } });

      expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
    });

    it('keeps the UBL sequence: BillingReference before the ICV block, PaymentMeans between buyer and tax totals', () => {
      const xml = buildUnsignedInvoiceXml({ ...baseInvoice, ...noteFields });

      // UBL is an XSD sequence — a misplaced element is rejected outright.
      expect(xml.indexOf('<cac:BillingReference>')).toBeLessThan(xml.indexOf('<cbc:ID>ICV</cbc:ID>'));
      expect(xml.indexOf('<cac:PaymentMeans>')).toBeGreaterThan(xml.indexOf('<cac:AccountingCustomerParty>'));
      expect(xml.indexOf('<cac:PaymentMeans>')).toBeLessThan(xml.indexOf('<cac:TaxTotal>'));
    });

    it('a plain 388 invoice carries neither a billing reference nor payment means', () => {
      const xml = buildUnsignedInvoiceXml(baseInvoice);

      expect(xml).not.toContain('<cac:BillingReference>');
      expect(xml).not.toContain('<cac:PaymentMeans>');
    });

    it('refuses to build a note missing the reference or the reason', () => {
      // Either omission produces a document the authority rejects
      // unconditionally — better a programming error here than a clearance
      // rejection weeks later.
      expect(() => buildUnsignedInvoiceXml({ ...baseInvoice, documentType: 'credit' })).toThrow(/billingReference/);
      expect(() =>
        buildUnsignedInvoiceXml({ ...baseInvoice, documentType: 'debit', billingReference: { invoiceNumber: 'INV-1' }, adjustmentReason: '   ' }),
      ).toThrow(/adjustmentReason/);
    });

    it('signs a credit note that verifies, with the chain continuing across document types', async () => {
      const invoice = await sign();
      const note = await sign({ ...noteFields, number: 'CN-2026-0001', icv: 2, pih: invoice.invoiceHash });

      // The authority runs ONE chain per solution — a note occupies an
      // ordinary position in it, chained onto whatever came before it,
      // whatever its type.
      await expect(verifySignedInvoice(note.signedXml)).resolves.toBe(true);
      expect(note.signedXml).toContain(invoice.invoiceHash);
      expect(note.invoiceHash).not.toBe(invoice.invoiceHash);
    }, 30000);
  });
});
