import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { buildUnsignedInvoiceXml, type UblInvoiceInput } from './invoice-xml.util';
import { signInvoice } from './xades.util';
import { decodeZatcaQr, ZATCA_QR_MAX_VALUE_BYTES, ZatcaQrValueTooLongError } from '../qr.util';

/**
 * The phase 2 QR shares the phase 1 TLV rule: the length is a single byte, so a value over
 * 255 bytes is refused by name instead of wrapping into a code that parses as other tags.
 */
const issued = { date: '2026-06-01', time: '09:30:00' };

const invoice: UblInvoiceInput = {
  number: 'INV-2026-0042',
  uuid: '3cf5ee18-ee25-44ea-a444-2c37ba7f28b9',
  issued,
  invoiceType: 'simplified',
  icv: 42,
  pih: createHash('sha256').update('0').digest('base64'),
  seller: { name: 'Seller', vatNumber: '300000000000003', crNumber: '1010101010', street: 'King Fahd Road', buildingNumber: '1234', district: 'Olaya', city: 'Riyadh', postalCode: '12345' },
  buyer: { name: 'Buyer', vatNumber: null },
  lines: [{ description: 'Item', quantity: 1, unitPrice: 100, taxRate: 15, taxCategory: 'S' }],
  currency: 'SAR',
  subtotal: 100,
  taxTotal: 15,
  total: 115,
  taxTotalSar: 15,
};

async function credential(): Promise<{ privateKeyPem: string; certificateBase64: string }> {
  const webcrypto = new Crypto();
  x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    { serialNumber: '01', name: 'CN=qr-limit-test, C=SA', notBefore: new Date('2026-01-01'), notAfter: new Date('2027-01-01'), keys, signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' } },
    webcrypto as unknown as globalThis.Crypto,
  );
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  return { privateKeyPem: x509.PemConverter.encode(pkcs8, x509.PemConverter.PrivateKeyTag), certificateBase64: Buffer.from(cert.rawData).toString('base64') };
}

/** Reads the TLV byte by byte, independent of decodeZatcaQr, and fails if the payload does not end cleanly. */
function rawTags(b64: string): { tag: number; len: number }[] {
  const buf = Buffer.from(b64, 'base64');
  const out: { tag: number; len: number }[] = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    out.push({ tag: buf[off], len: buf[off + 1] });
    off += 2 + buf[off + 1];
  }
  if (off !== buf.length) throw new Error(`TLV does not end cleanly: stopped at ${off} of ${buf.length}`);
  return out;
}

describe('phase 2 QR TLV keeps the 255 byte limit', () => {
  let keys: { privateKeyPem: string; certificateBase64: string };
  beforeAll(async () => {
    keys = await credential();
  });

  const sign = (sellerName: string) =>
    signInvoice({
      unsignedXml: buildUnsignedInvoiceXml(invoice),
      ...keys,
      qr: { sellerName, vatNumber: '300000000000003', issued, total: 115, vatAmount: 15 },
      signingTime: new Date('2026-06-01T06:30:00Z'),
    });

  it('a seller name of exactly 255 bytes signs and the nine tags read cleanly', async () => {
    const sellerName = 'ع'.repeat(127) + 'a';
    expect(Buffer.byteLength(sellerName, 'utf8')).toBe(ZATCA_QR_MAX_VALUE_BYTES);
    const { qrBase64 } = await sign(sellerName);
    const tags = rawTags(qrBase64);
    expect(tags.map((t) => t.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(tags[0].len).toBe(255);
    expect(decodeZatcaQr(qrBase64)[1]).toBe(sellerName);
  });

  it('a seller name of 256 bytes is refused by name with its tag and byte count', async () => {
    const sellerName = 'ع'.repeat(128);
    let thrown: unknown;
    try {
      await sign(sellerName);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ZatcaQrValueTooLongError);
    expect((thrown as ZatcaQrValueTooLongError).tag).toBe(1);
    expect((thrown as ZatcaQrValueTooLongError).bytes).toBe(256);
  });
});
