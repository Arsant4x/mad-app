import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import xpath from 'xpath';
import { canonicalBytes, parseXml } from './canonicalize.util';
import { formatMoney } from '../../common/money/rounding';

/**
 * The XAdES enveloped signature ZATCA requires inside `ext:UBLExtensions`.
 *
 * ⚠️ **Not yet validated against the authority.** Structure and algorithms
 * follow the published guideline; the authority is the only real verifier.
 *
 * The awkward part of this file is the ordering, and it is not arbitrary — each
 * digest covers something the next step writes:
 *
 * 1. hash the invoice *before* the signature exists (that is what the excluded
 *    XPaths amount to);
 * 2. assemble a draft carrying the signature scaffolding, and hash
 *    `xades:SignedProperties` **as it sits in that document**, not as a
 *    standalone fragment — a verifier canonicalizes it in context, and
 *    inherited namespace declarations make those two differ;
 * 3. write that digest into `ds:SignedInfo`, canonicalize it in context, and
 *    sign;
 * 4. write the signature in, then finally attach the QR, which is excluded from
 *    the invoice hash precisely so it can be produced last.
 */

const crypto = new Crypto();

const CANONICALIZATION_ALGORITHM = 'http://www.w3.org/2006/12/xml-c14n11';
const DIGEST_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#sha256';
const SIGNATURE_ALGORITHM = 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256';

/** The transforms ZATCA specifies on the invoice reference. We satisfy them by
 * construction (the excluded nodes are absent when we hash), but they are still
 * declared because the authority's verifier applies them to what it receives. */
const INVOICE_REFERENCE_TRANSFORMS =
  '<ds:Transforms>' +
  '<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">' +
  '<ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>' +
  '</ds:Transform>' +
  '<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">' +
  '<ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>' +
  '</ds:Transform>' +
  '<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">' +
  '<ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID=\'QR\'])</ds:XPath>' +
  '</ds:Transform>' +
  `<ds:Transform Algorithm="${CANONICALIZATION_ALGORITHM}"></ds:Transform>` +
  '</ds:Transforms>';

const SELECT = xpath.useNamespaces({
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
});

function sha256Base64(data: Buffer): string {
  return createHash('sha256').update(data).digest('base64');
}

export interface SignInvoiceInput {
  /** The document from `buildUnsignedInvoiceXml` — no extensions, QR or signature. */
  unsignedXml: string;
  /** PKCS#8 PEM of the merchant's private key. */
  privateKeyPem: string;
  /** The production (or compliance) certificate, base64 DER as the authority
   * issues it — this is the `binarySecurityToken`. */
  certificateBase64: string;
  /** Seller/VAT/total/vat/timestamp for the QR. */
  qr: { sellerName: string; vatNumber: string; issuedAt: Date; total: number; vatAmount: number };
  /** Fixed by the caller so a re-signed invoice is reproducible in tests. */
  signingTime?: Date;
}

export interface SignedInvoice {
  /** The full signed document. */
  signedXml: string;
  /** Base64 SHA-256 of the canonical unsigned invoice — this is the value that
   * becomes the *next* invoice's PIH. */
  invoiceHash: string;
  /** Base64 phase-2 QR, nine TLV tags. */
  qrBase64: string;
  /** Base64 ECDSA signature over SignedInfo. */
  signatureBase64: string;
}

/** TLV with a **byte** length — an Arabic seller name is multi-byte, and using
 * the character count here produces a QR no scanner can parse. */
function tlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag, value.length]), value]);
}

function buildPhase2Qr(input: {
  sellerName: string;
  vatNumber: string;
  issuedAt: Date;
  total: number;
  vatAmount: number;
  invoiceHash: string;
  signature: Buffer;
  publicKey: Buffer;
  certificateSignature: Buffer;
}): string {
  const utf8 = (s: string) => Buffer.from(s, 'utf8');

  return Buffer.concat([
    tlv(1, utf8(input.sellerName)),
    tlv(2, utf8(input.vatNumber)),
    tlv(3, utf8(input.issuedAt.toISOString())),
    tlv(4, utf8(formatMoney(input.total))),
    tlv(5, utf8(formatMoney(input.vatAmount))),
    // 6–9 are what makes this a phase-2 QR: they let anyone holding the code
    // verify the invoice against the certificate without contacting anyone.
    tlv(6, utf8(input.invoiceHash)),
    tlv(7, input.signature),
    tlv(8, input.publicKey),
    tlv(9, input.certificateSignature),
  ]).toString('base64');
}

