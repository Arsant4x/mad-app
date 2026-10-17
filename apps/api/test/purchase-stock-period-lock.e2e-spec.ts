import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { KSA_UTC_OFFSET_MIN, localDateOf } from '../src/common/wall-clock.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: about three times the measured run.
jest.setTimeout(60000);

/**
 * Purchase stock paths move stock even when their journal entry is skipped at zero value, so they respect the period
 * lock on their own: a zero cost goods receipt, a supplier return of zero cost goods, and voiding a zero cost receipt
 * while today's period is closed. A movement with an invalid date is refused as a bad request.
 */
describe('Purchase stock movements respect the period lock without a journal entry (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const YEAR = 2093;
  const CLOSED = `03/${YEAR}`;
  const companyDay = () => localDateOf(new Date(), KSA_UTC_OFFSET_MIN);

  const http = () => request(app.getHttpServer());
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${company!.token}`);

  let supplierId: string;
  let warehouseId: string;
  let freeProduct: string;

  type Period = { id: string; month: number; year: number };
  async function closePeriod(day: string) {
    const [y, m] = day.split('-').map(Number);
    const years = (await as(http().get('/fiscal-years')).expect(200)).body as { periods: Period[] }[];
    const period = years.flatMap((yr) => yr.periods).find((p) => p.year === y && p.month === m);
    if (!period) throw new Error(`no fiscal period for ${day}`);
    await as(http().patch(`/fiscal-years/periods/${period.id}/close`)).expect(200);
  }
  const expectPeriodClosed = (res: request.Response, label: string) => {
    expect({ status: res.status, named: String(res.body.message).includes(label) }).toEqual({ status: 409, named: true });
  };
  const movementsOn = (day: string) =>
    tenantPrisma.runInTenantContext(company!.companyId, (tx) => tx.stockMovement.count({ where: { productId: freeProduct, date: new Date(`${day}T00:00:00.000Z`) } }));

  /** A purchase with a costed service line and a zero cost stocked line, not received yet. */
  async function zeroCostPurchase(date: string) {
    const res = await as(http().post('/purchases'))
      .send({
        supplierId,
        date,
        subtotal: 10,
        category: 'بضاعة',
        receiveNow: false,
        lines: [
          { description: `service ${suffix}`, quantity: 1, unitPrice: 10, taxRate: 15 },
          { description: `free goods ${suffix}`, productId: freeProduct, quantity: 5, unitPrice: 0, taxRate: 15 },
        ],
      })
      .expect(201);
    const stocked = (res.body.lines as { id: string; productId: string | null }[]).find((l) => l.productId === freeProduct)!;
    return { id: res.body.id as string, stockedLineId: stocked.id };
  }
  const receive = (purchaseId: string, purchaseLineId: string, receivedAt: string) =>
    as(http().post(`/purchases/${purchaseId}/receipts`)).send({ receivedAt, warehouseId, lines: [{ purchaseLineId, quantity: 5 }] });

  let returnable: { id: string; stockedLineId: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'purchase-period');
    await as(http().post('/fiscal-years')).send({ name: `Year ${YEAR}`, start: `${YEAR}-01-01`, end: `${YEAR}-12-31` }).expect(201);
    supplierId = (await as(http().post('/suppliers')).send({ name: `Supplier ${suffix}` }).expect(201)).body.id;
    warehouseId = (await as(http().post('/warehouses')).send({ name: `Store ${suffix}` }).expect(201)).body.id;
    freeProduct = (await as(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `Free ${suffix}`, price: 10 }).expect(201)).body.id;
    returnable = await zeroCostPurchase(`${YEAR}-02-05`);
    await closePeriod(`${YEAR}-03-01`);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a zero cost goods receipt dated in a closed period and accepts it in an open one', async () => {
    expectPeriodClosed(await receive(returnable.id, returnable.stockedLineId, `${YEAR}-03-10`), CLOSED);
    expect(await movementsOn(`${YEAR}-03-10`)).toBe(0);

    const open = await receive(returnable.id, returnable.stockedLineId, `${YEAR}-02-10`).expect(201);
    expect(open.body.journalEntryId).toBeNull();
  });

  it('refuses returning zero cost goods to the supplier on a date in a closed period', async () => {
    const note = await as(http().post(`/purchases/${returnable.id}/supplier-credit-note`)).send({
      reason: `return ${suffix}`,
      date: `${YEAR}-03-20`,
      lines: [{ description: `free goods ${suffix}`, productId: freeProduct, quantity: 2, unitPrice: 0, taxRate: 15, returnsPurchaseLineId: returnable.stockedLineId, goodsReturned: true }],
    });
    expectPeriodClosed(note, CLOSED);
    expect(await movementsOn(`${YEAR}-03-20`)).toBe(0);
  });

  it('refuses a stock movement with an invalid date as a bad request', async () => {
    for (const date of ['not-a-date', `${YEAR}-13-45`]) {
      const res = await as(http().post('/inventory/movements')).send({ productId: freeProduct, warehouseId, type: 'IN', qty: 1, unitCost: 0, date, reason: 'date check' });
      expect({ date, status: res.status }).toEqual({ date, status: 400 });
    }
  });

  it('refuses voiding a zero cost goods receipt while the current period is closed', async () => {
    const today = companyDay();
    const purchase = await zeroCostPurchase(today);
    const receipt = (await receive(purchase.id, purchase.stockedLineId, today).expect(201)).body as { id: string };
    await closePeriod(today);

    const voided = await as(http().delete(`/purchases/${purchase.id}/receipts/${receipt.id}`));
    expectPeriodClosed(voided, `${today.slice(5, 7)}/${today.slice(0, 4)}`);
    const out = await tenantPrisma.runInTenantContext(company!.companyId, (tx) =>
      tx.stockMovement.count({ where: { productId: freeProduct, type: 'OUT', goodsReceiptLine: { goodsReceiptId: receipt.id } } }),
    );
    expect(out).toBe(0);
  });
});
