import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { requeueFailedWithinTx } from '../src/outbox/outbox.service';
import { INVOICE_ISSUED } from '../src/shared/events/domain-events';

/**
 * `ق-١٨٢` — «صادرٌ لم يصل»: التقرير (٢) وعودةُ `FAILED` إلى الطابور (٣).
 * شرطُ قبول الختم المتزامن (`ق-١٩٦`): بعده يخرج الإيصال مكتملَ الشكل وإن لم
 * يصل الهيئة — فهذان ما يُبقيان العلّة مرئيّةً وقابلةً للتدارك.
 *
 * كل توكيدٍ ذو وجهَين: ما يُحسب «لم يصل» يُحسب، وما قُبل لا يُحسب؛ وما `FAILED`
 * يعود، وما `SENT` لا يُمسّ.
 */
describe('ZATCA unreported report + requeue (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const invoiceIds: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
  }, 60000);

  afterAll(async () => {
    for (const id of invoiceIds) await auth(request(app.getHttpServer()).delete(`/invoices/${id}`)).catch(() => undefined);
    await app.close();
  });

  it('يعدّ ما لم يُقبَل، ولا يعدّ ما قُبل — بوجهَين (ق-١٨٢/٢)', async () => {
    const customers = await auth(request(app.getHttpServer()).get('/customers')).expect(200);
    const customerId = customers.body[0].id as string;
    const mk = async (issueDate: string) => {
      const res = await auth(request(app.getHttpServer()).post('/invoices'))
        .send({ customerId, issueDate, dueDate: issueDate, lines: [{ description: `unreported ${suffix}`, quantity: 1, unitPrice: 10, taxRate: 15 }] })
        .expect(201);
      invoiceIds.push(res.body.id);
      return res.body.id as string;
    };
    const older = await mk('2026-01-02');
    const newer = await mk('2026-01-03');

    const before = await auth(request(app.getHttpServer()).get('/zatca/unreported')).expect(200);
    const idsBefore = before.body.items.map((i: { id: string }) => i.id);
    expect(idsBefore).toContain(older);
    expect(idsBefore).toContain(newer);
    expect(before.body.count).toBeGreaterThanOrEqual(2);
    expect(typeof before.body.onboarded).toBe('boolean');
    // الأقدم أولاً — وهو ما يعطي «أقدمها» معناه.
    expect(new Date(before.body.oldestIssueDate).getTime()).toBeLessThanOrEqual(new Date('2026-01-02T00:00:00Z').getTime());

    // الوجه الثاني: مستندٌ قبلته الهيئة يخرج من التقرير — ويبقى الآخر.
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.invoice.update({ where: { id: older }, data: { zatcaStatus: 'CLEARED' } }));
    const after = await auth(request(app.getHttpServer()).get('/zatca/unreported')).expect(200);
    const idsAfter = after.body.items.map((i: { id: string }) => i.id);
    expect(idsAfter).not.toContain(older);
    expect(idsAfter).toContain(newer);
    // ⚠️ **والعدُّ يَنقص ولا يُشترط `-1` بالضبط** (ق-٢٩٢): `count` عدٌّ على
    // المنشأة كلِّها، **ودعوى هذا التوكيد وثيقتاه** — وقد حملها السطران
    // أعلاه. فاشتراطُ فارقٍ مطلقٍ على عدٍّ عامّ **سطحُه أوسعُ من دعواه**،
    // ويسقط متى قَبِلت الهيئةُ مستنداً آخر بين القراءتين.
    expect(after.body.count).toBeLessThan(before.body.count);
  }, 60000);

  it('FAILED يعود إلى الطابور عند الربط، وSENT لا يُمسّ (ق-١٨٢/٣)', async () => {
    const result = await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const failed = await tx.outboxEvent.create({
        data: { companyId, type: INVOICE_ISSUED, payload: { invoiceId: `probe-${suffix}` }, status: 'FAILED', attempts: 6, lastError: 'zatca_not_onboarded' },
      });
      const sent = await tx.outboxEvent.create({
        data: { companyId, type: INVOICE_ISSUED, payload: { invoiceId: `probe-sent-${suffix}` }, status: 'SENT', attempts: 1 },
      });
      const requeued = await requeueFailedWithinTx(tx, INVOICE_ISSUED);
      const failedAfter = await tx.outboxEvent.findUniqueOrThrow({ where: { id: failed.id } });
      const sentAfter = await tx.outboxEvent.findUniqueOrThrow({ where: { id: sent.id } });
      // تنظيف: صفّا فحصٍ لا يبقيان في طابور المنشأة التجريبية.
      await tx.outboxEvent.deleteMany({ where: { id: { in: [failed.id, sent.id] } } });
      return { requeued, failedAfter, sentAfter };
    });

    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect(result.failedAfter.status).toBe('PENDING');
    expect(result.failedAfter.attempts).toBe(0);
    expect(result.failedAfter.lastError).toBeNull();
    // الوجه الثاني: ما أُرسل لا يُعاد.
    expect(result.sentAfter.status).toBe('SENT');
    expect(result.sentAfter.attempts).toBe(1);
  }, 60000);
});
