import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';
import { clearCredential, seedProductionCredential } from './zatca-credential';

/**
 * **مهلةٌ على الاتصال بالهيئة** (`ق-١١٩٨`/③ — مراجعةٌ خارجية).
 *
 * الخادمُ المحلّيُّ الذي يمثّل الهيئة يقبل الاتصالَ **ولا يجيب أبداً** (`hang`). قبل الإصلاح كان
 * `fetch` بلا `signal` يبقى معلَّقاً حتى تقطعه `undici` بعد خمس دقائقَ من صمت الترويسات —
 * فالحالةُ ① كانت تسقط بتجاوز مهلة الاختبار (`15 s`) لا بجواب. صار الاتصالُ يحمل
 * `AbortSignal.timeout(ZATCA_HTTP_TIMEOUT_MS)`: يُقطع في مهلته، **والانقضاءُ ليس جواباً**
 * (`ق-٩٧١`) — يُكتب سبباً في الصفّ ويُرمى `503` فيعود الطابور، ولا يُكتب `REJECTED`.
 */
describe('مهلةُ الاتصال بالهيئة — الصمتُ يُقطع ولا يُنتظر (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let invoiceId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // المهلةُ من البيئة كي تُقاس بلحظاتٍ لا بدقائق — والقيمةُ الافتراضية `30 s` في الشيفرة.
    process.env.ZATCA_HTTP_TIMEOUT_MS = '700';
    authority = await startAuthorityStub('hang');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'zatca-timeout');
    await auth(http().patch('/company-profile')).send({ legalName: 'شركة المهلة', vatNumber: '300000000000003' }).expect(200);
    await seedProductionCredential(tenantPrisma, company.companyId);

    // عميلٌ بلا رقمٍ ضريبي ⇒ فاتورةٌ مبسّطة (إبلاغ) — والمسارُ واحد للاثنتين.
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل المهلة' }).expect(201)).body.id;
    const today = new Date().toISOString().slice(0, 10);
    invoiceId = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }] })
        .expect(201)
    ).body.id;
  }, 90000);

  afterAll(async () => {
    delete process.env.ZATCA_HTTP_TIMEOUT_MS;
    await purgeInvoicesForTest(tenantPrisma, company.companyId, [invoiceId]);
    await clearCredential(tenantPrisma, company.companyId);
    await removeIsolatedCompany(app, company);
    await app.close();
    await authority.close();
  }, 60000);

  it('🔴 ① خادمٌ صامتٌ: الإرسالُ يُقطع في مهلته ويُرمى 503 — لا يُنتظر ولا يُكتب مردوداً', async () => {
    const started = Date.now();
    const res = await auth(http().post(`/zatca/invoices/${invoiceId}/submit`)).expect(503);
    const elapsed = Date.now() - started;
    // وصل الخادمَ فعلاً — فالقطعُ وقع على اتصالٍ قائم لا على منفذٍ لا يصغي.
    expect(authority.requests.length).toBeGreaterThan(0);
    // المهلةُ `700 ms` + الختمُ والتوقيعُ قبلها — ولا خمسُ دقائق.
    expect(elapsed).toBeLessThan(10_000);
    expect(String(res.body.message)).toMatch(/timeout|TimeoutError|مهلة|abort/i);

    const row = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { zatcaStatus: true, zatcaMessage: true, zatcaHash: true } }),
    );
    // مختومٌ (الهاشُ محفوظ) وليس مردوداً — الانقضاءُ ليس جواباً من الهيئة.
    expect(row.zatcaHash).toBeTruthy();
    expect(row.zatcaStatus).not.toBe('REJECTED');
    expect(row.zatcaStatus).not.toBe('CLEARED');
    expect(String(row.zatcaMessage)).toMatch(/timeout|TimeoutError|abort/i);
  }, 15000);
});
