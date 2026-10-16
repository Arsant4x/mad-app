import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(120000);

/** Rows of a list, bare array or paged envelope. */
const rowsOf = <T>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (body as { items: T[] }).items);

/**
 * A product whose cost layers still hold stock is not deleted: the stock and its value stay in the books, so
 * removing the product would drop that stock from every screen. A product with no remaining stock is deleted.
 */
describe('Deleting a product that still holds stock (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let warehouseId: string;
  const today = () => new Date().toISOString().slice(0, 10);

  const newProduct = async (tag: string): Promise<string> =>
    (await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `delete ${tag} ${suffix}`, price: 100, cost: 40 }).expect(201)).body
      .id as string;

  const move = (productId: string, body: Record<string, unknown>) =>
    asOwner(http().post('/inventory/movements')).send({ productId, warehouseId, date: today(), reason: 'product delete test', ...body }).expect(201);

  /** What the books still hold for the product after the attempt, read the same way for every case. */
  async function stateOf(productId: string) {
    const { deleted, layers } = await tenantPrisma.runInTenantContext(company.companyId, async (tx) => ({
      deleted: await tx.product.findFirst({ where: { id: productId, deletedAt: { not: null } } }),
      layers: await tx.inventoryLayer.findMany({ where: { productId } }),
    }));
    const listed = rowsOf<{ id: string }>((await asOwner(http().get('/products')).expect(200)).body).some((p) => p.id === productId);
    const level = rowsOf<{ productId: string; warehouseId: string; qty: number }>((await asOwner(http().get('/inventory/stock-levels')).expect(200)).body).find(
      (r) => r.productId === productId && r.warehouseId === warehouseId,
    );
    return {
      deleted: deleted !== null,
      layerRemaining: layers.reduce((sum, l) => sum + Number(l.qtyRemaining), 0),
      listed,
      stockLevelQty: level ? Number(level.qty) : 0,
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'proddel');
    warehouseId = (await asOwner(http().post('/warehouses')).send({ name: `delete store ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses to delete a product while a cost layer still holds stock, and leaves it as it was', async () => {
    const productId = await newProduct('held');
    await move(productId, { type: 'IN', qty: 5, unitCost: 40 });
    const res = await asOwner(http().delete(`/products/${productId}`));
    expect({ status: res.status, message: res.body.message, ...(await stateOf(productId)) }).toEqual({
      status: 409,
      message: 'products.has_open_stock',
      deleted: false,
      layerRemaining: 5,
      listed: true,
      stockLevelQty: 5,
    });
  });

  it('deletes a product that never held stock', async () => {
    const productId = await newProduct('empty');
    await asOwner(http().delete(`/products/${productId}`)).expect(204);
    expect((await stateOf(productId)).deleted).toBe(true);
  });

  it('deletes a product whose stock was all taken out', async () => {
    const productId = await newProduct('emptied');
    await move(productId, { type: 'IN', qty: 2, unitCost: 40 });
    await move(productId, { type: 'OUT', qty: 2 });
    await asOwner(http().delete(`/products/${productId}`)).expect(204);
    expect(await stateOf(productId)).toEqual({ deleted: true, layerRemaining: 0, listed: false, stockLevelQty: 0 });
  });
});
