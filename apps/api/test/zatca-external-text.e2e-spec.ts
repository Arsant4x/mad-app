import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { OutboxService } from '../src/outbox/outbox.service';
import { INVOICE_ISSUED } from '../src/shared/events/domain-events';
import { purgeInvoicesForTest } from './purge-invoices';
import { registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { startAuthorityStub, STUB_NUL_MESSAGE_STORED, type AuthorityStub } from './zatca-authority-stub';

/**
 * ⚖️ **نصُّ الجهة الخارجية يُنقّى قبل أن يُكتب — وجوابُ الهيئة يختم حدثَ الطابور** (`ق-٩٨٢` · `ق-٩٨٣`)
 * — الحارسُ الحيّ على المسار الحقيقيّ (توقيعٌ فعليّ · منشأةٌ معزولة · خادمٌ محلّيّ يمثّل الهيئة):
 *
 *   ① ردُّ الهيئة `400` برسالةٍ **عليا** تحمل بايتاً صفريّاً ⟵ `REJECTED` برسالةٍ مقروءة: الرسالةُ
 *      نفسُها بلا البايت، لا نصُّ `Prisma` ولا `503` ولا «مختومٌ بانتظار الإبلاغ» (ما قِيس في `ق-٩٧٩`).
 *   ② مردودةٌ يدوياً حدثُها المعلَّق يُختم `SENT` عند الدورة التالية **بلا إرسالٍ ثانٍ** — لا «لا تُعاد» ستّاً
 *      ثم `FAILED`.
 *   ③ الطابورُ نفسُه يتلقّى الردَّ الصفريّ ⟵ الحدثُ `SENT` والمستندُ `REJECTED` مقروءاً — لا `PENDING` بنصّ
 *      `Prisma` ثم `FAILED`.
 *   ④ والقبولُ اليدويّ يختم حدثَه كذلك — الطابورُ لا يعيد إرسالَ ما قُبل.
 */
describe('نصُّ الجهة الخارجية يُنقّى قبل أن يُكتب، وجوابُ الهيئة يختم حدثَ الطابور (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let outbox: OutboxService;
  let company: Awaited<ReturnType<typeof registerIsolatedCompany>>;
  let token: string;
  let companyId: string;
  let customerId: string;
  let authority: AuthorityStub;
  const created: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const server = () => app.getHttpServer();
  const NUL = String.fromCharCode(0);

  async function realKeys() {
    const webcrypto = new Crypto();
    x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
    const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      { serialNumber: '01', name: 'CN=mad-app-test, C=SA', notBefore: new Date('2026-01-01'), notAfter: new Date('2027-01-01'), keys: pair, signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' } },
      webcrypto as unknown as globalThis.Crypto,
    );
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
    return {
      privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`,
      certBase64: Buffer.from(cert.rawData).toString('base64'),
    };
  }

  async function makeInvoice(): Promise<string> {
    const res = await auth(request(server()).post('/invoices'))
      .send({ customerId, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(res.body.id);
    return res.body.id as string;
  }

  const submit = (id: string) => auth(request(server()).post(`/zatca/invoices/${id}/submit`));
  /** الحالةُ المتوقَّعة **مع جسد الردّ** عند المخالفة — فسقوطٌ بلا سببٍ لا يُشخَّص. */
  async function submitExpecting(id: string, status: number) {
    const res = await submit(id);
    if (res.status !== status) throw new Error(`submit ${id}: expected ${status}, got ${res.status} — ${JSON.stringify(res.body).slice(0, 600)}`);
    return res;
  }

  function row(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { zatcaStatus: true, zatcaUuid: true, zatcaSubmittedAt: true, zatcaMessage: true } }),
    );
  }

  function eventOf(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: INVOICE_ISSUED, payload: { path: ['invoiceId'], equals: id } } }),
    );
  }

  const dispatch = () => outbox.dispatchForCompany(companyId, 20, new Date());
  const sentFor = (uuid: string | null) => authority.requests.filter((q) => q.path.includes('/invoices/reporting/single') && q.body.uuid === uuid).length;

  /** الرسالةُ المخزَّنة كما يجب أن تكون: النصُّ نفسُه بلا البايت — ولا أثرَ لخطأ القاعدة. */
  function expectReadable(message: string | null) {
    expect(message).toBe(STUB_NUL_MESSAGE_STORED);
    expect(String(message)).not.toContain(NUL);
    expect(String(message)).not.toMatch(/prisma|invalid|22021|\.ts:\d+/i);
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    authority = await startAuthorityStub('reject-nul');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    outbox = app.get(OutboxService);

    company = await registerIsolatedCompany(app, 'exttext');
    token = company.token;
    companyId = company.companyId;
    await auth(request(server()).patch('/company-profile')).send({ legalName: 'شركة النصّ الخارجيّ التجارية', vatNumber: '300000000000003' }).expect(200);
    customerId = (await auth(request(server()).post('/customers')).send({ kind: 'NATURAL', name: `عميل النصّ ${Date.now()}` }).expect(201)).body.id;
    const keys = await realKeys();
    const data = {
      privateKeyEnc: encryptSecret(keys.privateKeyPem),
      productionCsidEnc: encryptSecret(keys.certBase64),
      productionSecretEnc: encryptSecret('fake-production-secret'),
      status: 'PRODUCTION_ISSUED' as const,
    };
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
    );
  }, 90000);

  afterAll(async () => {
    await purgeInvoicesForTest(tenantPrisma, companyId, created);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    await authority.close();
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  let manualId: string;

  it('① ردٌّ 400 برسالةٍ عليا صفريّة ⟵ REJECTED برسالةٍ مقروءة — لا 503 ولا نصُّ Prisma ولا مستندٌ يبقى مختوماً وقد رُدّ', async () => {
    manualId = await makeInvoice();
    const res = await submitExpecting(manualId, 201);
    expect(res.body.zatcaStatus).toBe('REJECTED');
    expectReadable(res.body.zatcaMessage);

    const r = await row(manualId);
    expect(r.zatcaStatus).toBe('REJECTED');
    expect(r.zatcaSubmittedAt).not.toBeNull();
    expectReadable(r.zatcaMessage);
    // الردُّ جاء على ما أُرسل فعلاً — الخادمُ المحلّيّ رأى المستند.
    expect(sentFor(r.zatcaUuid)).toBe(1);
  }, 60000);

  it('② مردودةٌ يدوياً: حدثُها المعلَّق يُختم SENT في الدورة التالية بلا إرسالٍ ثانٍ — لا «لا تُعاد» ستّاً ثم FAILED', async () => {
    const before = await eventOf(manualId);
    expect(before.status).toBe('PENDING');
    expect(before.attempts).toBe(0);
    const uuid = (await row(manualId)).zatcaUuid;
    const sentBefore = sentFor(uuid);

    const result = await dispatch();
    expect(result.sent).toBe(1);
    expect(result.retried).toBe(0);
    expect(result.failed).toBe(0);

    const after = await eventOf(manualId);
    expect(after.status).toBe('SENT');
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBeNull();
    expect(after.sentAt).not.toBeNull();
    // لا إرسالَ ثانياً لمستندٍ أجابت عنه الهيئة — والمستندُ كما هو.
    expect(sentFor(uuid)).toBe(sentBefore);
    const r = await row(manualId);
    expect(r.zatcaStatus).toBe('REJECTED');
    expectReadable(r.zatcaMessage);
  }, 60000);

  it('③ الطابورُ نفسُه يتلقّى الردَّ الصفريّ ⟵ الحدثُ SENT والمستندُ REJECTED مقروءاً — لا PENDING بنصّ Prisma', async () => {
    const id = await makeInvoice();
    expect((await eventOf(id)).status).toBe('PENDING');

    const result = await dispatch();
    expect(result.sent).toBe(1);
    expect(result.retried).toBe(0);

    const ev = await eventOf(id);
    expect(ev.status).toBe('SENT');
    expect(ev.attempts).toBe(1);
    expect(ev.lastError).toBeNull();

    const r = await row(id);
    expect(r.zatcaStatus).toBe('REJECTED');
    expect(r.zatcaSubmittedAt).not.toBeNull();
    expectReadable(r.zatcaMessage);
    expect(sentFor(r.zatcaUuid)).toBe(1);
  }, 60000);

  it('④ والقبولُ اليدويّ (2xx) يختم حدثَه كذلك — الطابورُ لا يعيد إرسالَ ما قُبل', async () => {
    authority.set('clear');
    const id = await makeInvoice();
    const res = await submitExpecting(id, 201);
    expect(res.body.zatcaStatus).toBe('CLEARED');
    const uuid = (await row(id)).zatcaUuid;
    expect(sentFor(uuid)).toBe(1);

    const result = await dispatch();
    expect(result.sent).toBe(1);
    const ev = await eventOf(id);
    expect(ev.status).toBe('SENT');
    expect(ev.lastError).toBeNull();
    expect(sentFor(uuid)).toBe(1);
    expect((await row(id)).zatcaStatus).toBe('CLEARED');
  }, 60000);
});
