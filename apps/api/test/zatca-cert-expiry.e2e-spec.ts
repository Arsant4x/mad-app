import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { CertificateExpiryService } from '../src/zatca/certificate-expiry.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **مراقبةُ انتهاء شهادة الفوترة** (`ق-١٢٧٩` · ز/⑤A1 — `domain-scan/05` A1).
 *
 * ## ما كان
 * لا حقلَ لانتهاء الشهادة ولا تنبيه — **وأوّلُ علامةٍ رفضُ كلِّ فواتير اليوم**، والتعافي
 * إعادةُ تسجيلٍ يدوية برمزٍ جديد. والدَّينُ مكتوبٌ في `zatca-onboarding.service.ts` منذ بُني.
 *
 * ## ما يُثبَت — بشهادتين حقيقيتين تُولَّدان هنا
 * ① شهادةٌ تنتهي بعد `40` يوماً: الكنسُ يقرأ تاريخها من **الشهادة نفسِها** ويحفظه، **ولا يُنبّه**.
 * ② وشهادةٌ تنتهي بعد `10` أيام: يُنبّه مرّةً — والحالةُ تعرض الأيامَ الباقية و`expiringSoon`.
 * ③ وتشغيلٌ ثانٍ لا يكرّر التنبيه (`dedupeKey` بتاريخ الانتهاء).
 */
// ⛔ **بلا وسم `[SPEC 6.4]` عمداً**: الوسمُ ادّعاءٌ بأن الاختبار **يوكّد البند**، و`6.4` (ZATCA
// المرحلة ٢) أوسعُ من المراقبة — تنقصه شهادةُ إنتاجٍ حيّة ونداءُ التجديد. فوسمُه كان سيُسقط
// الحارسَ ③ (الوثيقةُ تقول `🟨`) أو يُغري بقلب الوثيقة إلى ✅ وهي ليست كذلك.
describe('انتهاءُ شهادة الفوترة يُراقَب ويُنبَّه قبله (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenant: TenantPrismaService;
  let expiry: CertificateExpiryService;
  let dir: string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());

  /** شهادةٌ حقيقية تنتهي بعد `days` — لا نصٌّ يشبه الشهادة. */
  const certificate = (days: number): string => {
    const out = join(dir, `c${days}.pem`);
    execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', String(days), '-subj', '/CN=mad-app', '-keyout', join(dir, `k${days}.pem`), '-out', out], { stdio: 'pipe' });
    // الهيئةُ ترسلها `base64` لجسم `DER` — فيُخزَّن كما يصل منها.
    return readFileSync(out, 'utf8').replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  };

  const installCertificate = (pem: string) =>
    tenant.runInTenantContext(company.companyId, (tx) =>
      tx.zatcaCredential.upsert({
        where: { companyId: company.companyId },
        create: { companyId: company.companyId, productionCsidEnc: encryptSecret(pem), status: 'PRODUCTION_ISSUED' } as never,
        update: { productionCsidEnc: encryptSecret(pem), certificateNotAfter: null, expiryNotifiedAt: null },
      }),
    );

  const notifications = async (): Promise<{ kind: string; title: string }[]> =>
    tenant.runInTenantContext(company.companyId, (tx) => tx.notification.findMany({ select: { kind: true, title: true } })) as Promise<{ kind: string; title: string }[]>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'zatca-cert-'));
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenant = app.get(TenantPrismaService);
    expiry = app.get(CertificateExpiryService);
    company = await registerIsolatedCompany(app, 'cert-expiry');
  }, 90000);

  afterAll(async () => {
    await tenant.runInTenantContext(company.companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId: company.companyId } }));
    await removeIsolatedCompany(app, company);
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('⭐ ① شهادةٌ بعيدةُ الانتهاء: التاريخُ يُقرأ من الشهادة ويُحفظ، ولا تنبيه', async () => {
    await installCertificate(certificate(40));
    const result = await expiry.checkCompany(company.companyId);
    expect(result.notAfter).toBeInstanceOf(Date);
    expect(result.daysLeft).toBeGreaterThanOrEqual(39);
    expect(result.notified).toBe(false);

    const stored = await tenant.runInTenantContext(company.companyId, (tx) => tx.zatcaCredential.findUniqueOrThrow({ where: { companyId: company.companyId }, select: { certificateNotAfter: true } }));
    expect(stored.certificateNotAfter).toBeInstanceOf(Date);

    const status = (await auth(http().get('/zatca/onboarding')).expect(200)).body as { certificateDaysLeft: number | null; certificateExpiringSoon: boolean };
    expect(status.certificateDaysLeft).toBeGreaterThanOrEqual(39);
    expect(status.certificateExpiringSoon).toBe(false);
  }, 60000);

  it('⭐ ② شهادةٌ تنتهي بعد عشرة أيام: تنبيهٌ واحد، والحالةُ تقولها', async () => {
    await installCertificate(certificate(10));
    const result = await expiry.checkCompany(company.companyId);
    expect(result.daysLeft).toBeLessThanOrEqual(10);
    expect(result.notified).toBe(true);
    expect(result.expired).toBe(false);

    const raised = (await notifications()).filter((n) => n.kind === 'ZATCA_CERT_EXPIRING');
    expect(raised).toHaveLength(1);
    expect(raised[0].title).toContain('تنتهي بعد');

    const status = (await auth(http().get('/zatca/onboarding')).expect(200)).body as { certificateExpiringSoon: boolean };
    expect(status.certificateExpiringSoon).toBe(true);
  }, 60000);

  it('③ وتشغيلٌ ثانٍ لا يكرّر التنبيه — مرّةً لكلِّ شهادة', async () => {
    const again = await expiry.checkCompany(company.companyId);
    expect(again.notified).toBe(false);
    expect((await notifications()).filter((n) => n.kind === 'ZATCA_CERT_EXPIRING')).toHaveLength(1);
  }, 60000);

  it('④ والكنسُ يمرّ بالمنشأة ويعدّها — منشأةً منشأةً داخل سياقها', async () => {
    /**
     * ⚠️ **هذه المرحلةُ أمسكت عطلاً حقيقياً**: أوّلُ صياغةٍ للكنس قرأت `zatca_credentials`
     * بالعميل غير المقيَّد — والجدولُ تحت `FORCE` — فعادت **فارغةً بنجاح** (`checked: 0`).
     * وهي عائلةُ كنس السلّة بعينها (`ق-١٢٧٦`).
     */
    // شهادةٌ منتهيةٌ فعلاً: الكنسُ يعدّها منتهيةً — فلا يكفي أن يعدّ المنشآت.
    await installCertificate(certificate(1));
    await tenant.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRawUnsafe(`UPDATE zatca_credentials SET "certificateNotAfter" = now() - interval '2 days' WHERE "companyId" = $1`, company.companyId),
    );
    const swept = await expiry.sweep();
    expect(swept.checked).toBeGreaterThanOrEqual(1);
    expect(swept.expired).toBeGreaterThanOrEqual(1);
  }, 60000);
});
