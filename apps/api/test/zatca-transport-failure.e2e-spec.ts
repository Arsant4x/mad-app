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
import { MAX_ATTEMPTS, OutboxService, requeueFailedWithinTx } from '../src/outbox/outbox.service';
import { INVOICE_ISSUED } from '../src/shared/events/domain-events';
import { purgeInvoicesForTest } from './purge-invoices';
import { registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { DEAD_PORT_URL, startAuthorityStub, STUB_REJECTION_MESSAGE, type AuthorityStub } from './zatca-authority-stub';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (166.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(500000);

/**
 * ⚖️ **سقوطُ النقل ليس جواباً — يُرمى فيعود الطابور، و`REJECTED` على جوابٍ من الهيئة وحده**
 * (`ق-٩٧١`) — الحارسُ الحيّ بسبعته على المسار الحقيقيّ (توقيعٌ فعليّ، منشأةٌ معزولة):
 *
 *   ① منفذٌ لا يصغي: الإرسالُ اليدويّ يُردّ `503` بسببٍ يقول «سيُعاد»، والمستندُ **مختومٌ كما
 *      هو** (سلسلتُه ومستندُه الموقَّع) — لا `REJECTED`، ولا لحظةَ إرسال، والسببُ مكتوبٌ ليُرى.
 *   ② الطابور: المحاولةُ تُعدّ ويُعاد الصفُّ `PENDING` بتراجعٍ وسببٍ — والمستندُ كما هو.
 *   ③ الاستنفاد: `FAILED` **معلَناً** — والمستندُ مختومٌ لا مردود («فالتعذّرُ ليس جواباً»).
 *   ④ جوابُ الهيئة بالردّ (`400`): بعد إعادة `FAILED` إلى الطابور يُرسَل ويُردّ — `REJECTED`
 *      و`SENT` وإغلاق (لا إعادةَ إرسال؛ المخرجُ بدل).
 *   ⑤ جوابُ القبول (`2xx`): `CLEARED`.
 *   ⑥ ما ليس جواباً على المستند وإن جاء من الخادم — `503` · `401` — يُرمى ولا يُغلق؛ والرمزُ
 *      هو الفيصل لا النصّ: الخادمُ نفسُه يجيب بعدها `400` فيُردّ.
 *   ⑦ سقوطُ التوقيع (مفتاحٌ معطوب) ليس جواباً: يُحرَّر الادّعاء **والموقعُ معه** (ق-١١٩٨/⑦ —
 *      السلفُ صار `ICV − 1` بعينه فموقعٌ بلا بصمةٍ يحبس ما بعده؛ كان يبقى محفوظاً) — ومفتاحٌ سليم
 *      بعده يُرسل بموقعٍ يأخذه حينها، بلا فجوةٍ في السلسلة.
 */
describe('سقوطُ النقل ليس جواباً — يُرمى فيعود الطابور، وREJECTED على جوابٍ من الهيئة وحده (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let outbox: OutboxService;
  let company: Awaited<ReturnType<typeof registerIsolatedCompany>>;
  let token: string;
  let companyId: string;
  let customerId: string;
  let authority: AuthorityStub | null = null;
  let keys: { privateKeyPem: string; certBase64: string };
  const created: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const server = () => app.getHttpServer();

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

  async function seedCredential(privateKeyPem: string, certBase64: string) {
    const data = {
      privateKeyEnc: encryptSecret(privateKeyPem),
      productionCsidEnc: encryptSecret(certBase64),
      productionSecretEnc: encryptSecret('fake-production-secret'),
      status: 'PRODUCTION_ISSUED' as const,
    };
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
    );
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
      tx.invoice.findUniqueOrThrow({
        where: { id },
        select: { zatcaStatus: true, zatcaSignedXml: true, zatcaHash: true, zatcaIcv: true, zatcaUuid: true, zatcaPreviousHash: true, zatcaSubmittedAt: true, zatcaMessage: true, zatcaStampedAt: true },
      }),
    );
  }

  function eventOf(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: INVOICE_ISSUED, payload: { path: ['invoiceId'], equals: id } } }),
    );
  }

  const dispatch = () => outbox.dispatchForCompany(companyId, 20, new Date());

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // منفذٌ لا يصغي — سقوطُ نقلٍ خالص، لا جوابَ فيه. (الخادمُ المحلّيّ يُشغَّل في ④.)
    process.env.ZATCA_API_BASE_OVERRIDE = DEAD_PORT_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    outbox = app.get(OutboxService);

    company = await registerIsolatedCompany(app, 'transport');
    token = company.token;
    companyId = company.companyId;
    await auth(request(server()).patch('/company-profile')).send({ legalName: 'شركة النقل التجارية', vatNumber: '300000000000003' }).expect(200);
    customerId = (await auth(request(server()).post('/customers')).send({ kind: 'NATURAL', name: `عميل النقل ${Date.now()}` }).expect(201)).body.id;
    keys = await realKeys();
    await seedCredential(keys.privateKeyPem, keys.certBase64);
  }, 90000);

  afterAll(async () => {
    await purgeInvoicesForTest(tenantPrisma, companyId, created);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    if (authority) await authority.close();
    delete process.env.ZATCA_API_BASE_OVERRIDE;
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  let firstId: string;

  it('① منفذٌ لا يصغي: الإرسالُ اليدويّ يُردّ 503 بسببٍ يقول «سيُعاد» — والمستندُ مختومٌ كما هو، لا مردود', async () => {
    firstId = await makeInvoice();
    const res = await submitExpecting(firstId, 503);
    expect(String(res.body.message)).toContain('سيُعاد');
    expect(String(res.body.message)).toMatch(/fetch failed|ECONNREFUSED/i);

    const r = await row(firstId);
    // مختومٌ وموقَّع ومحجوزُ الموقع — لم يُفقد شيءٌ من المحاولة.
    expect(r.zatcaStatus).toBe('STAMPED');
    expect(r.zatcaSignedXml).toContain('<ds:SignatureValue>');
    expect(r.zatcaHash).toBeTruthy();
    expect(r.zatcaIcv).not.toBeNull();
    expect(r.zatcaUuid).toBeTruthy();
    expect(r.zatcaStampedAt).not.toBeNull();
    // لا جوابَ فلا لحظةَ إرسال؛ والسببُ مكتوبٌ ليُرى.
    expect(r.zatcaSubmittedAt).toBeNull();
    expect(String(r.zatcaMessage)).toMatch(/fetch failed|ECONNREFUSED/i);
  }, 60000);

  it('② الطابور: المحاولةُ تُعدّ ويُعاد الصفُّ PENDING بتراجعٍ وسبب — والمستندُ كما هو', async () => {
    const before = await eventOf(firstId);
    expect(before.status).toBe('PENDING');
    expect(before.attempts).toBe(0);

    const now = new Date();
    const result = await dispatch();
    expect(result.retried).toBeGreaterThanOrEqual(1);
    expect(result.sent).toBe(0);

    const after = await eventOf(firstId);
    expect(after.status).toBe('PENDING');
    expect(after.attempts).toBe(1);
    expect(after.availableAt.getTime()).toBeGreaterThan(now.getTime() + 30_000);
    // السببُ مخزَّنٌ نصّاً مقروءاً (لا فاصلَ ترجمةٍ صفريّاً — فعمودُ النصّ يرفضه ويُسقط الدورة كلَّها).
    expect(String(after.lastError)).toMatch(/fetch failed|ECONNREFUSED/i);
    expect(String(after.lastError)).toContain('سيُعاد');
    expect(String(after.lastError)).not.toContain(String.fromCharCode(0));

    const r = await row(firstId);
    expect(r.zatcaStatus).toBe('STAMPED');
    expect(r.zatcaSubmittedAt).toBeNull();
  }, 60000);

  it('③ الاستنفاد: FAILED معلَناً — والمستندُ مختومٌ لا مردود، فالتعذّرُ ليس جواباً', async () => {
    const ev = await eventOf(firstId);
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.outboxEvent.update({ where: { id: ev.id }, data: { attempts: MAX_ATTEMPTS - 1, availableAt: new Date(0) } }),
    );
    const result = await dispatch();
    expect(result.failed).toBeGreaterThanOrEqual(1);

    const after = await eventOf(firstId);
    expect(after.status).toBe('FAILED');
    expect(after.attempts).toBe(MAX_ATTEMPTS);
    expect(String(after.lastError)).toMatch(/fetch failed|ECONNREFUSED/i);

    const r = await row(firstId);
    expect(r.zatcaStatus).toBe('STAMPED');
    expect(r.zatcaSubmittedAt).toBeNull();
    // ويُعلَن في «صادرٌ لم يصل» على مستوى المنشأة.
    const unreported = await auth(request(server()).get('/zatca/unreported')).expect(200);
    expect(unreported.body.byStatus.STAMPED).toBeGreaterThanOrEqual(1);
    expect(unreported.body.byStatus.REJECTED ?? 0).toBe(0);
  }, 60000);

  it('④ جوابُ الهيئة بالردّ 400: بعد إعادة FAILED إلى الطابور يُرسَل ويُردّ — REJECTED وSENT وإغلاق', async () => {
    authority = await startAuthorityStub('reject');
    const requeued = await tenantPrisma.runInTenantContext(companyId, (tx) => requeueFailedWithinTx(tx, INVOICE_ISSUED));
    expect(requeued).toBeGreaterThanOrEqual(1);
    const before = await row(firstId);

    const result = await dispatch();
    expect(result.sent).toBe(1);

    const ev = await eventOf(firstId);
    expect(ev.status).toBe('SENT');
    expect(ev.lastError).toBeNull();
    expect(authority.requests.some((q) => q.path.includes('/invoices/reporting/single') && q.body.uuid === before.zatcaUuid)).toBe(true);

    const r = await row(firstId);
    expect(r.zatcaStatus).toBe('REJECTED');
    expect(String(r.zatcaMessage)).toContain(STUB_REJECTION_MESSAGE);
    expect(r.zatcaSubmittedAt).not.toBeNull();
    // الموقعُ نفسُه والمستندُ نفسُه — الردُّ على ما أُرسل لا على مستندٍ آخر.
    expect(r.zatcaIcv).toBe(before.zatcaIcv);
    expect(r.zatcaHash).toBe(before.zatcaHash);
    // ومغلقة: لا إعادةَ إرسال — المخرجُ بدل (ق-٩٥٨).
    const again = await submit(firstId).expect(400);
    expect(String(again.body.message)).toContain('أصدِر بدلاً');
  }, 60000);

  it('⑤ جوابُ القبول 2xx: CLEARED', async () => {
    authority ??= await startAuthorityStub('reject');
    authority.set('clear');
    const id = await makeInvoice();
    const res = await submit(id).expect(201);
    expect(res.body.zatcaStatus).toBe('CLEARED');
    expect((await row(id)).zatcaSubmittedAt).not.toBeNull();
  }, 60000);

  it('⑥ ما ليس جواباً على المستند وإن جاء من الخادم (503 · 401) يُرمى ولا يُغلق — والرمزُ هو الفيصل لا النصّ', async () => {
    authority ??= await startAuthorityStub('reject');
    const id = await makeInvoice();

    authority.set('outage');
    const outage = await submit(id).expect(503);
    expect(String(outage.body.message)).toContain('سيُعاد');
    let r = await row(id);
    expect(r.zatcaStatus).toBe('STAMPED');
    expect(String(r.zatcaMessage)).toContain('HTTP 503');
    expect(r.zatcaSubmittedAt).toBeNull();

    authority!.set('unauthorized');
    await submit(id).expect(503);
    r = await row(id);
    expect(r.zatcaStatus).toBe('STAMPED');
    expect(String(r.zatcaMessage)).toContain('HTTP 401');

    // الخادمُ نفسُه يجيب الآن بالرمز 400 — فالردُّ ردٌّ، والفيصلُ الرمز.
    authority!.set('reject');
    const rejected = await submit(id).expect(201);
    expect(rejected.body.zatcaStatus).toBe('REJECTED');
    expect(String(rejected.body.zatcaMessage)).toContain(STUB_REJECTION_MESSAGE);
  }, 60000);

  it('⑦ سقوطُ التوقيع ليس جواباً: يُحرَّر الادّعاءُ والموقعُ معه (ق-١١٩٨/⑦) — ومفتاحٌ سليم بعده يُرسل بموقعٍ يأخذه حينها بلا فجوة', async () => {
    authority ??= await startAuthorityStub('reject');
    authority.set('reject');
    await seedCredential('not-a-real-private-key', keys.certBase64);
    const id = await makeInvoice();
    const requestsBefore = authority!.requests.length;

    const failed = await submit(id).expect(503);
    expect(String(failed.body.message)).toContain('سيُعاد');
    let r = await row(id);
    expect(r.zatcaStatus).toBe('NOT_SUBMITTED');
    expect(r.zatcaSignedXml).toBeNull();
    // الموقعُ يُحرَّر مع الادّعاء: كان يبقى «للمحاولة التالية» (ق-٩٧١)، وبعد أن صار السلفُ `ICV − 1`
    // بعينه يحبس موقعٌ بلا بصمةٍ كلَّ ما بعده — فيأخذه التالي، ويأخذ هذا موقعاً جديداً حين يُعاد.
    expect(r.zatcaIcv).toBeNull();
    expect(r.zatcaUuid).toBeNull();
    expect(r.zatcaPreviousHash).toBeNull();
    expect(r.zatcaMessage).toBeTruthy();
    expect(authority!.requests.length).toBe(requestsBefore);

    await seedCredential(keys.privateKeyPem, keys.certBase64);
    const sent = await submitExpecting(id, 201);
    expect(sent.body.zatcaStatus).toBe('REJECTED');
    r = await row(id);
    // موقعٌ وهويّةٌ يُؤخذان لحظةَ الختم الناجح — ولا فجوةَ: لم يحجز أحدٌ بينهما فالرقمُ هو التالي في الوحدة.
    expect(r.zatcaIcv).not.toBeNull();
    expect(r.zatcaUuid).toBeTruthy();
    expect(authority!.requests.length).toBe(requestsBefore + 1);
  }, 60000);
});
