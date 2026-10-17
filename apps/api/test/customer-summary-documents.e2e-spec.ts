import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';

// Suite time budget: three times the measured run.
jest.setTimeout(90000);

/**
 * The customer summary reads the same documents as the exposure source: a rejected invoice that has a
 * replacement leaves "billed" and the replacement enters it, and every figure is in the company currency
 * (baseTotal for billed, each allocation times its invoice rate for collected), like "outstanding".
 */
describe('Customer summary counts each sale once in the company currency (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let customerId: string;
  let bankId: string;
  const created: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  type Summary = { billed: string; collected: string; outstanding: string };
  const summary = async () => (await auth(http().get(`/customers/${customerId}/summary`)).expect(200)).body as Summary;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'customer-summary');
    token = company.token;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `Summary customer ${suffix}` }).expect(201)).body.id;
    bankId = (await auth(http().post('/banks')).send({ name: `Summary cash box ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    if (company) await purgeInvoicesForTest(tenantPrisma, company.companyId, created);
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('a rejected invoice with a replacement is billed once', async () => {
    const rejectedId = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `Line ${suffix}`, quantity: 1, unitPrice: 500, taxCategory: 'S' }] })
        .expect(201)
    ).body.id as string;
    created.push(rejectedId);
    // The authority's rejection is the only state the replacement path checks.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.invoice.update({ where: { id: rejectedId }, data: { zatcaStatus: 'REJECTED' } }));
    const replacement = await auth(http().post(`/invoices/${rejectedId}/replacement`)).send({}).expect(201);
    created.push(replacement.body.id);

    expect(await summary()).toMatchObject({ billed: '575.00', collected: '0.00', outstanding: '575.00' });
  });

  it('a foreign currency invoice and its allocation are read in the company currency', async () => {
    const usdId = (
      await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, currency: 'USD', exchangeRate: 3.75, lines: [{ description: `USD line ${suffix}`, quantity: 1, unitPrice: 100, taxCategory: 'S' }] })
        .expect(201)
    ).body.id as string;
    created.push(usdId);
    await auth(http().post('/payments'))
      .send({ customerId, date: today, amount: 50, currency: 'USD', exchangeRate: 3.75, method: 'CASH', bankId, allocations: [{ invoiceId: usdId, amount: 50 }] })
      .expect(201);

    // 115 USD at 3.75 is 431.25; 50 USD collected at the invoice rate is 187.50.
    expect(await summary()).toMatchObject({ billed: '1006.25', collected: '187.50', outstanding: '818.75' });
  });
});
