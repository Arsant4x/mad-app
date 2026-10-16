import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: one company, three warehouses, two branches, one employee and about twenty requests.
jest.setTimeout(120000);

interface StockRow {
  productId: string;
  warehouseId: string;
  qty: number;
}
const rowsOf = <T>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (body as { items: T[] }).items);

/**
 * Stock movements and write-offs follow the warehouse's branch.
 *
 * An employee restricted to the North branch may only move stock out of, into or within the North warehouse and the
 * company-wide warehouse; a transfer into another branch's warehouse stays open to them, since they see those
 * warehouses by name in order to transfer to them. The movement, its journal entry and the write-off carry the branch
 * the warehouse serves, not the branch the request names.
 */
describe('Inventory movements are scoped to the warehouse branch', () => {
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
  let southBranch: string;
  let productId: string;

  const movement = (body: Record<string, unknown>) => ({ productId, qty: 1, date: today(), reason: `move ${suffix}`, ...body });
  const writeOff = (body: Record<string, unknown>) => ({ productId, qty: 1, reasonCode: 'DAMAGE', occurredAt: today(), ...body });
  const qtyIn = async (warehouseId: string) => {
    const rows = rowsOf<StockRow>((await asOwner(http().get('/inventory/stock-levels')).expect(200)).body);
    return rows.find((r) => r.productId === productId && r.warehouseId === warehouseId)?.qty ?? 0;
  };
  const entryBranch = (entryId: string | null) =>
    entryId
      ? tenantPrisma.runInTenantContext(company.companyId, async (tx) => (await tx.journalEntry.findUnique({ where: { id: entryId }, select: { branchId: true } }))?.branchId ?? null)
      : Promise.resolve('no entry');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'inventory-warehouse-branch');
    north = (await asOwner(http().post('/warehouses')).send({ name: `North ${suffix}` }).expect(201)).body.id;
    south = (await asOwner(http().post('/warehouses')).send({ name: `South ${suffix}` }).expect(201)).body.id;
    shared = (await asOwner(http().post('/warehouses')).send({ name: `Shared ${suffix}` }).expect(201)).body.id;
    northBranch = (await asOwner(http().post('/branches')).send({ name: `North branch ${suffix}`, warehouseId: north }).expect(201)).body.id;
    southBranch = (await asOwner(http().post('/branches')).send({ name: `South branch ${suffix}`, warehouseId: south }).expect(201)).body.id;

    const templateId = (await asOwner(http().post('/templates')).send({ name: `Inventory ${suffix}`, allowedScreens: ['dashboard', 'inventory'] }).expect(201)).body.id as string;
    const username = `north-inv-${suffix}`;
    await asOwner(http().post('/company-users')).send({ name: 'North employee', username, password: PASSWORD, permissionTemplateId: templateId, branchIds: [northBranch] }).expect(201);
    northToken = (await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200)).body.accessToken;

    productId = (await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `Scoped item ${suffix}`, price: 50 }).expect(201)).body.id as string;
    for (const warehouseId of [north, south, shared]) {
      await asOwner(http().post('/inventory/movements')).send(movement({ warehouseId, type: 'IN', qty: 10, unitCost: 10 })).expect(201);
    }
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a restricted user moving stock in or out of another branch warehouse', async () => {
    const statuses = {
      out: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: south, type: 'OUT', qty: 4, branchId: northBranch }))).status,
      outNoBranch: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: south, type: 'OUT', qty: 4 }))).status,
      in: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: south, type: 'IN', qty: 4, unitCost: 10, branchId: northBranch }))).status,
      adjustment: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: south, type: 'ADJUSTMENT', qty: -4, branchId: northBranch }))).status,
      transferOut: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: south, toWarehouseId: north, type: 'TRANSFER', qty: 4, branchId: northBranch }))).status,
      writeOff: (await asNorth(http().post('/inventory/write-offs')).send(writeOff({ warehouseId: south, qty: 4, branchId: northBranch }))).status,
    };
    expect({ statuses, southQty: await qtyIn(south) }).toEqual({
      statuses: { out: 403, outNoBranch: 403, in: 403, adjustment: 403, transferOut: 403, writeOff: 403 },
      southQty: 10,
    });
  });

  it('keeps its own warehouse, the company-wide warehouse and transfers into another branch open', async () => {
    const statuses = {
      ownOut: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: north, type: 'OUT' }))).status,
      sharedOut: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: shared, type: 'OUT' }))).status,
      transferIntoSouth: (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: north, toWarehouseId: south, type: 'TRANSFER' }))).status,
      ownWriteOff: (await asNorth(http().post('/inventory/write-offs')).send(writeOff({ warehouseId: north }))).status,
    };
    expect({ statuses, northQty: await qtyIn(north), southQty: await qtyIn(south) }).toEqual({
      statuses: { ownOut: 201, sharedOut: 201, transferIntoSouth: 201, ownWriteOff: 201 },
      northQty: 8,
      southQty: 11,
    });
  });

  it('posts a movement and its entry on the warehouse branch even when the body names another branch', async () => {
    const ownerOut = (await asOwner(http().post('/inventory/movements')).send(movement({ warehouseId: south, type: 'OUT', branchId: northBranch })).expect(201)).body;
    const northNoBranch = (await asNorth(http().post('/inventory/movements')).send(movement({ warehouseId: north, type: 'OUT' })).expect(201)).body;
    const ownerTransfer = (await asOwner(http().post('/inventory/movements')).send(movement({ warehouseId: south, toWarehouseId: north, type: 'TRANSFER', branchId: northBranch })).expect(201)).body;
    const sharedNamed = (await asOwner(http().post('/inventory/movements')).send(movement({ warehouseId: shared, type: 'OUT', branchId: northBranch })).expect(201)).body;
    expect({
      ownerOut: { movement: ownerOut.branchId, entry: await entryBranch(ownerOut.journalEntryId) },
      northNoBranch: { movement: northNoBranch.branchId, entry: await entryBranch(northNoBranch.journalEntryId) },
      ownerTransfer: ownerTransfer.branchId,
      sharedNamed: { movement: sharedNamed.branchId, entry: await entryBranch(sharedNamed.journalEntryId) },
    }).toEqual({
      ownerOut: { movement: southBranch, entry: southBranch },
      northNoBranch: { movement: northBranch, entry: northBranch },
      ownerTransfer: southBranch,
      sharedNamed: { movement: northBranch, entry: northBranch },
    });
  });

  it('records a write-off on the warehouse branch and refuses approving one on another branch warehouse', async () => {
    const recorded = (await asOwner(http().post('/inventory/write-offs')).send(writeOff({ warehouseId: south, branchId: northBranch })).expect(201)).body;
    // A row written before the branch was derived from the warehouse: North branch on the South warehouse.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.$executeRaw`UPDATE "inventory_write_offs" SET "branchId" = ${northBranch} WHERE "id" = ${recorded.id}`);
    const southBefore = await qtyIn(south);
    const approve = (await asNorth(http().post(`/inventory/write-offs/${recorded.id}/approve`))).status;
    const reject = (await asNorth(http().post(`/inventory/write-offs/${recorded.id}/reject`)).send({ reason: `reject ${suffix}` })).status;
    expect({ recordedBranch: recorded.branchId, approve, reject, southDelta: (await qtyIn(south)) - southBefore }).toEqual({
      recordedBranch: southBranch,
      approve: 403,
      reject: 403,
      southDelta: 0,
    });
  });
});
