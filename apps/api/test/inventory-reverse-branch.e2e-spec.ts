import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: one company, three warehouses, two branches, one employee and about twenty five requests.
jest.setTimeout(120000);

interface StockRow {
  productId: string;
  warehouseId: string;
  qty: number;
}
const rowsOf = <T>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (body as { items: T[] }).items);

/**
 * Reversing a stock movement follows the warehouse's branch, like recording one.
 *
 * A movement the restricted user can see (no branch, or their own branch) may still sit on another branch's
 * warehouse when it was written before the branch was derived from the warehouse. Its reversal moves stock in that
 * warehouse, so it is refused; a transfer's reversal moves stock out of its destination, so both ends must be theirs.
 */
describe('Reversing a stock movement is scoped to the warehouse branch', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'ScopePass123!';
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let northToken: string;
  const asNorth = (r: request.Test) => r.set('Authorization', `Bearer ${northToken}`);
  const today = () => new Date().toISOString().slice(0, 10);
  let north: string;
  let south: string;
  let shared: string;
  let northBranch: string;
  let productId: string;

  const movement = (body: Record<string, unknown>) => ({ productId, qty: 1, date: today(), reason: `move ${suffix}`, ...body });
  const record = async (as: (r: request.Test) => request.Test, body: Record<string, unknown>) =>
    (await as(http().post('/inventory/movements')).send(movement(body)).expect(201)).body.id as string;
  const reverseAs = async (as: (r: request.Test) => request.Test, id: string) => (await as(http().post(`/inventory/movements/${id}/reverse`)).send({})).status;
  const setBranch = (id: string, branchId: string | null) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.$executeRaw`UPDATE "stock_movements" SET "branchId" = ${branchId} WHERE "id" = ${id}`);
  const qtyIn = async (warehouseId: string) => {
    const rows = rowsOf<StockRow>((await asOwner(http().get('/inventory/stock-levels')).expect(200)).body);
    return rows.find((r) => r.productId === productId && r.warehouseId === warehouseId)?.qty ?? 0;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'inventory-reverse-branch');
    north = (await asOwner(http().post('/warehouses')).send({ name: `North ${suffix}` }).expect(201)).body.id;
    south = (await asOwner(http().post('/warehouses')).send({ name: `South ${suffix}` }).expect(201)).body.id;
    shared = (await asOwner(http().post('/warehouses')).send({ name: `Shared ${suffix}` }).expect(201)).body.id;
    northBranch = (await asOwner(http().post('/branches')).send({ name: `North branch ${suffix}`, warehouseId: north }).expect(201)).body.id;
    await asOwner(http().post('/branches')).send({ name: `South branch ${suffix}`, warehouseId: south }).expect(201);

    const templateId = (await asOwner(http().post('/templates')).send({ name: `Inventory ${suffix}`, allowedScreens: ['dashboard', 'inventory'] }).expect(201)).body.id as string;
    const username = `north-rev-${suffix}`;
    await asOwner(http().post('/company-users')).send({ name: 'North employee', username, password: PASSWORD, permissionTemplateId: templateId, branchIds: [northBranch] }).expect(201);
    northToken = (await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200)).body.accessToken;

    productId = (await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `Reversed item ${suffix}`, price: 50 }).expect(201)).body.id as string;
    for (const warehouseId of [north, south, shared]) await record(asOwner, { warehouseId, type: 'IN', qty: 10, unitCost: 10 });
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a restricted user reversing a movement on another branch warehouse', async () => {
    // Rows written before the branch was derived from the warehouse: one with no branch, one naming the North branch.
    const legacyIn = await record(asOwner, { warehouseId: south, type: 'IN', qty: 2, unitCost: 10 });
    await setBranch(legacyIn, null);
    const namedOut = await record(asOwner, { warehouseId: south, type: 'OUT', qty: 1 });
    await setBranch(namedOut, northBranch);
    // Recorded by the North employee themselves; its reversal would take the stock back out of South.
    const transferIntoSouth = await record(asNorth, { warehouseId: north, toWarehouseId: south, type: 'TRANSFER', qty: 1 });
    const before = { south: await qtyIn(south), north: await qtyIn(north) };

    const statuses = {
      legacyIn: await reverseAs(asNorth, legacyIn),
      namedOut: await reverseAs(asNorth, namedOut),
      transferIntoSouth: await reverseAs(asNorth, transferIntoSouth),
    };
    expect({ statuses, south: await qtyIn(south), north: await qtyIn(north) }).toEqual({
      statuses: { legacyIn: 403, namedOut: 403, transferIntoSouth: 403 },
      south: before.south,
      north: before.north,
    });
  });

  it('keeps reversing a movement on its own warehouse and the company-wide warehouse open', async () => {
    const before = { north: await qtyIn(north), shared: await qtyIn(shared) };
    const ownIn = await record(asNorth, { warehouseId: north, type: 'IN', qty: 2, unitCost: 10 });
    const ownOut = await record(asNorth, { warehouseId: north, type: 'OUT', qty: 1 });
    const sharedOut = await record(asOwner, { warehouseId: shared, type: 'OUT', qty: 1 });
    const sharedIntoNorth = await record(asNorth, { warehouseId: shared, toWarehouseId: north, type: 'TRANSFER', qty: 1 });

    const statuses = {
      sharedIntoNorth: await reverseAs(asNorth, sharedIntoNorth),
      ownOut: await reverseAs(asNorth, ownOut),
      ownIn: await reverseAs(asNorth, ownIn),
      sharedOut: await reverseAs(asNorth, sharedOut),
    };
    expect({ statuses, north: await qtyIn(north), shared: await qtyIn(shared) }).toEqual({
      statuses: { sharedIntoNorth: 201, ownOut: 201, ownIn: 201, sharedOut: 201 },
      north: before.north,
      shared: before.shared,
    });
  });
});
