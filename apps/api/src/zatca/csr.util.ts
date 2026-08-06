// @peculiar/x509 pulls in tsyringe, which needs the reflect polyfill. NestJS
// loads it at boot, but this module is also imported directly by tests, so it
// has to be self-sufficient.
import 'reflect-metadata';
import { AsnConvert } from '@peculiar/asn1-schema';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';

/**
 * Generates the keypair and certificate signing request the platform submits
 * to Fatoora **on the merchant's behalf**.
 *
 * The certificate is issued against the *merchant's* VAT number, but this is a
 * SaaS (CLAUDE.md §1): the platform does the cryptography and stores the
 * result, so the merchant never installs or runs anything. Their only step is
 * pasting an OTP from the Fatoora portal.
 *
 * ⚠️ **The CSR contents must be verified against the current ZATCA
 * E-Invoicing spec before onboarding a real merchant.** The shape below
 * (secp256k1 key, certificate-template extension, and the identity attributes
 * carried in subjectAltName) follows the published onboarding requirements,
 * but that spec is versioned and a mismatch is rejected at the authority, not
 * here. The values most likely to drift are the template name and the `SN`
 * composition.
 *
 * (Implementation note: `node-forge` cannot do this — it only parses RSA keys
 * and throws on the EC public-key OID 1.2.840.10045.2.1. `@peculiar/x509` is
 * built on WebCrypto and handles EC plus custom extensions.)
 */

/** ZATCA's certificate-template extension OID. */
const CERT_TEMPLATE_OID = '1.3.6.1.4.1.311.20.2';

/** Template names differ per environment — using the production template
 * against the sandbox (or vice versa) is rejected. */
export const CERT_TEMPLATE_NAME = {
  SANDBOX: 'TSTZATCA-Code-Signing',
  SIMULATION: 'PREZATCA-Code-Signing',
  PRODUCTION: 'ZATCA-Code-Signing',
} as const;

export type ZatcaEnv = keyof typeof CERT_TEMPLATE_NAME;

export interface CsrSubject {
  /** Merchant's legal name, as registered. */
  organizationName: string;
  /** Merchant's 15-digit VAT registration number. */
  vatNumber: string;
  /** Branch/unit name. */
  organizationUnit: string;
  /** Conventionally the EGS unit's name. */
  commonName: string;
  /** The merchant's registered address, e.g. "Riyadh". */
  registeredAddress: string;
  /** Business activity, e.g. "Retail". */
  businessCategory: string;
  /** Identifies this EGS unit as `1-<solution>|2-<model>|3-<serial>`. */
  serialNumber: string;
  /** Four flags for supported invoice types; "1100" = standard + simplified. */
  invoiceType: string;
}

export interface GeneratedCsr {
  /** PKCS#8 PEM — stored encrypted, never leaves the server. */
  privateKeyPem: string;
  csrPem: string;
}

/**
 * secp256k1 is mandated by the spec, not a general-purpose choice — and it's
 * why the crypto provider is `@peculiar/webcrypto` rather than Node's built-in
 * `webcrypto`: the built-in only offers P-256/384/521 and throws
 * "Unrecognized namedCurve" on K-256.
 */
const KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'K-256' };

/** One provider instance, registered once — x509 signs through whatever is
 * registered here, so it must be the K-256-capable one. */
const crypto = new Crypto();
x509.cryptoProvider.set(crypto as unknown as globalThis.Crypto);

export async function generateCsr(subject: CsrSubject, environment: ZatcaEnv): Promise<GeneratedCsr> {

  const keys = await crypto.subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);

  // The authority reads the merchant's identity out of these subjectAltName
  // attributes rather than from the subject DN.
  //
  // Written as raw OIDs, not friendly names: @peculiar/x509's DN parser only
  // knows a handful of short names and throws "Cannot get OID for name type"
  // on UID/registeredAddress/businessCategory. Numeric OIDs always resolve.
  const identity = [
    `SN=${subject.serialNumber}`, // 2.5.4.5 — recognized by name
    `0.9.2342.19200300.100.1.1=${subject.vatNumber}`, // UID
    `2.5.4.12=${subject.invoiceType}`, // title
    `2.5.4.26=${subject.registeredAddress}`, // registeredAddress
    `2.5.4.15=${subject.businessCategory}`, // businessCategory
  ].join(', ');

  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    name: `CN=${subject.commonName}, OU=${subject.organizationUnit}, O=${subject.organizationName}, C=SA`,
    keys,
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    extensions: [
      new x509.Extension(CERT_TEMPLATE_OID, false, new TextEncoder().encode(CERT_TEMPLATE_NAME[environment]).buffer as ArrayBuffer),
      new x509.SubjectAlternativeNameExtension([{ type: 'dn', value: identity }]),
    ],
  });

  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);

  return {
    privateKeyPem: toPem(Buffer.from(pkcs8), 'PRIVATE KEY'),
    csrPem: csr.toString('pem'),
  };
}

function toPem(der: Buffer, label: string): string {
  const body = der.toString('base64').match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

/** The authority's API takes the CSR base64-encoded rather than as PEM. */
export function csrToBase64(csrPem: string): string {
  return Buffer.from(csrPem, 'utf8').toString('base64');
}

/** Parses a CSR back — used by the tests to prove what was generated is
 * actually a valid, self-consistent request rather than merely well-shaped. */
export function parseCsr(csrPem: string): x509.Pkcs10CertificateRequest {
  return new x509.Pkcs10CertificateRequest(csrPem);
}

export { AsnConvert };
