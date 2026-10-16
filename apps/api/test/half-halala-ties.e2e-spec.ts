import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: one isolated company and about a dozen requests.
jest.setTimeout(300000);

/**
 * Documents whose tax or line amount is an exact half halala store it rounded half away from zero, as the
 * rounding policy says: 100.30 at 15% is 15.045 and is stored as 15.05, and 0.375 x 0.60 is 0.225 and is
 * stored as 0.23. The expected figures are written out, not recomputed with the function under test.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const text = (d: Prisma.Decimal) => d.toFixed(2);

describe('Half halala ties in stored document totals (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = iso(new Date());

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  const line = (unitPrice: number, quantity = 1) => ({ description: `item ${suffix}`, quantity, unitPrice, taxRate: 15, taxCategory: 'S' });

  let customerId: string;
  let supplierId: string;

  const storedInvoice = (id: string) =>
    inTenant(async (tx) => {
      const i = await tx.invoice.findUniqueOrThrow({ where: { id } });
      return [text(i.subtotal), text(i.taxTotal), text(i.total)];
    });

  const storedPurchase = (id: string) =>
    inTenant(async (tx) => {
      const p = await tx.purchase.findUniqueOrThrow({ where: { id } });
      return [text(p.subtotal), text(p.taxAmount), text(p.total)];
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'half-ties');
    customerId = await createTenantCustomer(app, company.token, `ties customer ${suffix}`);
    supplierId = (await auth(http().post('/suppliers')).send({ name: `ties supplier ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('an invoice of 100.30 stores tax 15.05 and total 115.35', async () => {
    const res = await auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [line(100.3)] });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    expect(await storedInvoice(res.body.id)).toEqual(['100.30', '15.05', '115.35']);
  });

  it('an invoice line of 0.375 x 0.60 stores the line amount 0.23', async () => {
    const res = await auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [line(0.6, 0.375)] });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    // 0.23 at 15% is 0.0345, which rounds to 0.03.
    expect(await storedInvoice(res.body.id)).toEqual(['0.23', '0.03', '0.26']);
  });

  it('a credit note of 100.30 stores tax 15.05, the same as the invoice it corrects', async () => {
    const original = await auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [line(200)] }).expect(201);
    const credit = await auth(http().post(`/invoices/${original.body.id}/credit-note`)).send({ reason: `price correction ${suffix}`, issueDate: today, lines: [line(100.3)] });
    expect({ status: credit.status, message: credit.body.message }).toEqual({ status: 201, message: undefined });
    expect(await storedInvoice(credit.body.id)).toEqual(['100.30', '15.05', '115.35']);
  });

  it('a purchase of 100.30 stores tax 15.05 and total 115.35', async () => {
    const res = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 100.3 });
    expect({ status: res.status, message: res.body.message }).toEqual({ status: 201, message: undefined });
    expect(await storedPurchase(res.body.id)).toEqual(['100.30', '15.05', '115.35']);
  });

  it('a supplier credit note of 100.30 stores tax 15.05', async () => {
    const original = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 200 }).expect(201);
    const note = await auth(http().post(`/purchases/${original.body.id}/supplier-credit-note`)).send({
      reason: `price correction ${suffix}`,
      date: today,
      lines: [{ description: `correction ${suffix}`, quantity: 1, unitPrice: 100.3 }],
    });
    expect({ status: note.status, message: note.body.message }).toEqual({ status: 201, message: undefined });
    expect(await storedPurchase(note.body.id)).toEqual(['100.30', '15.05', '115.35']);
  });

  it('a quote of 100.30 stores tax 15.05', async () => {
    const res = await auth(http().post('/quotes')).send({ customerId, issueDate: today, validUntil: today, lines: [line(100.3)] }).expect(201);
    const quote = await inTenant((tx) => tx.quote.findUniqueOrThrow({ where: { id: res.body.id } }));
    expect([text(quote.subtotal), text(quote.taxTotal), text(quote.total)]).toEqual(['100.30', '15.05', '115.35']);
  });

  it('a non tie is unchanged: an invoice of 100.20 stores tax 15.03', async () => {
    const res = await auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [line(100.2)] }).expect(201);
    expect(await storedInvoice(res.body.id)).toEqual(['100.20', '15.03', '115.23']);
  });
});
