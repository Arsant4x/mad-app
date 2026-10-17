import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { localDateOf } from '../src/common/wall-clock.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(150000);

const DAY_MS = 86_400_000;
const RIYADH = 180;

/**
 * The issue time is stamped in the signed document, so it is bounded by the server: an invoice's issue time falls on
 * its issue date and not ahead of the server clock, a live sale is timed by the server, and a synced offline sale is
 * timed between its shift's opening and now.
 */
describe('Issue time is bounded by the server clock (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let customerId: string;
  let productId: string;
  let shiftId: string;
  const stamp = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const invoice = (issuedAt: Date, issueDate: string) =>
    auth(http().post('/invoices')).send({
      customerId,
      issueDate,
      dueDate: issueDate,
      issuedAt: issuedAt.toISOString(),
      issuedOffsetMin: RIYADH,
      lines: [{ description: `service ${stamp}`, quantity: 1, unitPrice: 100, taxRate: 15 }],
    });
  const sale = (path: string, ringAt: Date, extra: Record<string, unknown> = {}) =>
    auth(http().post(path)).send({ ringAt: ringAt.toISOString(), ringOffsetMin: RIYADH, lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH', ...extra });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'issue-time');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `buyer ${stamp}` }).expect(201)).body.id;
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `item ${stamp}`, price: 50 }).expect(201)).body.id;
    shiftId = (await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('accepts an invoice whose issue time is now and falls on its issue date', async () => {
    const now = new Date();
    await invoice(now, localDateOf(now, RIYADH)).expect(201);
  });

  it('refuses an invoice whose issue time falls on another day than its issue date', async () => {
    const earlier = new Date(Date.now() - 2 * DAY_MS);
    const res = await invoice(earlier, localDateOf(new Date(), RIYADH));
    expect(res.status).toBe(400);
  });

  it('refuses an invoice whose issue time is ahead of the server clock', async () => {
    const later = new Date(Date.now() + 40 * DAY_MS);
    const res = await invoice(later, localDateOf(later, RIYADH));
    expect(res.status).toBe(400);
  });

  it('times a live sale by the server clock, not the time the device sends', async () => {
    const before = Date.now();
    const res = await sale('/pos/sales', new Date(Date.now() + 400 * DAY_MS)).expect(201);
    const after = Date.now();
    const issuedAt = new Date(res.body.issuedAt).getTime();
    expect(issuedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(issuedAt).toBeLessThanOrEqual(after + 1000);
    expect(String(res.body.issueDate).slice(0, 10)).toBe(localDateOf(new Date(issuedAt), RIYADH));
  });

  it('accepts a synced sale rung after its shift opened', async () => {
    await sale('/pos/sales/sync', new Date(), { clientSaleId: randomUUID() }).expect(201);
  });

  it('refuses a synced sale rung ahead of the server clock', async () => {
    const res = await sale('/pos/sales/sync', new Date(Date.now() + 400 * DAY_MS), { clientSaleId: randomUUID() });
    expect(res.status).toBe(400);
  });

  it('refuses a synced sale rung before its shift opened', async () => {
    const opened = await app
      .get(TenantPrismaService)
      .runInTenantContext(company.companyId, (tx) => tx.posShift.findUniqueOrThrow({ where: { id: shiftId }, select: { openedAt: true } }));
    const res = await sale('/pos/sales/sync', new Date(opened.openedAt.getTime() - DAY_MS), { clientSaleId: randomUUID() });
    expect(res.status).toBe(400);
  });
});
