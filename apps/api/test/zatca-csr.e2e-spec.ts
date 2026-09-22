import { CERT_TEMPLATE_NAME, csrToBase64, generateCsr, parseCsr } from '../src/zatca/csr.util';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (2.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * These assert the CSR is *cryptographically valid*, not merely well-shaped.
 *
 * That distinction cost a rewrite: an earlier attempt with `node-forge`
 * type-checked and looked correct, but node-forge only parses RSA keys and
 * threw on the EC public-key OID at runtime. A CSR that looks right and is
 * rejected by the authority is the worst outcome, so the signature is verified
 * here rather than assumed.
 */
describe('ZATCA CSR generation', () => {
  const subject = {
    organizationName: 'شركة الأفق التجارية المحدودة',
    vatNumber: '300000000000003',
    organizationUnit: 'الفرع الرئيسي',
    commonName: 'mad-app-EGS-001',
    registeredAddress: 'Riyadh',
    businessCategory: 'Retail',
    serialNumber: '1-mad-app|2-web|3-egs001',
    invoiceType: '1100',
  };

  it('produces a CSR whose own signature verifies', async () => {
    const { csrPem } = await generateCsr(subject, 'SANDBOX');
    const csr = parseCsr(csrPem);

    // The authority will do exactly this before looking at anything else.
    await expect(csr.verify()).resolves.toBe(true);
  }, 20000);

  it('uses the secp256k1 curve the spec mandates', async () => {
    const { csrPem } = await generateCsr(subject, 'SANDBOX');
    const csr = parseCsr(csrPem);

    const algorithm = csr.publicKey.algorithm as EcKeyAlgorithm;
    expect(algorithm.name).toBe('ECDSA');
    expect(algorithm.namedCurve).toBe('K-256');
  }, 20000);

  it('carries the merchant identity the authority reads', async () => {
    const { csrPem } = await generateCsr(subject, 'SANDBOX');
    const csr = parseCsr(csrPem);

    expect(csr.subject).toContain(subject.commonName);
    expect(csr.subject).toContain('C=SA');

    // The VAT number and EGS serial travel in subjectAltName, not the subject.
    const text = csr.toString('text');
    expect(text).toContain(subject.vatNumber);
    expect(text).toContain(subject.serialNumber);
  }, 20000);

  it('stamps the environment-specific certificate template', async () => {
    for (const env of ['SANDBOX', 'SIMULATION', 'PRODUCTION'] as const) {
      const { csrPem } = await generateCsr(subject, env);
      const csr = parseCsr(csrPem);

      // Read the extension's bytes rather than the human-readable dump: the
      // value is raw bytes, so `toString('text')` renders it as hex and would
      // never contain the template name in readable form.
      const ext = csr.getExtension('1.3.6.1.4.1.311.20.2');
      expect(ext).toBeDefined();

      // Using the production template against the sandbox is rejected, so the
      // environment has to reach the CSR, not just the API base URL.
      expect(Buffer.from(ext!.value).toString('utf8')).toBe(CERT_TEMPLATE_NAME[env]);
    }
  }, 40000);

  it('exports a private key that is never the same twice', async () => {
    const a = await generateCsr(subject, 'SANDBOX');
    const b = await generateCsr(subject, 'SANDBOX');

    expect(a.privateKeyPem).toContain('BEGIN PRIVATE KEY');
    expect(a.privateKeyPem).not.toBe(b.privateKeyPem);
  }, 30000);

  it('base64-encodes the CSR the way the API expects', async () => {
    const { csrPem } = await generateCsr(subject, 'SANDBOX');
    const encoded = csrToBase64(csrPem);
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(csrPem);
  }, 20000);
});
