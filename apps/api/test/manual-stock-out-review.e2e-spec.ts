import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(120000);

type As = (r: request.Test) => request.Test;

/** Rows of a list, bare array or paged envelope. */
const rowsOf = <T>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (body as { items: T[] }).items);

/**
 * A manual stock movement that reduces inventory value (a stock out or a negative adjustment) needs the review
 * action on the inventory screen, like approving a write-off; record alone is refused and nothing is written.
 * Movements that do not reduce value (stock in, positive adjustment, transfer between own warehouses) keep record.
 */
describe('Manual stock movements that reduce inventory value need review (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'StockOutPass123!';
  const http = () => request(app.getHttpServer());
  const bearer =
    (token: string): As =>
    (r) =>
      r.set('Authorization', `Bearer ${token}`);
  let asOwner: As;
  let asRecorder: As;
  let asReviewer: As;
  let warehouseId: string;
  let otherWarehouseId: string;
  let productId: string;
  const today = () => new Date().toISOString().slice(0, 10);
  const NEEDS_REVIEW = 'inventory.stock_out_needs_review';

  const move = (as: As, body: Record<string, unknown>) =>
    as(http().post('/inventory/movements')).send({ productId, warehouseId, date: today(), reason: 'manual movement test', ...body });

  const movementCount = () => tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.stockMovement.count({ where: { productId } }));

  async function stockIn(id: string): Promise<number> {
    const res = await asOwner(http().get('/inventory/stock-levels')).expect(200);
    const row = rowsOf<{ productId: string; warehouseId: string; qty: number }>(res.body).find((r) => r.productId === productId && r.warehouseId === id);
    return row ? Number(row.qty) : 0;
  }

  async function employee(tag: string, inventoryActions: string[]): Promise<As> {
    const template = await asOwner(http().post('/templates'))
      .send({ name: `stock out ${tag} ${suffix}`, allowedScreens: ['inventory', 'products'], screenActions: { inventory: inventoryActions, products: ['view'] } })
      .expect(201);
    const username = `so-${tag}-${suffix}`;
    await asOwner(http().post('/company-users'))
      .send({ name: `stock out ${tag}`, username, password: PASSWORD, permissionTemplateId: template.body.id, allBranches: true })
      .expect(201);
    const login = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    return bearer(login.body.accessToken as string);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'stockout');
    asOwner = bearer(company.token);
    warehouseId = (await asOwner(http().post('/warehouses')).send({ name: `main store ${suffix}` }).expect(201)).body.id;
    otherWarehouseId = (await asOwner(http().post('/warehouses')).send({ name: `back store ${suffix}` }).expect(201)).body.id;
    productId = (
      await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `stock out item ${suffix}`, price: 100, cost: 40 }).expect(201)
    ).body.id;
    await move(asOwner, { type: 'IN', qty: 20, unitCost: 40 }).expect(201);

    asRecorder = await employee('recorder', ['view', 'record']);
    asReviewer = await employee('reviewer', ['view', 'record', 'review']);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a stock out from an employee who holds record without review, and writes nothing', async () => {
    const rowsBefore = await movementCount();
    const stockBefore = await stockIn(warehouseId);
    const res = await move(asRecorder, { type: 'OUT', qty: 3 });
    expect({ status: res.status, message: res.body.message, rowsWritten: (await movementCount()) - rowsBefore, stock: await stockIn(warehouseId) }).toEqual({
      status: 403,
      message: NEEDS_REVIEW,
      rowsWritten: 0,
      stock: stockBefore,
    });
  });

  it('refuses a negative adjustment from an employee who holds record without review, and writes nothing', async () => {
    const rowsBefore = await movementCount();
    const stockBefore = await stockIn(warehouseId);
    const res = await move(asRecorder, { type: 'ADJUSTMENT', qty: -2 });
    expect({ status: res.status, message: res.body.message, rowsWritten: (await movementCount()) - rowsBefore, stock: await stockIn(warehouseId) }).toEqual({
      status: 403,
      message: NEEDS_REVIEW,
      rowsWritten: 0,
      stock: stockBefore,
    });
  });

  it('keeps record for movements that do not reduce value: stock in, positive adjustment, transfer', async () => {
    const entered = await move(asRecorder, { type: 'IN', qty: 2, unitCost: 40 });
    const positive = await move(asRecorder, { type: 'ADJUSTMENT', qty: 1, unitCost: 40 });
    const transfer = await move(asRecorder, { type: 'TRANSFER', qty: 1, toWarehouseId: otherWarehouseId });
    expect([entered.status, positive.status, transfer.status]).toEqual([201, 201, 201]);
  });

  it('lets an employee who holds review take stock out and adjust it down', async () => {
    const before = await stockIn(warehouseId);
    await move(asReviewer, { type: 'OUT', qty: 1 }).expect(201);
    await move(asReviewer, { type: 'ADJUSTMENT', qty: -1 }).expect(201);
    expect(await stockIn(warehouseId)).toBe(before - 2);
  });

  it('lets the company owner take stock out', async () => {
    const before = await stockIn(warehouseId);
    await move(asOwner, { type: 'OUT', qty: 1 }).expect(201);
    expect(await stockIn(warehouseId)).toBe(before - 1);
  });
});
