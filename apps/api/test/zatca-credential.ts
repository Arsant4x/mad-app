import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';

/**
 * **اعتمادُ إنتاجٍ مزروع** — ما كان الربطُ سيحفظه: زوجُ مفاتيح `secp256k1` حقيقيّ وشهادةٌ
 * بالشكل الصحيح، موقَّعةٌ ذاتياً بدل أن تصدرها الهيئة. **حقيقيٌّ لا نصٌّ بديل**: التوقيعُ
 * ليس محاكاةً، فنصٌّ مكانَ المفتاح يُسقط قبل أن يُبنى المستند — فتشهد التوكيداتُ لسقوطٍ غير
 * المقصود. مستخرَجٌ من `zatca-phase2.e2e-spec` ليشترك فيه من يختم بلا هيئة (`ق-١١٩٨`/③).
 */
export async function seedProductionCredential(tenantPrisma: TenantPrismaService, companyId: string): Promise<void> {
  const webcrypto = new Crypto();
  x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);

  const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
  const cert = await x509.X509CertificateGenerator.createSelfSigned(
    {
      serialNumber: '01',
      name: 'CN=mad-app-test, C=SA',
      notBefore: new Date('2026-01-01'),
      notAfter: new Date('2027-01-01'),
      keys,
      signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    },
    webcrypto as unknown as globalThis.Crypto,
  );
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
  // بصيغة PEM كما يكتبها الربطُ نفسُه (`csr.util.ts` — أسطرُ 64 حرفاً) عبر المكتبة لا بقالبٍ يدويّ:
  // فخطّافُ الأسرار يقرأ رأسَ المفتاح نصّاً، وملفٌّ مساعدٌ ليس مستثنًى منه كالاختبارات.
  const privateKeyPem = x509.PemConverter.encode(pkcs8, x509.PemConverter.PrivateKeyTag);

  const data = {
    privateKeyEnc: encryptSecret(privateKeyPem),
    productionCsidEnc: encryptSecret(Buffer.from(cert.rawData).toString('base64')),
    productionSecretEnc: encryptSecret('fake-production-secret'),
    status: 'PRODUCTION_ISSUED' as const,
  };

  await tenantPrisma.runInTenantContext(companyId, (tx) =>
    tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
  );
}

export async function clearCredential(tenantPrisma: TenantPrismaService, companyId: string): Promise<void> {
  await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
}
