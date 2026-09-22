import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { InvoiceStatus } from '@prisma/client';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * `outstanding` على قائمة الفواتير — وتطابق التعدادات بين المخطط والواجهة.
 *
 * وُلد هذا الملف من عطل حقيقي على بيئة منشورة: `outstandingOf` كان يطرح
 * الإشعارات الدائنة ولا يطرح المقبوض، فالفاتورة المسدَّدة جزئياً تُحتسب
 * بكاملها. النتيجة أن شاشة العملاء أظهرت 18,400 بينما تقرير الأعمار أظهر
 * 13,400 لنفس العميل — رقمان متناقضان يراهما التاجر في آنٍ واحد، وأخطرهما
 * الذي لا ينهار بل يُعرض بثقة.
 */
describe('Invoice outstanding = total - credits - allocations (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): الصندوقُ (بنكٌ) يُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  let customerId: string;
  let bankId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'invoice-outstanding');
    token = company.token;
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل المتبقي ${suffix}` }).expect(201)).body.id;
    bankId = (
      await auth(request(app.getHttpServer()).post('/banks')).send({ name: `صندوق المتبقي ${suffix}`, openingBalance: 0, openingDate: '2026-01-01' }).expect(201)
    ).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  const listed = async (id: string) => {
    // ② `outstanding` نصٌّ بخانتين (`ق-١٢٣٥`) — يُقارَن حرفاً لا بتقريب.
    const rows = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body as { id: string; status: string; outstanding: string }[];
    return rows.find((r) => r.id === id)!;
  };

  it('[SPEC 4.4] a partly paid invoice reports its REMAINING amount, not its total', async () => {
    const inv = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, issueDate: '2026-07-01', dueDate: '2026-08-01', lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 1000, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
      .expect(201);

    expect((await listed(inv.body.id)).outstanding).toBe('1000.00');

    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, date: '2026-07-15', amount: 400, method: 'CASH', bankId, allocations: [{ invoiceId: inv.body.id, amount: 400 }] })
      .expect(201);

    const after = await listed(inv.body.id);
    // العطل بالضبط: كان يعيد 1000 — أي أن العميل يُطالَب بما دفعه.
    expect(after.outstanding).toBe('600.00');
    expect(after.status).toBe('PARTIAL');
  }, 90000);

  it('a fully paid invoice reports zero', async () => {
    const inv = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, issueDate: '2026-07-02', dueDate: '2026-08-02', lines: [{ description: `بند كامل ${suffix}`, quantity: 1, unitPrice: 500, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
      .expect(201);

    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, date: '2026-07-16', amount: 500, method: 'CASH', bankId, allocations: [{ invoiceId: inv.body.id, amount: 500 }] })
      .expect(201);

    const after = await listed(inv.body.id);
    expect(after.outstanding).toBe('0.00');
    expect(after.status).toBe('PAID');
  }, 90000);

  /**
   * الحارس البنيوي: النوع في الواجهة مكتوب بيد ولا رابط آلي يشدّه إلى المخطط.
   * يجعل أي قيمة تُضاف إلى `InvoiceStatus` في Prisma تسقط هنا فوراً بدل أن
   * تمرّ صامتة وتنهار عند أول بيانات حقيقية — وهو ما حدث بـPARTIAL.
   */
  it('the Prisma InvoiceStatus enum still matches what the web app renders', () => {
    // نسخة مطابقة لما في apps/web/src/api/invoices.ts وpages/invoices/statusMeta.ts
    const webKnown = ['DUE', 'PARTIAL', 'PAID', 'OVERDUE'].sort();
    const prismaStatuses = Object.values(InvoiceStatus).sort();
    expect({ web: webKnown }).toEqual({ web: prismaStatuses });
  });
});
