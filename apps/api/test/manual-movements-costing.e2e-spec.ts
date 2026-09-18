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
 * **㉘ الحركاتُ اليدوية عبر طبقات التكلفة** (`ق-١٠٦٣` · 2026-09-18) — كانت الكمّيةُ تتحرّك والقيمةُ لا:
 * إدخالٌ يدويّ بلا طبقة، وإخراجٌ بلا استهلاك، وتحويلٌ يترك طبقاتِه في المصدر، ووعدٌ في الشيفرة بتسوية
 * الاستهلاك المؤقّت «عند وصول الاستلام» بلا كاتب. الشروطُ الأربعة:
 *   ① لا صفرَ صامت — تكلفةُ الإدخال تُدخَل أو يُرفض (لا أخذَ من البطاقة).
 *   ② الإخراجُ والتسويةُ السالبة يستهلكان `FIFO` ويسجّلان الاستهلاك — وما لا طبقةَ له مؤقّتٌ بآخر تكلفةٍ معروفة.
 *   ③ التسويةُ الموجبة طبقةٌ كالإدخال.
 *   ④ التحويلُ ينقل الطبقةَ لا الكمّيةَ وحدَها — بتكلفتها وتاريخ اقتنائها إلى المستودع المقصِد.
 *   ⑤ **الوعدُ يُنفَّذ**: المؤقّتُ يُسوَّى عند وصول الاستلام (شراءً أو إدخالاً يدوياً) بصفٍّ يشير إلى الأصل،
 *      وفرقُ التكلفة في الدفتر (`5100` ⇄ `1300`)، ويخرج من قائمة المفتوحة التي صارت تُقرأ.
 *   ⑥ حارسُ الانحراف: لكلِّ (صنف · مستودع) — Σ المتبقّي في الطبقات − Σ المؤقّت المفتوح = رصيدُ الحركات.
 * منشأةٌ معزولة تُزال في الختام.
 */
type Layer = { id: string; qtyReceived: unknown; qtyRemaining: unknown; unitCost: unknown; sourceType: string; sourceMovementId: string | null; acquiredAt: Date };
type Consumption = { id: string; layerId: string | null; movementId: string; qty: unknown; unitCost: unknown; settlesId: string | null };
type Provisional = { id: string; movementId: string; productId: string; warehouseId: string; qty: number; unitCost: number };

