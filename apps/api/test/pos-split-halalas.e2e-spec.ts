import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(120000);

/**
 * Split payment parts must add up to the invoice total to the halala. A part one halala over or under
 * is refused the same way whatever the float rounding of the sum, so no sale is stamped paid with an
 * allocation larger or smaller than its invoice.
 */
describe('POS split payment parts match the total to the halala (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let productId: string;
  const stamp = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const split = (cash: number, card: number) =>
    auth(http().post('/pos/sales')).send({
      lines: [{ productId, quantity: 1 }],
      paymentMethod: 'SPLIT',
      payments: [
        { method: 'CASH', amount: cash },
        { method: 'CARD', amount: card },
      ],
      cardDeviceReference: `RRN-HALALA-${stamp}`,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'pos-halala');
    // 86.96 net + 13.04 VAT = 100.00 total.
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `halala item ${stamp}`, price: 86.96 }).expect(201)).body.id;
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses parts one halala over or under the total, whichever way the float sum rounds', async () => {
    await split(50.01, 50).expect(400);
    await split(49.99, 50).expect(400);
    await split(30.01, 70).expect(400);
    await split(29.99, 70).expect(400);
  });

  it('accepts parts that add up to the total exactly, and allocates exactly the total', async () => {
    const sale = (await split(30.01, 69.99).expect(201)).body as { id: string; total: string; status: string };
    expect(Number(sale.total)).toBe(100);
    expect(sale.status).toBe('PAID');
    const allocated = await app
      .get(TenantPrismaService)
      .runInTenantContext(company.companyId, (tx) => tx.paymentAllocation.aggregate({ where: { invoiceId: sale.id }, _sum: { amount: true } }));
    expect(Number(allocated._sum.amount)).toBe(100);
  });
});
