import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Prisma } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **٥+٦ الدفعةُ كياناً على الطبقة و`FEFO` سياسةً تُقرأ** (`ق-١٠٨٦` · 2026-09-18) — بأحكام المالك:
 *   ① العلَمُ ثنائيٌّ يُعلَن ولا يُخمَّن (`ق-١٠٨١`): صنفٌ جديد بلا إعلانٍ يُرفض باسمه؛ والقائمُ `null` يُعدّ ويُعلَن عند لمسه.
 *   ② الاستلامُ يحمل الدفعةَ كياناً: لصنفٍ معلَنٍ تتبّعُه بلا دفعة يُردّ مسمًّى **بلا كتابة** (الحكمُ للمالك — الموجز `§٤/٤`)؛
 *      ورقمٌ بلا انتهاءٍ يُردّ؛ ومع الدفعة تُنشأ وتُربط بها الطبقة.
 *   ③ الرقمُ نفسُه بالانتهاء نفسِه دفعةٌ واحدة تُعاد؛ وبانتهاءٍ آخر يُردّ مسمًّى **بلا كتابة** (الحكمُ للمالك — `§٤/٣`).
 *   ④ الصرفُ سياسةٌ تُقرأ من البطاقة (`ق-١٠٧٦`/٢): المعلَنُ بالأقرب انتهاءً، وغيرُه بالأقدم كما كان.
 *   ⑤ المنتهيةُ تُرفض **في البيع وحدَه** مسمّاةً (`ق-١٠٨٢`)؛ والشطبُ والإعادةُ إلى المورّد يمرّان منها — وهما المخرج.
 *      ونقصٌ بلا منتهٍ على الرفّ يبقى بيعاً سبق استلامَه (مؤقّت) لا رفضاً.
 *   ⑥ تقريرُ قرب الانتهاء بالمتبقّي من الطبقات (`ق-١٠٨٠`)، والحركاتُ القديمة بدفعةٍ نصّاً تبقى وتُعدّ موسومة؛ ومعه
 *      الحدودُ الثلاثة المعلَنة في وجهه (`ق-١٠٨٥`).
 *   ⑦ التحويلُ ينقل الدفعةَ مع الطبقة.
 * منشأةٌ معزولة تُزال في الختام.
 */
// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (43.0 ث) — رُفعت من ٦٠ ث بعد القياس.
jest.setTimeout(130000);

