import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Batch/expiry tracking on stock, and the "what's expiring" report — the
 * perishable side of inventory that a pharmacy (or grocer) lives on.
 *
 * What's protected: expiry/batch are captured on receiving, the report surfaces
 * exactly the batches inside the horizon (expired ones first), a batch still
 * far out is left off, and — as ever — one company never sees another's stock.
 */
describe('Stock batch/expiry (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let productId: string;
  let warehouseId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const productName = `دواء ${suffix}`;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  function iso(daysFromToday: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
  }

  async function receive(body: Record<string, unknown>) {
    return authA(request(app.getHttpServer()).post('/inventory/movements'))
      .send({ productId, warehouseId, type: 'IN', qty: 10, unitCost: 5, date: iso(0), ...body })
      .expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;

    // ٥+٦ الصنفُ معلَنٌ تتبّعُه — فالدفعةُ على الإدخال كيانٌ والتقريرُ يقرأ المتبقّي من طبقاتها (ق-١٠٨٦).
    const product = await authA(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: true, name: productName, sku: `SKU-${suffix}` }).expect(201);
    productId = product.body.id;
    const warehouse = await authA(request(app.getHttpServer()).post('/warehouses')).send({ name: `مستودع ${suffix}` }).expect(201);
    warehouseId = warehouse.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('captures batch + expiry on a receiving movement', async () => {
    const res = await receive({ batchNo: `B-SOON-${suffix}`, expiryDate: iso(30) });
    expect(res.body.batchNo).toBe(`B-SOON-${suffix}`);
    expect(res.body.expiryDate?.slice(0, 10)).toBe(iso(30));
  });

  it('lists batches inside the horizon, expired first, and leaves far ones off', async () => {
    await receive({ batchNo: `B-EXP-${suffix}`, expiryDate: iso(-10) });
    await receive({ batchNo: `B-FAR-${suffix}`, expiryDate: iso(400) });

    const res = await authA(request(app.getHttpServer()).get('/inventory/expiring?withinDays=90')).expect(200);
    // ٥+٦ الصفوفُ بالمتبقّي من الطبقات (`qtyKind: REMAINING`)، ومعها الحدودُ الثلاثة المعلَنة (ق-١٠٨٥).
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(res.body.declaredLimits).toHaveLength(3);
    const mine = (res.body.rows as { productName: string; batchNo: string; qty: number; qtyKind: string; daysLeft: number; expired: boolean }[]).filter((r) => r.productName === productName);
    expect(mine.every((r) => r.qtyKind === 'REMAINING' && r.qty === 10)).toBe(true);

    const batches = mine.map((r) => r.batchNo);
    expect(batches).toContain(`B-SOON-${suffix}`);
    expect(batches).toContain(`B-EXP-${suffix}`);
    expect(batches).not.toContain(`B-FAR-${suffix}`);

    // Already-expired sorts first (soonest/most-overdue expiry first).
    expect(mine[0].batchNo).toBe(`B-EXP-${suffix}`);
    expect(mine.find((r) => r.batchNo === `B-EXP-${suffix}`)!.expired).toBe(true);
    expect(mine.find((r) => r.batchNo === `B-SOON-${suffix}`)!.expired).toBe(false);
  });

  it('never shows one company another\'s expiring batches', async () => {
    const res = await authB(request(app.getHttpServer()).get('/inventory/expiring?withinDays=90')).expect(200);
    expect((res.body.rows as { productName: string }[]).some((r) => r.productName === productName)).toBe(false);
  });
});
