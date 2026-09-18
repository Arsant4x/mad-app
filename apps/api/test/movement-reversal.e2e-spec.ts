import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { computeStockQuantities, stockQuantityKey } from '../src/inventory/stock-quantity.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **㉙ حذفُ الحركة ⟵ عكسٌ بحركةٍ مقابلة** (`ق-١٠٦٣` · 2026-09-18) — تاريخُ المخزون لا يُمحى:
 *   ① إخراجٌ يدويّ يُعكَس بإدخالٍ مقابل يشير إليه، ويعيد الاستهلاكَ إلى طبقاته الأصلية — لا طبقةً جديدة.
 *   ② إدخالٌ يدويّ لم تُستهلك طبقتُه يُعكَس بإخراجٍ يُقفل طبقتَه هو بعينها — لا `FIFO` من غيرها.
 *   ③ وما استُهلكت طبقتُه لا يُعكَس (`409` مسمًّى) — فالتاريخُ الذي بُني عليه لا يُعاد.
 *   ④ التحويلُ يُعكَس بتحويلٍ مقابل: طبقاتُ المقصِد تُقفل والمصدرُ يستعيد طبقاتِه.
 *   ⑤ لا يُعكَس ما له مستند (بيع) إلا من مستنده، ولا تُعكَس الحركةُ مرّتين، ولا يُعكَس العكس.
 *   ⑥ مسارُ الحذف زال — والحارسُ الحيّ للانحراف يبقى صادقاً بعد كلِّ عكس.
 * منشأةٌ معزولة تُزال في الختام.
 */
