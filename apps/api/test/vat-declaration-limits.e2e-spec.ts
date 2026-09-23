import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (19.9 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(60000);

/**
 * حدودُ الإقرار المعلَنة (`ق-١٢٦٠`): الحدُّ يُعلنه الخادم في ردّ الإقرار **حين يُقاس** — منشأةٌ خاضعةٌ وحدَها لا حدَّ
 * عليها (الحالةُ السالبة هنا)؛ والمختلطةُ (سكنيٌّ معفى بجانب خاضع) تحمل الحدَّ — تُثبتها المرحلةُ ④ من
 * `rent-accrual-return.e2e-spec.ts` على منشأة العرض المختلطة.
 */
describe('VAT declaration declared limits (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'vat-limits');
    const customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: 'عميل خاضع' }).expect(201)).body.id;
    await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, issueDate: '2026-05-10', dueDate: '2026-06-10', lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 6.1] a taxable-only period carries no declared limit — the limit is measured, not written', async () => {
    const res = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, quarter: 2 }).expect(200);
    expect(res.body.salesStandard).toBe('100.00');
    expect(res.body.salesExempt).toBe('0.00');
    expect(res.body.limits).toEqual([]);
    // ⑥A2 — والربعُ يُعلن نوعَه ورقمَه، ويطابق إعدادَ المنشأة الافتراضيّ.
    expect(res.body).toMatchObject({ periodType: 'QUARTERLY', periodNo: 2, companyVatPeriod: 'QUARTERLY', periodMatchesCompany: true, from: '2026-04-01', to: '2026-06-30' });
  });

  it('⑥A2 — الشهرُ يُطلب كما يُطلب الربع: مدىً أضيقُ وأرقامٌ منه وحدَه', async () => {
    const may = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, month: 5 }).expect(200);
    expect(may.body).toMatchObject({ periodType: 'MONTHLY', periodNo: 5, from: '2026-05-01', to: '2026-05-31', salesStandard: '100.00' });
    // والفاتورةُ في مايو، فشهرُ أبريل صفرٌ — المدى يعمل لا الاسمُ وحدَه.
    const april = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, month: 4 }).expect(200);
    expect(april.body).toMatchObject({ periodType: 'MONTHLY', periodNo: 4, salesStandard: '0.00' });
    // ⚠️ **والفترةُ عدسةٌ لا بوّابة**: منشأةٌ إعدادُها ربعيّ تقرأ الشهرَ ولا تُمنع — ويُعلَن الاختلاف.
    expect(may.body.periodMatchesCompany).toBe(false);
    expect(may.body.companyVatPeriod).toBe('QUARTERLY');
  });

  it('⑥A2 — ربعٌ وشهرٌ معاً أو لا واحدَ: يُردّ برسالةٍ عربيةٍ تقول ماذا يُرسَل', async () => {
    const both = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, quarter: 2, month: 5 }).expect(400);
    expect(JSON.stringify(both.body)).toContain('أحدهما لا كلاهما');
    const neither = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026 }).expect(400);
    expect(JSON.stringify(neither.body)).toContain('أحدهما لا كلاهما');
    // والمدى يُحرَس كما كان — لا يُفتح بفتح الشهر.
    await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, month: 13 }).expect(400);
    await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, quarter: 5 }).expect(400);
  });

  it('⑥A2 — وسمُ «قُدِّم» بالنوع والرقم معاً: شهرُ ٢ وربعُ ٢ وسمان لا واحد', async () => {
    const q = { year: 2026, quarter: 2 };
    const m = { year: 2026, month: 2 };
    await auth(request(app.getHttpServer()).post('/obligations/vat-declaration/filed')).send(q).expect(201);
    // الرقمُ نفسُه (٢) بنوعٍ آخر — **لو كان المفتاحُ الرقمَ وحدَه لقرأ الشهرُ وسمَ الربع**.
    const monthBefore = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query(m).expect(200);
    expect(monthBefore.body.filed).toBeNull();
    const quarterAfter = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query(q).expect(200);
    expect(quarterAfter.body.filed).not.toBeNull();

    await auth(request(app.getHttpServer()).post('/obligations/vat-declaration/filed')).send(m).expect(201);
    const monthAfter = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query(m).expect(200);
    expect(monthAfter.body.filed).not.toBeNull();

    // ورفعُ وسمِ الشهر لا يرفع وسمَ الربع.
    await auth(request(app.getHttpServer()).delete('/obligations/vat-declaration/filed')).query(m).expect(200);
    expect((await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query(m).expect(200)).body.filed).toBeNull();
    expect((await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query(q).expect(200)).body.filed).not.toBeNull();
    await auth(request(app.getHttpServer()).delete('/obligations/vat-declaration/filed')).query(q).expect(200);
  });

  it('⑥A2 — إعدادُ الفترة يُعلَن ولا يُقلب آلياً، وحدُّ الأربعين مليوناً لا يُنذر دونه', async () => {
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ vatPeriod: 'MONTHLY' }).expect(200);
    const res = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, month: 5 }).expect(200);
    expect(res.body).toMatchObject({ companyVatPeriod: 'MONTHLY', periodMatchesCompany: true });
    // ⚠️ والإعدادُ شهريٌّ الآن — فلا يُقاس حدُّ الإلزام أصلاً، ولا إنذارَ عليه.
    expect(res.body.limits.map((l: { code: string }) => l.code)).not.toContain('MONTHLY_VAT_PERIOD_REQUIRED');
    // وعوداً إلى الربعيّ بمبيعاتٍ قدرُها مئة: الحدُّ الأعلى الرخيص دون أربعين مليوناً ⟵ لا إنذار.
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ vatPeriod: 'QUARTERLY' }).expect(200);
    const back = await auth(request(app.getHttpServer()).get('/obligations/vat-declaration')).query({ year: 2026, quarter: 2 }).expect(200);
    expect(back.body.limits).toEqual([]);
  });
});