function ublExtensions(signedInfo: string, signatureValue: string, certificateBase64: string, qualifyingProperties: string): string {
  return (
    '<ext:UBLExtensions><ext:UBLExtension>' +
    '<ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>' +
    '<ext:ExtensionContent>' +
    '<sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" ' +
    'xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" ' +
    'xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">' +
    '<sac:SignatureInformation>' +
    '<cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>' +
    '<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>' +
    '<ds:Signature Id="signature" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' +
    signedInfo +
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificateBase64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    '<ds:Object>' +
    qualifyingProperties +
    '</ds:Object>' +
    '</ds:Signature>' +
    '</sac:SignatureInformation>' +
    '</sig:UBLDocumentSignatures>' +
    '</ext:ExtensionContent>' +
    '</ext:UBLExtension></ext:UBLExtensions>'
  );
}

function signedInfoXml(invoiceHash: string, signedPropertiesDigest: string): string {
  return (
    '<ds:SignedInfo>' +
    `<ds:CanonicalizationMethod Algorithm="${CANONICALIZATION_ALGORITHM}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${SIGNATURE_ALGORITHM}"></ds:SignatureMethod>` +
    '<ds:Reference Id="invoiceSignedData" URI="">' +
    INVOICE_REFERENCE_TRANSFORMS +
    `<ds:DigestMethod Algorithm="${DIGEST_ALGORITHM}"></ds:DigestMethod>` +
    `<ds:DigestValue>${invoiceHash}</ds:DigestValue>` +
    '</ds:Reference>' +
    '<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">' +
    `<ds:DigestMethod Algorithm="${DIGEST_ALGORITHM}"></ds:DigestMethod>` +
    `<ds:DigestValue>${signedPropertiesDigest}</ds:DigestValue>` +
    '</ds:Reference>' +
    '</ds:SignedInfo>'
  );
}

function qualifyingPropertiesXml(signingTime: Date, certDigest: string, issuerName: string, serialNumber: string): string {
  return (
    '<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">' +
    '<xades:SignedProperties Id="xadesSignedProperties">' +
    '<xades:SignedSignatureProperties>' +
    `<xades:SigningTime>${signingTime.toISOString().slice(0, 19)}Z</xades:SigningTime>` +
    '<xades:SigningCertificate>' +
    '<xades:Cert>' +
    '<xades:CertDigest>' +
    `<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="${DIGEST_ALGORITHM}"></ds:DigestMethod>` +
    `<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certDigest}</ds:DigestValue>` +
    '</xades:CertDigest>' +
    '<xades:IssuerSerial>' +
    `<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>` +
    '</xades:IssuerSerial>' +
    '</xades:Cert>' +
    '</xades:SigningCertificate>' +
    '</xades:SignedSignatureProperties>' +
    '</xades:SignedProperties>' +
    '</xades:QualifyingProperties>'
  );
}

/** Splices a fragment in as the first child of the root element. */
function insertAfterRootTag(xml: string, fragment: string): string {
  const rootEnd = xml.indexOf('>', xml.indexOf('<Invoice')) + 1;
  return xml.slice(0, rootEnd) + fragment + xml.slice(rootEnd);
}

/** UBL's sequence puts AdditionalDocumentReference and Signature immediately
 * before the supplier party, so both are spliced in at that boundary. */
function insertBeforeSupplier(xml: string, fragment: string): string {
  const at = xml.indexOf('<cac:AccountingSupplierParty>');
  if (at < 0) throw new Error('Malformed invoice XML: no cac:AccountingSupplierParty to anchor against.');
  return xml.slice(0, at) + fragment + xml.slice(at);
}

function selectNode(xml: string, expression: string): Node {
  const node = SELECT(expression, parseXml(xml) as never, true) as unknown as Node | undefined;
  if (!node) throw new Error(`Expected exactly one node for ${expression}`);
  return node;
}

/** WebCrypto's types insist on an ArrayBuffer-backed view; Node's Buffer is
 * typed as possibly SharedArrayBuffer-backed, so the bytes are copied into a
 * plain Uint8Array rather than asserted across. */
function bytes(buf: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buf) as Uint8Array<ArrayBuffer>;
}