describe('٥+٦ الدفعةُ كياناً على الطبقة وFEFO سياسةً تُقرأ (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  let supplierId: string;
  let customerId: string;
  let whA: string;
  let whB: string;
  let branchId: string;
  let legacyId: string;
  const suffix = `${Date.now()}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const iso = (days: number) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const product = async (name: string, expiryTracked: boolean) =>
    (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked, taxCategory: 'S', name: `${name} ${suffix}`, price: 100 }).expect(201)).body.id as string;
  const purchase = (
    lines: { productId: string; quantity: number; unitPrice: number; batchNo?: string; expiryDate?: string }[],
    date = iso(0),
  ) =>
    auth(http().post('/purchases')).send({
      supplierId,
      date,
      subtotal: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      warehouseId: whA,
      branchId,
      lines: lines.map((l) => ({ description: 'صنفٌ مخزني', taxRate: 15, ...l })),
    });
  const sale = (productId: string, quantity: number) =>
    auth(http().post('/invoices')).send({ customerId, branchId, issueDate: iso(0), dueDate: iso(0), lines: [{ description: 'بيع', productId, quantity, unitPrice: 150, taxRate: 15 }] });
  // ق-١٣٧٧: السببُ إلزاميٌّ للحركة اليدوية — افتراضُ الاختبار، ويُطغى عليه بالجسم.
  const move = (body: Record<string, unknown>) => auth(http().post('/inventory/movements')).send({ date: iso(0), reason: 'اختبار — حركةٌ يدوية', ...body });
  const layersOf = (productId: string, warehouseId = whA) =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryLayer.findMany({ where: { productId, warehouseId }, orderBy: { createdAt: 'asc' }, include: { batch: true } }));
  const batchesOf = (productId: string) => tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockBatch.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } }));
  const lastSaleConsumptions = (productId: string) =>
    tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const m = await tx.stockMovement.findFirstOrThrow({ where: { productId, type: 'OUT', origin: 'SALE' }, orderBy: { createdAt: 'desc' } });
      return tx.inventoryConsumption.findMany({ where: { movementId: m.id }, orderBy: { createdAt: 'asc' } });
    });
  const outMovements = (productId: string) => tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.count({ where: { productId, type: 'OUT' } }));
  const num = (v: unknown) => Number(v);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'batch-fefo');
    token = company.token;
    companyId = company.companyId;
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد الدفعات ${suffix}` }).expect(201)).body.id;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الدفعات ${suffix}` }).expect(201)).body.id;
    whA = (await auth(http().post('/warehouses')).send({ name: `مستودع أ ${suffix}` }).expect(201)).body.id;
    whB = (await auth(http().post('/warehouses')).send({ name: `مستودع ب ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع الدفعات ${suffix}`, warehouseId: whA }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app?.close();
  }, 120000);

  it('① العلَمُ ثنائيٌّ يُعلَن ولا يُخمَّن — الجديدُ بلا إعلانٍ يُرفض باسمه، والقائمُ `null` يُعدّ ويُعلَن عند لمسه', async () => {
    const missing = await auth(http().post('/products')).send({ unitCode: 'H87', name: `بلا إعلان ${suffix}`, price: 10 }).expect(400);
    expect(String(missing.body.message)).toContain('إعلانُ التتبّع');
    // نصٌّ بدل القيمة الثنائية يُردّ عند الباب — لا يُفسَّر «نعم».
    await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: 'yes', name: `نصّ ${suffix}`, price: 10 }).expect(400);
    const tracked = await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: true, taxCategory: 'S', name: `دواء ${suffix}`, price: 10 }).expect(201);
    expect(tracked.body.expiryTracked).toBe(true);

    legacyId = (
      await tenantPrisma.runInTenantContext(companyId, (tx) =>
        // ⑧ صفٌّ كما تركته الهجرة: فئةٌ قديمة بتاريخٍ يسبق لحظتَها — فقيدُ `CHECK` يقبلها لما سبق وحدَه.
        tx.product.create({ data: { companyId, name: `صنفٌ قديم ${suffix}`, unitCode: 'H87', price: 25, cost: 0, taxCategory: 'LEGACY_STANDARD', createdAt: new Date('2000-01-01T00:00:00Z') } as unknown as Prisma.ProductUncheckedCreateInput }),
      )
    ).id;
    const list = (await auth(http().get('/products')).expect(200)).body as { id: string; expiryTracked: boolean | null }[];
    expect(list.find((p) => p.id === legacyId)?.expiryTracked).toBeNull();
    expect(list.filter((p) => p.expiryTracked === null)).toHaveLength(1);
    const declared = await auth(http().patch(`/products/${legacyId}`)).send({ expiryTracked: false }).expect(200);
    expect(declared.body.expiryTracked).toBe(false);
  });

  it('② الاستلامُ يحمل الدفعةَ كياناً — والمعلَنُ بلا دفعةٍ يُردّ مسمًّى بلا كتابة (الحكمُ للمالك)، ورقمٌ بلا انتهاءٍ يُردّ', async () => {
    const p = await product('معلَنٌ تتبّعُه', true);
    const noBatch = await purchase([{ productId: p, quantity: 5, unitPrice: 10 }]).expect(400);
    expect(String(noBatch.body.message)).toContain('لا يُستلم بلا رقم دفعةٍ');
    expect(await tenantPrisma.runInTenantContext(companyId, (tx) => tx.purchase.count({ where: { lines: { some: { productId: p } } } }))).toBe(0);
    expect(await layersOf(p)).toEqual([]);

    const manualNoBatch = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 5, unitCost: 10 }).expect(400);
    expect(String(manualNoBatch.body.message)).toContain('لا يُستلم بلا رقم دفعةٍ');
    const noExpiry = await move({ productId: p, warehouseId: whA, type: 'IN', qty: 5, unitCost: 10, batchNo: `L-${suffix}` }).expect(400);
    expect(String(noExpiry.body.message)).toContain('بانتهائها');
    expect(await batchesOf(p)).toEqual([]);

    const ok = await purchase([{ productId: p, quantity: 5, unitPrice: 10, batchNo: `L-${suffix}`, expiryDate: iso(120) }]).expect(201);
    expect(ok.body.lines[0].batchNo).toBe(`L-${suffix}`);
    const batches = await batchesOf(p);
    expect(batches).toHaveLength(1);
    expect(batches[0].batchNo).toBe(`L-${suffix}`);
    expect(batches[0].expiryDate.toISOString().slice(0, 10)).toBe(iso(120));
    const layers = await layersOf(p);
    expect(layers).toHaveLength(1);
    expect(layers[0].batchId).toBe(batches[0].id);
    const movement = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.findFirstOrThrow({ where: { productId: p, type: 'IN' } }));
    expect(movement.batchNo).toBe(`L-${suffix}`);

    // غيرُ المعلَن يُستلم بلا دفعةٍ كما كان — طبقةٌ بلا دفعة، لا رفض ولا تخمين.
    const u = await product('غيرُ معلَن', false);
    await purchase([{ productId: u, quantity: 5, unitPrice: 10 }]).expect(201);
    expect((await layersOf(u))[0].batchId).toBeNull();
  });

  it('③ الرقمُ نفسُه بالانتهاء نفسِه دفعةٌ تُعاد؛ وبانتهاءٍ آخر يُردّ مسمًّى بلا كتابة — الحكمُ للمالك', async () => {
    const p = await product('دفعةٌ تُعاد', true);
    await purchase([{ productId: p, quantity: 4, unitPrice: 10, batchNo: `R-${suffix}`, expiryDate: iso(90) }]).expect(201);
    await purchase([{ productId: p, quantity: 6, unitPrice: 11, batchNo: `R-${suffix}`, expiryDate: iso(90) }]).expect(201);
    const batches = await batchesOf(p);
    expect(batches).toHaveLength(1);
    const layers = await layersOf(p);
    expect(layers.map((l) => l.batchId)).toEqual([batches[0].id, batches[0].id]);

    const conflict = await purchase([{ productId: p, quantity: 1, unitPrice: 10, batchNo: `R-${suffix}`, expiryDate: iso(91) }]).expect(409);
    expect(String(conflict.body.message)).toContain('الدفعةُ هويّةٌ');
    expect(await batchesOf(p)).toHaveLength(1);
    expect(await layersOf(p)).toHaveLength(2);

    // ⚖️ والمفتاحُ محسومٌ في القاعدة نفسِها (ق-١٠٩٠): صنفٌ ورقمٌ — فإدراجٌ خامٌ للرقم نفسِه بانتهاءٍ آخر يُرفض من القيد لا من الشيفرة.
    await expect(
      tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockBatch.create({ data: { companyId, productId: p, batchNo: `R-${suffix}`, expiryDate: new Date(iso(92)) } })),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await batchesOf(p)).toHaveLength(1);
  });

  it('④ الصرفُ سياسةٌ تُقرأ من البطاقة: المعلَنُ بالأقرب انتهاءً، وغيرُ المعلَن بالأقدم كما كان', async () => {
    const t = await product('FEFO', true);
    await purchase([{ productId: t, quantity: 5, unitPrice: 10, batchNo: `A-${suffix}`, expiryDate: iso(300) }], iso(-10)).expect(201);
    await purchase([{ productId: t, quantity: 5, unitPrice: 20, batchNo: `B-${suffix}`, expiryDate: iso(30) }], iso(0)).expect(201);
    const [layerA, layerB] = await layersOf(t);
    expect(layerA.batch?.batchNo).toBe(`A-${suffix}`);
    const soldT = await sale(t, 3).expect(201);
    // ② التكلفةُ تصل نصّاً بخانتين والكمّيةُ بثلاث (`ق-١٢٣٥`) — تُقارَن حرفاً.
    expect(soldT.body.stockFulfilment.totalCost).toBe('60.00');
    const consT = await lastSaleConsumptions(t);
    expect(consT).toHaveLength(1);
    expect(consT[0].layerId).toBe(layerB.id);

    const u = await product('FIFO', false);
    await purchase([{ productId: u, quantity: 5, unitPrice: 10, batchNo: `A-${suffix}`, expiryDate: iso(300) }], iso(-10)).expect(201);
    await purchase([{ productId: u, quantity: 5, unitPrice: 20, batchNo: `B-${suffix}`, expiryDate: iso(30) }], iso(0)).expect(201);
    const [layerUA] = await layersOf(u);
    const soldU = await sale(u, 3).expect(201);
    expect(soldU.body.stockFulfilment.totalCost).toBe('30.00');
    const consU = await lastSaleConsumptions(u);
    expect(consU).toHaveLength(1);
    expect(consU[0].layerId).toBe(layerUA.id);
  });

  it('⑤ المنتهيةُ تُرفض في البيع وحدَه مسمّاةً — والشطبُ والإعادةُ إلى المورّد يمرّان؛ ونقصٌ بلا منتهٍ يبقى مؤقّتاً', async () => {
    const e = await product('منتهٍ على الرفّ', true);
    const expiredPurchase = await purchase([{ productId: e, quantity: 10, unitPrice: 10, batchNo: `X-${suffix}`, expiryDate: iso(-5) }], iso(-30)).expect(201);
    await purchase([{ productId: e, quantity: 3, unitPrice: 10, batchNo: `Y-${suffix}`, expiryDate: iso(60) }]).expect(201);
    const [layerX, layerY] = await layersOf(e);

    const refused = await sale(e, 5).expect(409);
    expect(String(refused.body.message)).toContain('لا يُباع من دفعةٍ منتهية');
    expect(await outMovements(e)).toBe(0);

    const ok = await sale(e, 3).expect(201);
    expect(ok.body.stockFulfilment.provisionalQty).toBe('0.000');
    expect((await lastSaleConsumptions(e))[0].layerId).toBe(layerY.id);
    const again = await sale(e, 1).expect(409);
    expect(String(again.body.message)).toContain('لا يُباع من دفعةٍ منتهية');
    expect(num((await layersOf(e))[0].qtyRemaining)).toBe(10);

    // الشطبُ يمرّ — بل يبدأ بالمنتهي.
    const wo = await auth(http().post('/inventory/write-offs')).send({ productId: e, warehouseId: whA, qty: 4, reasonCode: 'DAMAGE', occurredAt: iso(0), branchId }).expect(201);
    await auth(http().post(`/inventory/write-offs/${wo.body.id}/approve`)).send({}).expect(201);
    expect(num((await layersOf(e))[0].qtyRemaining)).toBe(6);
    expect(await tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryConsumption.count({ where: { layerId: layerX.id } }))).toBe(1);

    // الإعادةُ إلى المورّد تمرّ — من طبقة الاستلام الأصلية.
    const lineId = expiredPurchase.body.lines[0].id as string;
    await auth(http().post(`/purchases/${expiredPurchase.body.id}/supplier-credit-note`))
      .send({ reason: 'دفعةٌ منتهية تُعاد', lines: [{ description: 'إعادة', productId: e, quantity: 6, unitPrice: 10, taxRate: 15, returnsPurchaseLineId: lineId, goodsReturned: true }] })
      .expect(201);
    expect(num((await layersOf(e))[0].qtyRemaining)).toBe(0);

    // نقصٌ بلا منتهٍ على الرفّ: بيعٌ سبق استلامَه — مؤقّتٌ كما كان، لا رفض. (صنفٌ بلا حركةٍ قطّ ليس مخزنياً
    // أصلاً فلا يُخصم — قاعدةُ التسليم القائمة؛ فيُستلم منه واحدٌ ثم يُباع ثلاثة.)
    const p = await product('نقصٌ بلا منتهٍ', true);
    await purchase([{ productId: p, quantity: 1, unitPrice: 10, batchNo: `Z-${suffix}`, expiryDate: iso(60) }]).expect(201);
    const provisional = await sale(p, 3).expect(201);
    expect(provisional.body.stockFulfilment.fulfilled).toBe(true);
    expect(provisional.body.stockFulfilment.provisionalQty).toBe('2.000');
  });

  it('⑥ قربُ الانتهاء بالمتبقّي من الطبقات — والقديمةُ نصّاً تبقى وتُعدّ موسومة؛ والحدودُ الثلاثة في وجهه', async () => {
    const r = await product('تقرير', true);
    await purchase([{ productId: r, quantity: 10, unitPrice: 10, batchNo: `H-${suffix}`, expiryDate: iso(20) }]).expect(201);
    await sale(r, 4).expect(201);
    // حركةُ إدخالٍ قديمة بدفعةٍ نصّاً وبلا طبقة — كما تركتها الأيام قبل البناء.
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.stockMovement.create({
        // ق-١٣٧٧: الحركةُ اليدويةُ بعد لحظة الهجرة لا تُكتب بلا سبب ولو مباشرةً (قيدُ القاعدة) — والسببُ لا يمسّ ما يُختبَر هنا.
        data: { companyId, productId: r, warehouseId: whA, type: 'IN', origin: 'MANUAL', reason: 'اختبار — دفعةٌ قديمة نصّاً', qty: 7, date: new Date(iso(-40)), batchNo: `OLD-${suffix}`, expiryDate: new Date(iso(10)) } as unknown as Prisma.StockMovementUncheckedCreateInput,
      }),
    );
    const res = await auth(http().get('/inventory/expiring')).query({ withinDays: 90 }).expect(200);
    expect(res.body.declaredLimits).toHaveLength(4);
    expect(String(res.body.declaredLimits[0])).toContain('حدٌّ معلَن ①');
    const rows = (res.body.rows as { batchNo: string; source: string; qty: number; qtyKind: string; expired: boolean }[]).filter((x) => x.batchNo.endsWith(suffix));
    const h = rows.find((x) => x.batchNo === `H-${suffix}`)!;
    expect(h).toMatchObject({ source: 'BATCH', qty: 6, qtyKind: 'REMAINING', expired: false });
    const old = rows.find((x) => x.batchNo === `OLD-${suffix}`)!;
    expect(old).toMatchObject({ source: 'LEGACY_MOVEMENT', qty: 7, qtyKind: 'RECEIVED' });
    // ما نفد لا يظهر — الدفعةُ المنتهية X أُعيدت كلُّها.
    expect(rows.find((x) => x.batchNo === `X-${suffix}`)).toBeUndefined();
    // الأقربُ انتهاءً أوّلاً.
    expect(rows.map((x) => x.batchNo).indexOf(`OLD-${suffix}`)).toBeLessThan(rows.map((x) => x.batchNo).indexOf(`H-${suffix}`));
  });

  it('⑦ التحويلُ ينقل الدفعةَ مع الطبقة', async () => {
    const r = await product('تحويل', true);
    await purchase([{ productId: r, quantity: 10, unitPrice: 10, batchNo: `T-${suffix}`, expiryDate: iso(45) }]).expect(201);
    const [source] = await layersOf(r);
    await move({ productId: r, warehouseId: whA, toWarehouseId: whB, type: 'TRANSFER', qty: 2 }).expect(201);
    const dest = await layersOf(r, whB);
    expect(dest).toHaveLength(1);
    expect(dest[0].batchId).toBe(source.batchId);
    expect(num(dest[0].qtyRemaining)).toBe(2);
    const res = await auth(http().get('/inventory/expiring')).query({ withinDays: 90 }).expect(200);
    const mine = (res.body.rows as { batchNo: string; warehouseName: string; qty: number }[]).filter((x) => x.batchNo === `T-${suffix}`);
    expect(mine.map((x) => x.qty).sort((a, b) => a - b)).toEqual([2, 8]);
  });

  it('⑧ عكسُ الإدخال اليدويّ يُقفل طبقتَه هي بدفعتها — والدفعةُ الأخرى لا تُمسّ (ق-١١٠٠)', async () => {
    const r = await product('عكس', true);
    await move({ productId: r, warehouseId: whA, type: 'IN', qty: 5, unitCost: 10, batchNo: `K1-${suffix}`, expiryDate: iso(30) }).expect(201);
    const second = await move({ productId: r, warehouseId: whA, type: 'IN', qty: 3, unitCost: 12, batchNo: `K2-${suffix}`, expiryDate: iso(60) }).expect(201);
    const before = await layersOf(r);
    expect(before.map((l) => [l.batch?.batchNo, num(l.qtyRemaining)])).toEqual([[`K1-${suffix}`, 5], [`K2-${suffix}`, 3]]);

    await auth(http().post(`/inventory/movements/${second.body.id}/reverse`)).send({}).expect(201);
    const after = await layersOf(r);
    // الطبقةُ الثانية أُقفلت هي بعينها وبقيت على دفعتها؛ والأولى — الأقربُ انتهاءً، والتي كان FEFO سيأخذ منها — لم تُمسّ.
    expect(after.map((l) => [l.batch?.batchNo, num(l.qtyRemaining)])).toEqual([[`K1-${suffix}`, 5], [`K2-${suffix}`, 0]]);
    expect(after[1].batchId).toBe(before[1].batchId);
    const closing = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryConsumption.findMany({ where: { layerId: before[1].id } }));
    expect(closing).toHaveLength(1);
    expect(num(closing[0].qty)).toBe(3);
  });

  it('⑨ تحت FEFO ما لا انتهاءَ له يُصرَف بعد ما له انتهاء (ق-١١٠٢) — والرصيدُ بالدفعة يقرأ المتبقّي ويسمّي ما لا دفعةَ له (ق-١٠٩٩)', async () => {
    const r = await product('مجهولُ الانتهاء', true);
    // طبقةٌ بلا دفعة أقدمُ من الدفعة — كما تركتها الأيام قبل الإعلان: تُكتب مباشرةً لأن المسارَ يرفض استلامَ المعلَن بلا دفعة.
    const legacyMovement = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.stockMovement.create({
        // ق-١٣٧٧: الحركةُ اليدويةُ بعد لحظة الهجرة لا تُكتب بلا سبب ولو مباشرةً (قيدُ القاعدة).
        data: { companyId, productId: r, warehouseId: whA, type: 'IN', origin: 'MANUAL', reason: 'اختبار — طبقةٌ بلا دفعة', qty: 4, date: new Date(iso(-30)) } as unknown as Prisma.StockMovementUncheckedCreateInput,
        select: { id: true },
      }),
    );
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.inventoryLayer.create({
        data: { companyId, productId: r, warehouseId: whA, qtyReceived: 4, qtyRemaining: 4, unitCost: 5, acquiredAt: new Date(iso(-30)), sourceType: 'ADJUSTMENT', sourceMovementId: legacyMovement.id, batchId: null },
      }),
    );
    await purchase([{ productId: r, quantity: 6, unitPrice: 10, batchNo: `N-${suffix}`, expiryDate: iso(40) }]).expect(201);

    const balances = await auth(http().get('/inventory/batch-balances')).query({ productId: r }).expect(200);
    expect(balances.body.declaredLimits).toHaveLength(4);
    expect(balances.body.noBatchRows).toBe(1);
    const mine = balances.body.rows as { batchNo: string | null; qty: number; expiryDate: string | null; daysLeft: number | null; layers: number }[];
    expect(mine).toHaveLength(2);
    // الدفعةُ أوّلاً وما لا دفعةَ له بعدها — كترتيب الصرف.
    expect(mine[0]).toMatchObject({ batchNo: `N-${suffix}`, qty: 6, expiryDate: iso(40), layers: 1 });
    expect(mine[1]).toMatchObject({ batchNo: null, qty: 4, expiryDate: null, daysLeft: null });

    // البيعُ يأخذ من الدفعة (الأحدثِ اقتناءً) لا من الطبقة الأقدم مجهولةِ الانتهاء.
    const sold = await sale(r, 5).expect(201);
    expect(sold.body.stockFulfilment.totalCost).toBe('50.00');
    const cons = await lastSaleConsumptions(r);
    expect(cons).toHaveLength(1);
    const batchLayer = (await layersOf(r)).find((l) => l.batch?.batchNo === `N-${suffix}`)!;
    expect(cons[0].layerId).toBe(batchLayer.id);

    const afterSale = (await auth(http().get('/inventory/batch-balances')).query({ productId: r }).expect(200)).body.rows as { batchNo: string | null; qty: number }[];
    expect(afterSale.map((x) => [x.batchNo, x.qty])).toEqual([[`N-${suffix}`, 1], [null, 4]]);
  });
});