describe('㉙ حذفُ الحركة ⟵ عكسٌ بحركةٍ مقابلة — تاريخُ المخزون لا يُمحى (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  let whA: string;
  let whB: string;
  const suffix = `${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const product = async (name: string) => (await auth(http().post('/products')).send({ name: `${name} ${suffix}`, price: 100 }).expect(201)).body.id as string;
  const move = (body: Record<string, unknown>) => auth(http().post('/inventory/movements')).send({ date: today(), ...body });
  const reverse = (id: string) => auth(http().post(`/inventory/movements/${id}/reverse`)).send({});
  const layersOf = (productId: string, warehouseId: string) =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryLayer.findMany({ where: { productId, warehouseId }, orderBy: { createdAt: 'asc' } }));
  const consumptionsOf = (movementId: string) =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryConsumption.findMany({ where: { movementId }, orderBy: { createdAt: 'asc' } }));
  const movementRow = (id: string) => tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.findUniqueOrThrow({ where: { id } }));
  const num = (v: unknown) => Number(v);
  async function driftIsZero() {
    const { qty, layers, open } = await tenantPrisma.runInTenantContext(companyId, async (tx) => ({
      qty: await computeStockQuantities(tx),
      layers: await tx.inventoryLayer.findMany({ select: { productId: true, warehouseId: true, qtyRemaining: true } }),
      open: await tx.inventoryConsumption.findMany({ where: { layerId: null, settledBy: { is: null } }, select: { qty: true, movement: { select: { productId: true, warehouseId: true } } } }),
    }));
    const remaining = new Map<string, number>();
    for (const l of layers) remaining.set(stockQuantityKey(l.productId, l.warehouseId), (remaining.get(stockQuantityKey(l.productId, l.warehouseId)) ?? 0) + num(l.qtyRemaining));
    const openQty = new Map<string, number>();
    for (const c of open) openQty.set(stockQuantityKey(c.movement.productId, c.movement.warehouseId), (openQty.get(stockQuantityKey(c.movement.productId, c.movement.warehouseId)) ?? 0) + num(c.qty));
    const keys = new Set<string>([...qty.keys(), ...remaining.keys(), ...openQty.keys()]);
    return [...keys].filter((k) => Math.abs((remaining.get(k) ?? 0) - (openQty.get(k) ?? 0) - (qty.get(k) ?? 0)) > 0.0005);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'movement-reversal');
    token = company.token;
    companyId = company.companyId;
    whA = (await auth(http().post('/warehouses')).send({ name: `مستودع أ ${suffix}` }).expect(201)).body.id;
    whB = (await auth(http().post('/warehouses')).send({ name: `مستودع ب ${suffix}` }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('① إخراجٌ يدويّ يُعكَس بإدخالٍ مقابلٍ يشير إليه — والاستهلاكُ يعود إلى طبقته الأصلية لا إلى طبقةٍ جديدة', async () => {
    const p = await product('صنفُ عكس إخراج');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10, unitCost: 30, date: '2026-01-01' }).expect(201);
    const out = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 4 }).expect(201);
    expect((await layersOf(p, whA)).map((l) => num(l.qtyRemaining))).toEqual([6]);

    const rev = await reverse(out.body.id).expect(201);
    expect(rev.body.type).toBe('IN');
    expect(num(rev.body.qty)).toBe(4);
    expect(rev.body.reversalOfId).toBe(out.body.id);
    expect(rev.body.resultingQty).toBe(10);
    const layers = await layersOf(p, whA);
    expect(layers).toHaveLength(1);
    expect(num(layers[0].qtyRemaining)).toBe(10);
    expect(await consumptionsOf(rev.body.id)).toEqual([]);
    expect((await movementRow(out.body.id)).id).toBe(out.body.id);
    expect(await driftIsZero()).toEqual([]);
  }, 60000);

  it('② إدخالٌ لم تُستهلك طبقتُه يُعكَس بإخراجٍ يُقفل طبقتَه هو — لا FIFO من غيرها', async () => {
    const p = await product('صنفُ عكس إدخال');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 5, unitCost: 10, date: '2026-01-01' }).expect(201);
    const later = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 7, unitCost: 20, date: '2026-01-03' }).expect(201);
    const rev = await reverse(later.body.id).expect(201);
    expect(rev.body.type).toBe('OUT');
    expect(num(rev.body.qty)).toBe(7);
    const layers = await layersOf(p, whA);
    expect(layers.map((l) => [num(l.unitCost), num(l.qtyRemaining)])).toEqual([
      [10, 5],
      [20, 0],
    ]);
    const cons = await consumptionsOf(rev.body.id);
    expect(cons.map((c) => [c.layerId, num(c.qty), num(c.unitCost)])).toEqual([[layers[1].id, 7, 20]]);
    expect(await driftIsZero()).toEqual([]);
  }, 60000);

  it('③ ما استُهلكت طبقتُه لا يُعكَس — 409 مسمًّى، ولا يتغيّر شيء', async () => {
    const p = await product('صنفٌ مستهلَك');
    const inn = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10, unitCost: 30, date: '2026-01-01' }).expect(201);
    await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 1 }).expect(201);
    const res = await reverse(inn.body.id).expect(409);
    expect(String(res.body.message)).toContain('استُهلك');
    expect((await layersOf(p, whA)).map((l) => num(l.qtyRemaining))).toEqual([9]);
    expect(await driftIsZero()).toEqual([]);
  }, 60000);

  it('④ التحويلُ يُعكَس بتحويلٍ مقابل: طبقاتُ المقصِد تُقفل والمصدرُ يستعيد طبقاتِه بتاريخها', async () => {
    const p = await product('صنفُ عكس تحويل');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10, unitCost: 12, date: '2026-01-05' }).expect(201);
    const tr = await move({ productId: p, warehouseId: whA, toWarehouseId: whB, type: 'TRANSFER', qty: 4 }).expect(201);
    expect((await layersOf(p, whA)).map((l) => num(l.qtyRemaining))).toEqual([6]);
    expect((await layersOf(p, whB)).map((l) => num(l.qtyRemaining))).toEqual([4]);

    const rev = await reverse(tr.body.id).expect(201);
    expect(rev.body.type).toBe('TRANSFER');
    expect(rev.body.warehouseId).toBe(whB);
    expect(rev.body.toWarehouseId).toBe(whA);
    expect((await layersOf(p, whA)).map((l) => num(l.qtyRemaining))).toEqual([10]);
    expect((await layersOf(p, whB)).map((l) => num(l.qtyRemaining))).toEqual([0]);
    expect(await driftIsZero()).toEqual([]);
  }, 60000);

  it('⑤ لا يُعكَس ما له مستند إلا من مستنده، ولا تُعكَس الحركةُ مرّتين، ولا يُعكَس العكسُ', async () => {
    const p = await product('صنفُ منع');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 3, unitCost: 5 }).expect(201);
    const out = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 1 }).expect(201);
    const rev = await reverse(out.body.id).expect(201);
    expect(String((await reverse(out.body.id).expect(409)).body.message)).toContain('عُكست');
    expect(String((await reverse(rev.body.id).expect(409)).body.message)).toContain('عكس');

    // حركةٌ لها مستند: شطبٌ مسجَّل — يُعكَس من مستنده لا من هنا
    const wo = await auth(http().post('/inventory/write-offs')).send({ productId: p, warehouseId: whA, qty: 1, reasonCode: 'DAMAGE', occurredAt: today() }).expect(201);
    const approved = await auth(http().post(`/inventory/write-offs/${wo.body.id}/approve`)).send({}).expect(201);
    const woMovementId = (approved.body.movementId ?? (await tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryWriteOff.findUniqueOrThrow({ where: { id: wo.body.id }, select: { movementId: true } }))).movementId) as string;
    expect(woMovementId).toBeTruthy();
    expect(String((await reverse(woMovementId).expect(409)).body.message)).toContain('مستند');
    expect(await driftIsZero()).toEqual([]);
  }, 60000);

  it('⑥ مسارُ الحذف زال — لا حذفَ لحركةٍ بعد اليوم', async () => {
    const p = await product('صنفُ حذف');
    const inn = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 1, unitCost: 1 }).expect(201);
    await auth(http().delete(`/inventory/movements/${inn.body.id}`)).expect(404);
    expect((await movementRow(inn.body.id)).id).toBe(inn.body.id);
  }, 30000);
});
