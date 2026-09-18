import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Inventory: warehouses, stock movements, stock levels (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  async function setup(token: string, minStock = 0) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const product = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `منتج اختبار ${suffix}`, sku: `SKU-${suffix}`, minStock })
      .expect(201);
    const warehouseA = await request(app.getHttpServer())
      .post('/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `مستودع أ ${suffix}` })
      .expect(201);
    const warehouseB = await request(app.getHttpServer())
      .post('/warehouses')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `مستودع ب ${suffix}` })
      .expect(201);
    return { product: product.body, warehouseA: warehouseA.body, warehouseB: warehouseB.body };
  }

  it('[SPEC 8.2 8.10] computes on-hand quantity live from IN/OUT/TRANSFER/ADJUSTMENT movements, with no stored balance', async () => {
    const { product, warehouseA, warehouseB } = await setup(tokenA);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'IN', qty: 30, unitCost: 10, date: '2026-01-01' })
      .expect(201);

    const afterTransfer = await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, toWarehouseId: warehouseB.id, type: 'TRANSFER', qty: 10, date: '2026-01-02' })
      .expect(201);
    expect(afterTransfer.body.resultingQty).toBe(20);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'OUT', qty: 5, date: '2026-01-03' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'ADJUSTMENT', qty: -2, date: '2026-01-04' })
      .expect(201);

    const levels = await request(app.getHttpServer()).get('/inventory/stock-levels').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const rowA = levels.body.find((r: { productId: string; warehouseId: string }) => r.productId === product.id && r.warehouseId === warehouseA.id);
    const rowB = levels.body.find((r: { productId: string; warehouseId: string }) => r.productId === product.id && r.warehouseId === warehouseB.id);
    expect(rowA.qty).toBe(13); // 30 - 10 (transfer out) - 5 (out) - 2 (adjustment)
    expect(rowB.qty).toBe(10); // transfer in
  });

  it('[SPEC 8.1 8.10] flags low and out-of-stock status based on Product.minStock, and allows going negative as a soft warning only', async () => {
    const { product, warehouseA } = await setup(tokenA, 10);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'IN', qty: 12, unitCost: 10, date: '2026-01-01' })
      .expect(201);
    let levels = await request(app.getHttpServer()).get('/inventory/stock-levels').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(levels.body.find((r: { warehouseId: string }) => r.warehouseId === warehouseA.id).status).toBe('available');

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'OUT', qty: 5, date: '2026-01-02' })
      .expect(201);
    levels = await request(app.getHttpServer()).get('/inventory/stock-levels').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(levels.body.find((r: { warehouseId: string }) => r.warehouseId === warehouseA.id).status).toBe('low');

    const overSell = await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'OUT', qty: 20, date: '2026-01-03' })
      .expect(201);
    expect(overSell.body.resultingQty).toBe(-13);
    levels = await request(app.getHttpServer()).get('/inventory/stock-levels').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(levels.body.find((r: { warehouseId: string }) => r.warehouseId === warehouseA.id).status).toBe('out');
  });

  it('rejects a transfer to the same warehouse and a zero-value adjustment', async () => {
    const { product, warehouseA } = await setup(tokenA);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, toWarehouseId: warehouseA.id, type: 'TRANSFER', qty: 5, date: '2026-01-01' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'ADJUSTMENT', qty: 0, date: '2026-01-01' })
      .expect(400);
  });

  it('[SPEC 8.2] blocks deleting a warehouse that still has stock movements', async () => {
    const { product, warehouseA } = await setup(tokenA);
    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'IN', qty: 1, date: '2026-01-01' })
      .expect(201);

    await request(app.getHttpServer()).delete(`/warehouses/${warehouseA.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);
  });

  it("keeps company B from seeing company A's warehouses/stock levels or referencing its products/warehouses in a movement", async () => {
    const { product, warehouseA } = await setup(tokenA);
    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'IN', qty: 5, date: '2026-01-01' })
      .expect(201);

    const warehousesB = await request(app.getHttpServer()).get('/warehouses').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(warehousesB.body.some((w: { id: string }) => w.id === warehouseA.id)).toBe(false);

    const levelsB = await request(app.getHttpServer()).get('/inventory/stock-levels').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(levelsB.body.some((r: { productId: string }) => r.productId === product.id)).toBe(false);

    await request(app.getHttpServer())
      .post('/inventory/movements')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ productId: product.id, warehouseId: warehouseA.id, type: 'IN', qty: 1, date: '2026-01-01' })
      .expect(404);

    await request(app.getHttpServer()).delete(`/warehouses/${warehouseA.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  });
});
