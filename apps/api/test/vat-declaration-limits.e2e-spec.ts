import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

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
    const customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ name: 'عميل خاضع' }).expect(201)).body.id;
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
  }, 30000);
});
