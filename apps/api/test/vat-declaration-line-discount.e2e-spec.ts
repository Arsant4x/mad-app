import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { STANDARD_VAT_RATE } from '../src/common/vat/standard-rate';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * The VAT return reads each sales line at its net after the line discount, the same figure the
 * invoice stores and posts, so box 1 equals the invoice to the halala.
 */
jest.setTimeout(90000);

describe('VAT return reads the line discount (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let customerId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'vat-line-discount');
    token = company.token;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `Discount customer ${Date.now()}` }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app?.close();
  }, 120000);

  it('puts the discounted net and VAT of the invoice in box 1', async () => {
    const created = await auth(http().post('/invoices'))
      .send({
        customerId,
        issueDate: today(),
        dueDate: today(),
        lines: [{ description: 'Consulting', quantity: 1, unitPrice: 1000, discount: 100, taxRate: STANDARD_VAT_RATE }],
      })
      .expect(201);
    expect(Number(created.body.subtotal)).toBeCloseTo(900, 2);
    expect(Number(created.body.taxTotal)).toBeCloseTo(135, 2);

    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const d = await auth(http().get('/obligations/vat-declaration')).query({ year: now.getUTCFullYear(), quarter }).expect(200);
    expect(d.body.boxes['1']).toEqual({ net: '900.00', vat: '135.00' });
    expect(d.body.salesStandard).toBe('900.00');
    expect(d.body.salesStandardVat).toBe('135.00');
  });
});
