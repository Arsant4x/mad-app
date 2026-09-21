import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { expectNothingBetweenIcv } from './zatca-chain.util';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';

/**
 * Deleting a document that holds a ZATCA chain link would leave a gap the
 * authority can see: the next document's PIH commits to the deleted hash, and
 * `previousChainHash` would chain new submissions onto the wrong predecessor.
 *
 * These tests lock in the delete guard: any invoice carrying a chain link
 * (ICV/hash) refuses deletion with a localized 409 — whatever its status,
 * because a REJECTED document is closed with its link (ق-٩٥٨) and a CLEARED
 * one is final — and an issued invoice is never deleted at all (ق-٩٤٣).
 *
 * Same setup as zatca-phase2.e2e-spec.ts: a locally seeded self-signed
 * credential and an unroutable API base, so signing and chaining run for real
 * but no traffic ever reaches gw-fatoora.zatca.gov.sa.
 */
describe('ZATCA chain — invoice delete guard (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  const createdInvoiceIds: string[] = [];

  async function seedProductionCredential() {
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
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`;

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

  /**
   * ZATCA onboarding refuses a company without a legal name and VAT number —
   * correctly, since both are stamped into the signed document. The seed sets
   * neither on the company itself (only on customers and suppliers), so a
   * suite that assumes them is really assuming an earlier run left them
   * behind: green on a long-lived test database, red on a fresh one.
   */
  async function ensureCompanyProfile() {
    const current = await request(app.getHttpServer()).get('/company-profile').set('Authorization', `Bearer ${token}`).expect(200);
    if (current.body.legalName?.trim() && current.body.vatNumber?.trim()) return;
    await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        legalName: current.body.legalName?.trim() || current.body.orgName || 'منشأة اختبار سلسلة الفوترة',
        // 15 digits starting and ending with 3, per the VAT validator.
        vatNumber: current.body.vatNumber?.trim() || '300000000000003',
      })
      .expect(200);
  }

  async function makeInvoice(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        issueDate: '2026-06-01',
        dueDate: '2026-06-30',
        lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);
    createdInvoiceIds.push(res.body.id);
    return res.body.id;
  }

  async function submit(id: string) {
    return request(app.getHttpServer()).post(`/zatca/invoices/${id}/submit`).set('Authorization', `Bearer ${token}`).expect(201);
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // خادمٌ محلّيّ يمثّل الهيئة ويجيب بالردّ `400` (ق-٩٧١): يُبنى ويُوقَّع ويُسجَّل الموقعُ
    // فعلاً، والردُّ جوابٌ حقيقيُّ الشكل — REJECTED بموقعٍ محفوظ، لا سقوطُ نقلٍ يُعاد.
    authority = await startAuthorityStub('reject');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
    /**
     * ⚠️ **عميلٌ خاص بهذا الملف بدل `customers.body[0]`** (2026-09-05).
     *
     * كان يأخذ **أول ما يجده**، فيربط نتيجته بترتيب صفوفٍ لا يملكه — وهو
     * الفخّ الذي وثّقه `zatca-phase2` في ملفّه. **وأسقطه بندٌ لا علاقة له
     * بالحذف**: بوّابة `BR-KSA-63` صارت تشترط عنوان المشتري على القياسية،
     * فأيّ عميلٍ برقمٍ ضريبي بلا عنوان يُرَدّ — **وهذا الملف يختبر الحذف لا
     * العنوان**.
     *
     * فيُنشئ عميلَه **بعنوانٍ كامل**: شرطُ وصولِه إلى ما يختبره فعلاً.
     */
    customerId = (
      await request(app.getHttpServer())
        .post('/customers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          kind: 'NATURAL',
          name: `عميل حارس الحذف ${Date.now()}`,
          vatNumber: `3${String(Date.now()).slice(-13)}3`,
          street: 'طريق الملك عبدالعزيز',
          buildingNumber: '3120',
          district: 'الملز',
          city: 'الرياض',
          postalCode: '11564',
        })
        .expect(201)
    ).body.id;

    await ensureCompanyProfile();
    await seedProductionCredential();
  }, 30000);

  afterAll(async () => {
    // Chained test rows can't go through the API delete (that refusal is the
    // very thing under test), and they aren't a real chain — strip the link,
    // then delete normally so journal entries are reversed too.
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.updateMany({
        where: { id: { in: createdInvoiceIds } },
        data: { zatcaUuid: null, zatcaHash: null, zatcaPreviousHash: null, zatcaIcv: null, zatcaStatus: 'NOT_SUBMITTED', zatcaSubmittedAt: null, zatcaMessage: null },
      }),
    );
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyId, createdInvoiceIds);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    await authority.close();
    await app.close();
  });

  it('refuses to delete an issued invoice that was never submitted — issued is issued, stamped or not (ق-٩٤٣)', async () => {
    const id = await makeInvoice();
    // ⚖️ كانت هذه الحالةُ تمرّ («لم تُرسَل قطّ فتُحذف») — والحكمُ: الحذفُ كالتعديل، فالعميلُ
    // يحمل رقمَها والتسلسلُ يفقده (ق-٩٤٥/٣)؛ والرسالةُ تسمّي المخرج (ق-٢٦٥).
    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    expect(res.body.message).toContain('صدرت');
    expect(res.body.message).toContain('إشعار دائن');

    const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.some((inv: { id: string }) => inv.id === id)).toBe(true);
  }, 30000);

  it('refuses to delete a REJECTED invoice whose chain link was recorded', async () => {
    const id = await makeInvoice();
    const submitted = await submit(id);
    // Precondition: the failed send still recorded the link — that recorded
    // position, not the status, is what makes deletion chain-breaking.
    expect(submitted.body.zatcaStatus).toBe('REJECTED');
    expect(submitted.body.zatcaIcv).toBeTruthy();
    expect(submitted.body.zatcaHash).toBeTruthy();

    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    // Asserted on the remedy rather than the wording of the diagnosis: a
    // refusal that doesn't tell the merchant to issue a credit note leaves
    // them with no legitimate way to correct the document.
    expect(res.body.message).toContain('إشعار دائن');

    // The refusal must have left the invoice — and its link — untouched.
    const list = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
    const kept = list.body.find((inv: { id: string }) => inv.id === id);
    expect(kept).toBeDefined();
    expect(kept.zatcaIcv).toBe(submitted.body.zatcaIcv);
    expect(kept.zatcaStatus).toBe('REJECTED');
  }, 30000);

  it('refuses to delete a CLEARED invoice', async () => {
    const id = await makeInvoice();
    await submit(id);
    // Clearance needs a certificate only the authority can issue, so it is
    // simulated: same chain link, final status.
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id }, data: { zatcaStatus: 'CLEARED' } }));

    const res = await request(app.getHttpServer()).delete(`/invoices/${id}`).set('Authorization', `Bearer ${token}`).expect(409);
    // Asserted on the remedy rather than the wording of the diagnosis: a
    // refusal that doesn't tell the merchant to issue a credit note leaves
    // them with no legitimate way to correct the document.
    expect(res.body.message).toContain('إشعار دائن');
  }, 30000);

  it('keeps the chain intact after a refused delete — the next invoice still finds its predecessor', async () => {
    const a = await makeInvoice();
    const submittedA = await submit(a);
    // Cleared so the case reads as the common one; the predecessor is the
    // document at ICV − 1 whatever its status (`previousChainHash`, ق-١١٩٨/⑦).
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: a }, data: { zatcaStatus: 'CLEARED' } }));
    await request(app.getHttpServer()).delete(`/invoices/${a}`).set('Authorization', `Bearer ${token}`).expect(409);

    // Had the delete gone through, previousChainHash would have found no row at
    // ICV − 1 and fallen back to an older predecessor — the PIH here would not
    // match A's hash.
    const b = await makeInvoice();
    const submittedB = await submit(b);
    expect(submittedB.body.zatcaPreviousHash).toBe(submittedA.body.zatcaHash);
    // ولا وثيقةَ بينهما — الدعوى محلّيةٌ فتُقاس محلّياً (ق-٢٩٢).
    await expectNothingBetweenIcv(tenantPrisma, companyId, submittedA.body.zatcaIcv, submittedB.body.zatcaIcv);
  }, 40000);
});
