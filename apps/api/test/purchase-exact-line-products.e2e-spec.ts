import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// File budget: one isolated company and a handful of purchases.
jest.setTimeout(120000);

/**
 * Purchase line amounts are quantity x price on the decimal values, rounded once per line as the totals
 * function does. The binary product of 0.375 x 0.6 is 0.22499999999999998, which rounded down to 0.22,
 * while the line is 0.225 exactly and rounds to 0.23.
 */
describe('purchase line amounts use the exact decimal product (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  let supplierId = '';
  let warehouseId = '';
  let branchId = '';
  let productId = '';
  const today = () => new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company!.token}`);
  const post = (path: string) => auth(http().post(path));
  const patch = (path: string) => auth(http().patch(path));

  const tie = { description: 'tie line', quantity: 0.375, unitPrice: 0.6, taxRate: 15 };
  const purchase = (extra: Record<string, unknown>) => ({
    supplierId,
    date: today(),
    warehouseId,
    branchId,
    category: 'مصروفات أخرى',
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'exact-line-products');
    const suffix = Date.now();
    supplierId = (await post('/suppliers').send({ name: `exact supplier ${suffix}` }).expect(201)).body.id;
    warehouseId = (await post('/warehouses').send({ name: `exact warehouse ${suffix}` }).expect(201)).body.id;
    branchId = (await post('/branches').send({ name: `exact branch ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `exact product ${suffix}`, price: 10, cost: 1 }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a purchase whose line is a half halala tie is accepted with the subtotal the line rounds to', async () => {
    const res = await post('/purchases').send(purchase({ subtotal: 0.23, lines: [tie] }));
    expect({ status: res.status, subtotal: res.body.subtotal }).toEqual({ status: 201, subtotal: '0.23' });
  });

  it('editing a purchase to a tie line derives the subtotal from the exact line amount', async () => {
    const created = await post('/purchases').send(purchase({ subtotal: 1, lines: [{ description: 'one', quantity: 1, unitPrice: 1, taxRate: 15 }] })).expect(201);
    const res = await patch(`/purchases/${created.body.id}`).send({ lines: [tie] });
    expect({ status: res.status, subtotal: res.body.subtotal }).toEqual({ status: 200, subtotal: '0.23' });
  });

  it('a supplier debit note on a tie line stores the subtotal the line rounds to', async () => {
    const original = await post('/purchases').send(purchase({ subtotal: 10, lines: [{ description: 'ten', quantity: 1, unitPrice: 10, taxRate: 15 }] })).expect(201);
    const res = await post(`/purchases/${original.body.id}/supplier-debit-note`).send({ reason: 'price correction', lines: [{ description: 'tie', quantity: 0.375, unitPrice: 0.6 }] });
    expect({ status: res.status, subtotal: res.body.subtotal }).toEqual({ status: 201, subtotal: '0.23' });
  });

  it('a partial goods receipt of a tie quantity carries the exact base amount', async () => {
    const created = await post('/purchases')
      .send(purchase({ subtotal: 1.2, receiveNow: false, lines: [{ description: 'stocked', productId, quantity: 2, unitPrice: 0.6, taxRate: 15 }] }))
      .expect(201);
    const lineId = created.body.lines[0].id;
    const res = await post(`/purchases/${created.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 0.375 }] });
    expect(res.status).toBe(201);
    const stored = await tenantPrisma.runInTenantContext(company!.companyId, (tx) => tx.goodsReceiptLine.findMany({ where: { purchaseLineId: lineId } }));
    expect(stored.map((l) => Number(l.baseAmount))).toEqual([0.23]);
  });

  it('the non deductible tax of a purchase is split by the exact line amounts', async () => {
    // Lines 0.011 x 15 (0.165 exactly, 0.16499999999999998 in binary) and 0.10: the tax 0.04 splits 0.03 and 0.01
    // by the weights 0.17 and 0.10, where the binary weight 0.16 split it 0.02 and 0.02.
    const created = await post('/purchases')
      .send(
        purchase({
          subtotal: 0.27,
          inputVatUse: 'EXEMPT_ONLY',
          lines: [
            { description: 'tie service', quantity: 0.011, unitPrice: 15, taxRate: 15 },
            { description: 'other service', quantity: 1, unitPrice: 0.1, taxRate: 15 },
          ],
        }),
      )
      .expect(201);
    const lines = created.body.lines as { id: string; description: string }[];
    const first = lines.find((l) => l.description === 'tie service')!;
    const second = lines.find((l) => l.description === 'other service')!;
    const events = await tenantPrisma.runInTenantContext(company!.companyId, (tx) =>
      tx.nonDeductibleVatEvent.findMany({ where: { purchaseId: created.body.id }, include: { lines: true } }),
    );
    expect(events).toHaveLength(1);
    const share = (lineId: string) => Number(events[0].lines.find((l) => l.purchaseLineId === lineId)?.baseAmount);
    expect({ first: share(first.id), second: share(second.id) }).toEqual({ first: 0.03, second: 0.01 });
  });
});