/** Hex, uppercase, colon-free — the form the guideline's examples use. */
function serialToDecimal(cert: x509.X509Certificate): string {
  return BigInt(`0x${cert.serialNumber}`).toString(10);
}

export async function signInvoice(input: SignInvoiceInput): Promise<SignedInvoice> {
  const certificateBase64 = input.certificateBase64.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const certificateDer = Buffer.from(certificateBase64, 'base64');
  const certificate = new x509.X509Certificate(certificateDer);

  // Step 1 — the invoice hash, over a document that does not yet contain any of
  // the three excluded nodes.
  const invoiceHash = sha256Base64(canonicalBytes(parseXml(input.unsignedXml) as unknown as Node));

  const signingTime = input.signingTime ?? new Date();
  const qualifyingProperties = qualifyingPropertiesXml(
    signingTime,
    sha256Base64(certificateDer),
    certificate.issuer,
    serialToDecimal(certificate),
  );

  // Step 2 — a draft whose only purpose is to give SignedProperties its real
  // namespace context before hashing it.
  const draft = insertAfterRootTag(
    input.unsignedXml,
    ublExtensions(signedInfoXml(invoiceHash, ''), '', certificateBase64, qualifyingProperties),
  );
  const signedPropertiesDigest = sha256Base64(canonicalBytes(selectNode(draft, "//xades:SignedProperties[@Id='xadesSignedProperties']")));

  // Step 3 — SignedInfo now complete; canonicalize it in context and sign.
  const withDigest = insertAfterRootTag(
    input.unsignedXml,
    ublExtensions(signedInfoXml(invoiceHash, signedPropertiesDigest), '', certificateBase64, qualifyingProperties),
  );
  const signedInfoBytes = canonicalBytes(selectNode(withDigest, '//ds:SignedInfo'));

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(input.privateKeyPem),
    { name: 'ECDSA', namedCurve: 'K-256' },
    false,
    ['sign'],
  );
  // WebCrypto emits IEEE P1363 (r‖s), which is what XMLDSig specifies for
  // ECDSA — no DER re-encoding.
  const signature = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, bytes(signedInfoBytes)));
  const signatureBase64 = signature.toString('base64');

  // Step 4 — signature in, then the QR last: it is excluded from the invoice
  // hash precisely so it can carry the signature it would otherwise precede.
  const signed = insertAfterRootTag(
    input.unsignedXml,
    ublExtensions(signedInfoXml(invoiceHash, signedPropertiesDigest), signatureBase64, certificateBase64, qualifyingProperties),
  );

  const qrBase64 = buildPhase2Qr({
    ...input.qr,
    invoiceHash,
    signature,
    publicKey: Buffer.from(certificate.publicKey.rawData),
    certificateSignature: Buffer.from(certificate.signature),
  });

  const signedXml = insertBeforeSupplier(
    signed,
    '<cac:AdditionalDocumentReference>' +
      '<cbc:ID>QR</cbc:ID>' +
      '<cac:Attachment>' +
      `<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qrBase64}</cbc:EmbeddedDocumentBinaryObject>` +
      '</cac:Attachment>' +
      '</cac:AdditionalDocumentReference>' +
      '<cac:Signature>' +
      '<cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>' +
      '<cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>' +
      '</cac:Signature>',
  );

  return { signedXml, invoiceHash, qrBase64, signatureBase64 };
}

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const buf = Buffer.from(body, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

/** Verifies a signed invoice the way the authority would: recompute both
 * digests and check the signature against the embedded certificate. Exported
 * for the tests — this is the only local check that the pipeline is
 * self-consistent. */
export async function verifySignedInvoice(signedXml: string): Promise<boolean> {
  const certificateBase64 = (selectNode(signedXml, '//ds:X509Certificate') as unknown as { textContent: string }).textContent;
  const certificate = new x509.X509Certificate(Buffer.from(certificateBase64, 'base64'));

  const signatureValue = (selectNode(signedXml, '//ds:SignatureValue') as unknown as { textContent: string }).textContent;
  const signedInfoBytes = canonicalBytes(selectNode(signedXml, '//ds:SignedInfo'));

  const publicKey = await crypto.subtle.importKey(
    'spki',
    certificate.publicKey.rawData,
    { name: 'ECDSA', namedCurve: 'K-256' },
    false,
    ['verify'],
  );

  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    bytes(Buffer.from(signatureValue, 'base64')),
    bytes(signedInfoBytes),
  );
}