describe('㉘ الحركاتُ اليدوية عبر طبقات التكلفة — لا كمّيةَ بلا تكلفة، ولا وعدَ تسويةٍ بلا كاتب (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  let whA: string;
  let whB: string;
  let branchId: string;
  const suffix = `${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const product = async (name: string, cost?: number) =>
    (await auth(http().post('/products')).send({ name: `${name} ${suffix}`, price: 100, ...(cost !== undefined ? { cost } : {}) }).expect(201)).body.id as string;
  const move = (body: Record<string, unknown>) => auth(http().post('/inventory/movements')).send({ date: today(), ...body });
  const layersOf = (productId: string, warehouseId: string): Promise<Layer[]> =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryLayer.findMany({ where: { productId, warehouseId }, orderBy: { createdAt: 'asc' } }));
  const consumptionsOf = (movementId: string): Promise<Consumption[]> =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryConsumption.findMany({ where: { movementId }, orderBy: { createdAt: 'asc' } }));
  const openProvisional = async (): Promise<Provisional[]> => (await auth(http().get('/inventory/provisional')).expect(200)).body;
  const num = (v: unknown) => Number(v);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'manual-costing');
    token = company.token;
    companyId = company.companyId;
    whA = (await auth(http().post('/warehouses')).send({ name: `مستودع أ ${suffix}` }).expect(201)).body.id;
    whB = (await auth(http().post('/warehouses')).send({ name: `مستودع ب ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع ${suffix}`, warehouseId: whA }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('① إدخالٌ يدويّ بلا تكلفةٍ مُدخَلة يُرفض مسمًّى — ومعها يُنشئ طبقةً بها؛ والصفرُ المُدخَل صراحةً مقبول', async () => {
    const p = await product('صنفٌ يدويّ', 0);
    const rejected = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10 }).expect(400);
    expect(String(rejected.body.message)).toContain('تكلفة الوحدة');
    expect(await layersOf(p, whA)).toEqual([]);

    const ok = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10, unitCost: 30 }).expect(201);
    const layers = await layersOf(p, whA);
    expect(layers).toHaveLength(1);
    expect(num(layers[0].qtyReceived)).toBe(10);
    expect(num(layers[0].qtyRemaining)).toBe(10);
    expect(num(layers[0].unitCost)).toBe(30);
    expect(layers[0].sourceType).toBe('ADJUSTMENT');
    expect(layers[0].sourceMovementId).toBe(ok.body.id);

    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 1, unitCost: 0 }).expect(201);
    expect((await layersOf(p, whA)).map((l) => num(l.unitCost))).toEqual([30, 0]);
  }, 60000);

  it('② إخراجٌ يدويّ يستهلك FIFO ويسجّل الاستهلاك — وما لا طبقةَ له مؤقّتٌ بآخر تكلفةٍ معروفة ويُقرأ في المفتوحة', async () => {
    const p = await product('صنفُ إخراج');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10, unitCost: 30, date: '2026-01-01' }).expect(201);
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 5, unitCost: 40, date: '2026-01-02' }).expect(201);

    const out = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 12 }).expect(201);
    const c1 = await consumptionsOf(out.body.id);
    expect(c1.map((c) => [num(c.qty), num(c.unitCost), c.layerId !== null])).toEqual([
      [10, 30, true],
      [2, 40, true],
    ]);
    expect((await layersOf(p, whA)).map((l) => num(l.qtyRemaining))).toEqual([0, 3]);

    const over = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 5 }).expect(201);
    expect(over.body.resultingQty).toBe(-2);
    const c2 = await consumptionsOf(over.body.id);
    expect(c2.map((c) => [num(c.qty), num(c.unitCost), c.layerId !== null])).toEqual([
      [3, 40, true],
      [2, 40, false],
    ]);
    const open = await openProvisional();
    expect(open.some((o) => o.movementId === over.body.id && num(o.qty) === 2 && num(o.unitCost) === 40)).toBe(true);
  }, 60000);

  it('③ التسويةُ الموجبة طبقةٌ بتكلفةٍ مُدخَلة أو تُرفض — والسالبةُ استهلاك', async () => {
    const p = await product('صنفُ تسوية');
    await move({ productId: p, warehouseId: whA, type: 'ADJUSTMENT', qty: 5 }).expect(400);
    await move({ productId: p, warehouseId: whA, type: 'ADJUSTMENT', qty: 5, unitCost: 20 }).expect(201);
    const minus = await move({ productId: p, warehouseId: whA, type: 'ADJUSTMENT', qty: -3 }).expect(201);
    expect((await consumptionsOf(minus.body.id)).map((c) => [num(c.qty), num(c.unitCost)])).toEqual([[3, 20]]);
    expect((await layersOf(p, whA)).map((l) => [l.sourceType, num(l.qtyRemaining)])).toEqual([['ADJUSTMENT', 2]]);
  }, 60000);

  it('④ التحويلُ ينقل الطبقةَ لا الكمّيةَ وحدَها — بتكلفتها وتاريخ اقتنائها إلى المقصِد، واستهلاكاً مسجَّلاً على المصدر', async () => {
    const p = await product('صنفُ تحويل');
    await move({ productId: p, warehouseId: whA, type: 'IN', qty: 10, unitCost: 12, date: '2026-01-05' }).expect(201);
    const tr = await move({ productId: p, warehouseId: whA, toWarehouseId: whB, type: 'TRANSFER', qty: 4 }).expect(201);
    expect(tr.body.resultingQty).toBe(6);

    const src = await layersOf(p, whA);
    expect(src.map((l) => num(l.qtyRemaining))).toEqual([6]);
    expect((await consumptionsOf(tr.body.id)).map((c) => [num(c.qty), num(c.unitCost), c.layerId])).toEqual([[4, 12, src[0].id]]);

    const dst = await layersOf(p, whB);
    expect(dst).toHaveLength(1);
    expect(num(dst[0].qtyReceived)).toBe(4);
    expect(num(dst[0].qtyRemaining)).toBe(4);
    expect(num(dst[0].unitCost)).toBe(12);
    expect(dst[0].sourceType).toBe('TRANSFER');
    expect(dst[0].sourceMovementId).toBe(tr.body.id);
    expect(dst[0].acquiredAt.toISOString()).toBe(src[0].acquiredAt.toISOString());
  }, 60000);

  it('⑤ الوعدُ يُنفَّذ: ما سبق استلامَه يُسوَّى عند وصول الاستلام — شراءً أو إدخالاً — بصفٍّ يشير إلى الأصل وفرقِ تكلفةٍ في الدفتر، ويخرج من المفتوحة', async () => {
    // الاستلامُ الحقيقيّ (شراء): البيعُ قبله بتكلفة البطاقة 7، والاستلامُ بـ9 ⇒ فرقٌ 2 × 3 = 6 مديناً على 5100
    const p = await product('صنفٌ يُستلم لاحقاً', 7);
    const out = await move({ productId: p, warehouseId: whA, type: 'OUT', qty: 3 }).expect(201);
    expect((await consumptionsOf(out.body.id)).map((c) => [num(c.qty), num(c.unitCost), c.layerId])).toEqual([[3, 7, null]]);
    expect((await openProvisional()).some((o) => o.movementId === out.body.id)).toBe(true);

    const supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد ${suffix}` }).expect(201)).body.id;
    await auth(http().post('/purchases'))
      .send({ supplierId, date: today(), subtotal: 90, warehouseId: whA, branchId, category: 'بضاعة', lines: [{ description: 'صنفٌ مخزني', productId: p, quantity: 10, unitPrice: 9, taxRate: 15 }] })
      .expect(201);

    const after = await consumptionsOf(out.body.id);
    expect(after).toHaveLength(2);
    const provisional = after.find((c) => c.layerId === null)!;
    const settlement = after.find((c) => c.layerId !== null)!;
    expect(settlement.settlesId).toBe(provisional.id);
    expect([num(settlement.qty), num(settlement.unitCost)]).toEqual([3, 9]);
    expect((await layersOf(p, whA)).map((l) => [l.sourceType, num(l.qtyRemaining)])).toEqual([['GOODS_RECEIPT', 7]]);
    expect((await openProvisional()).some((o) => o.movementId === out.body.id)).toBe(false);

    const entry = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findFirst({ where: { memo: { contains: 'تسوية استهلاكٍ مؤقّت' } }, orderBy: { createdAt: 'desc' }, include: { lines: { include: { account: true } } } }),
    );
    expect(entry).not.toBeNull();
    const byCode = Object.fromEntries(entry!.lines.map((l) => [l.account.code, [num(l.debit), num(l.credit)]]));
    expect(byCode['5100']).toEqual([6, 0]);
    expect(byCode['1300']).toEqual([0, 6]);

    // والإدخالُ اليدويّ يُسوّي أيضاً — وبالاتجاه المقابل حين تكون التكلفةُ الحقيقية أقلّ: 2 × (4 − 5) = −2
    const q = await product('صنفٌ يُدخَل لاحقاً', 5);
    const out2 = await move({ productId: q, warehouseId: whB, type: 'OUT', qty: 2 }).expect(201);
    await move({ productId: q, warehouseId: whB, type: 'IN', qty: 4, unitCost: 4 }).expect(201);
    const after2 = await consumptionsOf(out2.body.id);
    expect(after2.map((c) => [num(c.qty), num(c.unitCost), c.layerId !== null])).toEqual([
      [2, 5, false],
      [2, 4, true],
    ]);
    const entry2 = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findFirst({ where: { memo: { contains: 'تسوية استهلاكٍ مؤقّت' } }, orderBy: { createdAt: 'desc' }, include: { lines: { include: { account: true } } } }),
    );
    const byCode2 = Object.fromEntries(entry2!.lines.map((l) => [l.account.code, [num(l.debit), num(l.credit)]]));
    expect(byCode2['1300']).toEqual([2, 0]);
    expect(byCode2['5100']).toEqual([0, 2]);
  }, 90000);

  it('⑥ حارسُ الانحراف: لكلِّ (صنف · مستودع) في المنشأة — Σ المتبقّي في الطبقات − Σ المؤقّت المفتوح = رصيدُ الحركات', async () => {
    const { qty, layers, open } = await tenantPrisma.runInTenantContext(companyId, async (tx) => ({
      qty: await computeStockQuantities(tx),
      layers: await tx.inventoryLayer.findMany({ select: { productId: true, warehouseId: true, qtyRemaining: true } }),
      open: await tx.inventoryConsumption.findMany({
        where: { layerId: null, settledBy: { is: null } },
        select: { qty: true, movement: { select: { productId: true, warehouseId: true } } },
      }),
    }));
    const remaining = new Map<string, number>();
    for (const l of layers) {
      const k = stockQuantityKey(l.productId, l.warehouseId);
      remaining.set(k, (remaining.get(k) ?? 0) + num(l.qtyRemaining));
    }
    const openQty = new Map<string, number>();
    for (const c of open) {
      const k = stockQuantityKey(c.movement.productId, c.movement.warehouseId);
      openQty.set(k, (openQty.get(k) ?? 0) + num(c.qty));
    }
    const keys = new Set<string>([...qty.keys(), ...remaining.keys(), ...openQty.keys()]);
    expect(keys.size).toBeGreaterThan(5);
    const drift = [...keys]
      .map((k) => ({ k, layers: remaining.get(k) ?? 0, open: openQty.get(k) ?? 0, movements: qty.get(k) ?? 0 }))
      .filter((r) => Math.abs(r.layers - r.open - r.movements) > 0.0005);
    expect(drift).toEqual([]);
  }, 60000);
});
