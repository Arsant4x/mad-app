import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (8.2 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * **حالةُ السداد لا تُكتب من الخارج** (`ق-١١٩٨`/② — مراجعةٌ خارجية).
 *
 * `UpdateInvoiceDto` كان يحمل `status`، و`update()` يكتبه: `PATCH { status: 'PAID' }` على فاتورةٍ
 * بلا ريالٍ مقبوض **كانت تُختم مسدَّدةً** (`200` والحالةُ `PAID` — الحالةُ ① سقطت على الشيفرة
 * القديمة). والقاعدة `4.5`: الحالةُ مشتقّةٌ من التخصيصات ويكتبها `recomputeInvoiceStatus` وحدَه.
 * صار الحقلُ خارجَ المُدخَل فيُردّ `400` بالقائمة البيضاء، والحالةُ كما كانت.
 */
describe('حالةُ الفاتورة مشتقّةٌ لا مكتوبة (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let invoiceId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'status-derived');
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الحالة' }).expect(201)).body.id;
    const today = new Date().toISOString().slice(0, 10);
    invoiceId = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }] })
        .expect(201)
    ).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  const statusOf = async (): Promise<string> => {
    const rows = (await auth(http().get('/invoices')).expect(200)).body as { id: string; status: string }[];
    return rows.find((r) => r.id === invoiceId)!.status;
  };

  it('🔴 ① `status` في المُدخَل يُردّ 400 — والفاتورةُ تبقى مستحقّةً بلا ريال', async () => {
    expect(await statusOf()).toBe('DUE');
    const res = await auth(http().patch(`/invoices/${invoiceId}`)).send({ status: 'PAID' }).expect(400);
    expect(String(res.body.message)).toContain('status');
    expect(await statusOf()).toBe('DUE');
  });

  it('② وما ليس حالةً يبقى قابلاً للتعديل — الملاحظات', async () => {
    await auth(http().patch(`/invoices/${invoiceId}`)).send({ notes: 'ملاحظةٌ بعد الإصدار' }).expect(200);
    expect(await statusOf()).toBe('DUE');
  });
});
