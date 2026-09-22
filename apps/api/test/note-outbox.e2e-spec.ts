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
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (42.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(130000);

/**
 * 🔴 **إشعارُ البيع يدخل طابورَ الإرسال عند إنشائه** (`ق-١٠٠٧`) — الحارسُ الحيّ على المسار الحقيقيّ
 * (توقيعٌ فعليّ · منشأةٌ معزولة · خادمٌ محلّيّ يمثّل الهيئة يجيب بالقبول):
 *
 *   ① إشعارٌ دائنٌ يُنشأ ⟵ حدثٌ في الطابور (`PENDING` بحمولته) ⟵ الدورةُ تُرسله ⟵ يصل الخادمَ الممثِّل
 *      بمعرّفه ⟵ `SENT` و`CLEARED`. (وكان يبلغ الهيئةَ بالإرسال اليدويّ وحدَه.)
 *   ② والإشعارُ المدين كذلك.
 *   ③ وإشعارٌ أُرسل يدوياً قبل الدورة لا يُرسَل مرّتين — الحدثُ يُختم بلا طلبٍ ثانٍ (`ق-٩٨٣`).
 */
describe('إشعارُ البيع يدخل طابورَ الإرسال عند إنشائه (e2e)', () => {
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

  function row(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { no: true, docType: true, zatcaStatus: true, zatcaUuid: true, zatcaSubmittedAt: true } }),
    );
  }

  function eventOf(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.outboxEvent.findFirst({ where: { type: INVOICE_ISSUED, payload: { path: ['invoiceId'], equals: id } } }),
    );
  }

  const dispatch = () => outbox.dispatchForCompany(companyId, 20, new Date());
  const sentFor = (uuid: string | null) => authority.requests.filter((q) => q.path.includes('/invoices/') && q.body.uuid === uuid).length;

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    authority = await startAuthorityStub('clear');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    outbox = app.get(OutboxService);

    company = await registerIsolatedCompany(app, 'noteoutbox');
    token = company.token;
    companyId = company.companyId;
    await auth(request(server()).patch('/company-profile')).send({ legalName: 'شركة إشعار الطابور التجارية', vatNumber: '300000000000003' }).expect(200);
    customerId = (await auth(request(server()).post('/customers')).send({ kind: 'NATURAL', name: `عميل الإشعار ${Date.now()}` }).expect(201)).body.id;
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

  let invoiceId: string;

  it('① إشعارٌ دائنٌ يُنشأ ⟵ حدثٌ في الطابور ⟵ يصل الخادمَ الممثِّل ⟵ SENT وCLEARED', async () => {
    invoiceId = await makeInvoice();
    expect((await dispatch()).sent).toBe(1);
    expect((await row(invoiceId)).zatcaStatus).toBe('CLEARED');

    const note = await auth(request(server()).post(`/invoices/${invoiceId}/credit-note`)).send({ reason: 'مرتجعٌ كامل' }).expect(201);
    created.push(note.body.id);
    const ev = await eventOf(note.body.id);
    // الحدثُ يُكتب مع الإشعار في المعاملة نفسِها — لا بعده ولا بيد.
    expect(ev).not.toBeNull();
    expect(ev!.status).toBe('PENDING');
    expect(ev!.attempts).toBe(0);
    expect((ev!.payload as { docType: string; no: string }).docType).toBe('CREDIT_NOTE');
    expect((ev!.payload as { docType: string; no: string }).no).toBe(note.body.no);

    const result = await dispatch();
    expect(result.sent).toBe(1);
    const after = await eventOf(note.body.id);
    expect(after!.status).toBe('SENT');
    expect(after!.lastError).toBeNull();
    const r = await row(note.body.id);
    expect(r.docType).toBe('CREDIT_NOTE');
    expect(r.zatcaStatus).toBe('CLEARED');
    expect(r.zatcaSubmittedAt).not.toBeNull();
    // وصل الخادمَ الممثِّل بمعرّف الإشعار نفسِه — لا بمعرّف فاتورته.
    expect(sentFor(r.zatcaUuid)).toBe(1);
  }, 60000);

  it('② والإشعارُ المدين كذلك', async () => {
    const note = await auth(request(server()).post(`/invoices/${invoiceId}/debit-note`))
      .send({ reason: 'فوترةٌ إضافية', lines: [{ description: 'رسوم', quantity: 1, unitPrice: 20, taxRate: 15 }] })
      .expect(201);
    created.push(note.body.id);
    const ev = await eventOf(note.body.id);
    expect(ev?.status).toBe('PENDING');
    expect((ev!.payload as { docType: string }).docType).toBe('DEBIT_NOTE');

    expect((await dispatch()).sent).toBe(1);
    expect((await eventOf(note.body.id))!.status).toBe('SENT');
    const r = await row(note.body.id);
    expect(r.zatcaStatus).toBe('CLEARED');
    expect(sentFor(r.zatcaUuid)).toBe(1);
  }, 60000);

  it('③ إشعارٌ أُرسل يدوياً قبل الدورة لا يُرسَل مرّتين — الحدثُ يُختم بلا طلبٍ ثانٍ', async () => {
    const second = await makeInvoice();
    expect((await dispatch()).sent).toBe(1);
    const note = await auth(request(server()).post(`/invoices/${second}/credit-note`)).send({ reason: 'مرتجعٌ ثانٍ' }).expect(201);
    created.push(note.body.id);
    const manual = await auth(request(server()).post(`/zatca/invoices/${note.body.id}/submit`)).expect(201);
    expect(manual.body.zatcaStatus).toBe('CLEARED');
    const uuid = (await row(note.body.id)).zatcaUuid;
    expect(sentFor(uuid)).toBe(1);

    expect((await dispatch()).sent).toBe(1);
    const ev = await eventOf(note.body.id);
    expect(ev!.status).toBe('SENT');
    expect(ev!.attempts).toBe(1);
    expect(sentFor(uuid)).toBe(1);
  }, 60000);
});
