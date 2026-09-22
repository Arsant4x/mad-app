import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (34.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(105000);

/**
 * ٣٠ **الأرصدةُ الافتتاحية بالطبقات** (`ق-١١٧٧` · `ق-١١٧٨` · `ق-١١٧٩`) — الحارسُ الحيّ يقرأ **الرفَّ والدفترَ معاً** في كلِّ مرحلة:
 *
 *   ① الإعلان: سطران (غيرُ متتبَّع · متتبَّعٌ بدفعة) ⟵ رقمُ `SO`، حركتا `IN`/`OPENING`، طبقتا `OPENING` **بتاريخ الاقتناء لا تاريخ
 *     الإعلان**، قيدٌ واحد مدين `1300` / دائن `3900` بتاريخ الافتتاح، ختمُ المُعلِن، و«بلا سند» معلَناً.
 *   ② `FIFO`: استلامٌ لاحق أغلى، ثم إخراجٌ يفوق الافتتاح — يُستهلك الافتتاحُ أوّلاً بتكلفته ثم الاستلام.
 *   ③ المؤقّت: بيعٌ سبق الإعلان (استهلاكٌ بلا طبقة) يُسوّيه الافتتاحُ بالكاتب القائم وقيدِ فرقٍ بتاريخ اليوم (`ق-١٠٧٢/①`).
 *   ④ الحدودُ المسمّاة: متتبَّعٌ بلا دفعة (ولا يُكتب شيء) · اقتناءٌ بعد الافتتاح · تاريخُ افتتاحٍ ثانٍ · صنفٌ تحرّك قبل الافتتاح.
 *   ⑤ مصدرٌ واحد: `openingBalance` على `1300` من شاشة الحسابات يُرفض (`ق-١١٧٧/②`).
 *   ⑥ قفلُ الفترة شرطٌ لا تفصيل: فترةُ الافتتاح مقفلة ⟵ يُرفض ولا يبقى رأسٌ ولا حركة.
 *   ⑦ الإلغاءُ عكسٌ لا محو: سطرٌ لم يُستهلَك يُعكس (حركةٌ وقيد)، والمستهلَكُ يُرفض، والمُلغى لا يُلغى ثانيةً، ومسارُ عكس الحركات
 *     العامّ لا يمسّ حركةَ الافتتاح؛ والعزلُ: منشأةٌ أخرى لا ترى الإعلان.
 *   ⑧ القائم: كتلةُ العدّ في الهجرة تُعاد على الحقيقة في معاملةٍ تُرجَع، والتقريرُ يعدّ طبقاتِ التسوية خارج المجموع ولا يحوّلها.
 */
describe('الأرصدةُ الافتتاحية بالطبقات — إعلانٌ مختومٌ بتاريخ اقتناءٍ وقيدٍ واحد (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  let other: IsolatedCompany | undefined;
  let lockCompany: IsolatedCompany | undefined;
  let token: string;
  let companyId: string;
  let warehouseId: string;
  let supplierId: string;
  let plainProductId: string;
  let trackedProductId: string;
  let provisionalProductId: string;
  let movedProductId: string;
  let openingId: string;
  let openingNo: string;
  let plainLineId: string;
  let trackedLineId: string;
  let plainMovementId: string;

  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  const auth = (r: request.Test, t = token) => r.set('Authorization', `Bearer ${t}`);
  const get = (path: string, t?: string) => auth(request(app.getHttpServer()).get(path), t);
  const post = (path: string, t?: string) => auth(request(app.getHttpServer()).post(path), t);
  const patch = (path: string, t?: string) => auth(request(app.getHttpServer()).patch(path), t);

  async function ledger(t = token): Promise<Record<string, number>> {
    const res = await get('/accounts', t).expect(200);
    return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
  }
  const delta = (after: Record<string, number>, before: Record<string, number>, code: string) => Number(((after[code] ?? 0) - (before[code] ?? 0)).toFixed(2));

  async function layersOf(pid: string) {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layers = await tx.inventoryLayer.findMany({ where: { productId: pid }, orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }] });
      return layers.map((l) => ({ source: l.sourceType, received: Number(l.qtyReceived), remaining: Number(l.qtyRemaining), unitCost: Number(l.unitCost), acquiredAt: l.acquiredAt.toISOString().slice(0, 10), batch: l.batchId !== null }));
    });
  }

  async function stockQty(pid: string): Promise<number> {
    const res = await get('/inventory/stock-levels').expect(200);
    const row = (res.body as { productId: string; warehouseId: string; qty: number }[]).find((r) => r.productId === pid && r.warehouseId === warehouseId);
    return row?.qty ?? 0;
  }

  async function entriesNamed(fragment: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.journalEntry.findMany({ where: { memo: { contains: fragment } }, include: { lines: { include: { account: { select: { code: true } } } } }, orderBy: { createdAt: 'asc' } }),
    );
  }

  function line(overrides: Record<string, unknown>) {
    return { productId: plainProductId, warehouseId, qty: 10, unitCost: 4, acquiredAt: daysAgo(20), ...overrides };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'opening-stock');
    token = company.token;
    companyId = company.companyId;
    other = await registerIsolatedCompany(app, 'opening-stock-other');

    const suffix = Date.now();
    warehouseId = (await post('/warehouses').send({ name: `مستودع افتتاح ${suffix}` }).expect(201)).body.id;
    supplierId = (await post('/suppliers').send({ name: `مورّد افتتاح ${suffix}` }).expect(201)).body.id;
    plainProductId = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف افتتاح ${suffix}`, price: 10, cost: 4 }).expect(201)).body.id;
    trackedProductId = (await post('/products').send({ unitCode: 'H87', expiryTracked: true, taxCategory: 'S', name: `دواء افتتاح ${suffix}`, price: 9, cost: 2.5 }).expect(201)).body.id;
    provisionalProductId = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف مؤقّت ${suffix}`, price: 20, cost: 7 }).expect(201)).body.id;
    movedProductId = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف متحرّك ${suffix}`, price: 5, cost: 1 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await removeIsolatedCompany(app, lockCompany);
    await app.close();
  });

  it('[SPEC 8.14] ① الإعلان: طبقاتٌ بتاريخ الاقتناء لا الإعلان، وقيدٌ واحد 1300/3900 بتاريخ الافتتاح، مختومٌ بمن أعلن، و«بلا سند» معلَناً', async () => {
    const before = await ledger();
    const res = await post('/inventory/opening')
      .send({
        openingDate: today(),
        notes: 'رصيدُ الدخول',
        lines: [
          line({ evidenceRef: 'فاتورة المورّد 771' }),
          { productId: trackedProductId, warehouseId, qty: 5, unitCost: 2.5, acquiredAt: daysAgo(3), batchNo: 'B-OPEN-1', expiryDate: daysAhead(200) },
        ],
      })
      .expect(201);
    openingId = res.body.id;
    openingNo = res.body.no;
    expect(openingNo).toMatch(/^SO-\d{4}-\d{4}$/);
    expect(res.body.openingDate).toBe(today());
    expect(res.body.declaredById).toBeTruthy();
    expect(res.body.declaredByType).toBe('COMPANY');
    expect(res.body.declaredByName).toBe(company!.username);
    expect(res.body.baseAmount).toBe(52.5);
    expect(res.body.journalEntryId).toBeTruthy();
    expect(res.body.provisionalSettled).toBe(0);
    expect(res.body.lines).toHaveLength(2);
    const [plain, tracked] = res.body.lines as { id: string; movementId: string; withoutEvidence: boolean; baseAmount: number; acquiredAt: string }[];
    plainLineId = plain.id;
    trackedLineId = tracked.id;
    plainMovementId = plain.movementId;
    expect(plain.withoutEvidence).toBe(false);
    expect(tracked.withoutEvidence).toBe(true);
    expect(plain.baseAmount).toBe(40);
    expect(tracked.baseAmount).toBe(12.5);

    // الرفّ: الطبقةُ بمصدر OPENING وبتاريخ الاقتناء المُعلَن — لا بتاريخ الإعلان — والمتتبَّعُ بدفعته.
    expect(await layersOf(plainProductId)).toEqual([{ source: 'OPENING', received: 10, remaining: 10, unitCost: 4, acquiredAt: daysAgo(20), batch: false }]);
    expect(await layersOf(trackedProductId)).toEqual([{ source: 'OPENING', received: 5, remaining: 5, unitCost: 2.5, acquiredAt: daysAgo(3), batch: true }]);
    expect(await stockQty(plainProductId)).toBe(10);
    expect(await stockQty(trackedProductId)).toBe(5);

    // الحركاتُ: IN بمصدر OPENING بتاريخ الافتتاح.
    const movement = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.findUniqueOrThrow({ where: { id: plainMovementId } }));
    expect(movement.type).toBe('IN');
    expect(movement.origin).toBe('OPENING');
    expect(movement.date.toISOString().slice(0, 10)).toBe(today());

    // الدفتر: قيدٌ واحد للإعلان — مدين 1300 بالمجموع، دائن 3900 — بتاريخ الافتتاح.
    const entries = await entriesNamed(`مخزون ${openingNo}`);
    expect(entries).toHaveLength(1);
    expect(entries[0].date.toISOString().slice(0, 10)).toBe(today());
    expect(entries[0].auto).toBe(true);
    const byCode = Object.fromEntries(entries[0].lines.map((l) => [l.account.code, { debit: Number(l.debit), credit: Number(l.credit) }]));
    expect(byCode['1300']).toEqual({ debit: 52.5, credit: 0 });
    expect(byCode['3900']).toEqual({ debit: 0, credit: 52.5 });
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(52.5);
    expect(delta(after, before, '3900')).toBe(52.5);

    // التقرير: الإعلانُ بسطوره، والمجموعُ وما بلا سند.
    const report = await get('/inventory/opening').expect(200);
    expect(report.body.openingDate).toBe(today());
    expect(report.body.items).toHaveLength(1);
    expect(report.body.totals).toEqual({ lines: 2, baseAmount: 52.5, withoutEvidence: 1 });
  });

  it('[SPEC 8.14] ② FIFO: استلامٌ لاحق أغلى ثم إخراجٌ يفوق الافتتاح — الافتتاحُ يُستهلك أوّلاً بتكلفته', async () => {
    // استلامٌ ضمنيٌّ مع الشراء بتكلفة 6 — طبقتُه بتاريخ اليوم، أحدثُ من اقتناء الافتتاح (قبل 20 يوماً).
    await post('/purchases')
      .send({ supplierId, date: today(), subtotal: 60, warehouseId, category: 'بضاعة', lines: [{ description: 'صنف', productId: plainProductId, quantity: 10, unitPrice: 6, taxRate: 15 }] })
      .expect(201);
    expect(await layersOf(plainProductId)).toEqual([
      { source: 'OPENING', received: 10, remaining: 10, unitCost: 4, acquiredAt: daysAgo(20), batch: false },
      { source: 'GOODS_RECEIPT', received: 10, remaining: 10, unitCost: 6, acquiredAt: today(), batch: false },
    ]);

    // إخراجٌ يدويّ 12: عشرةٌ من الافتتاح (4) ثم اثنتان من الاستلام (6).
    const out = await post('/inventory/movements').send({ productId: plainProductId, warehouseId, type: 'OUT', qty: 12, date: today(), reason: 'صرف' }).expect(201);
    const consumptions = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.inventoryConsumption.findMany({ where: { movementId: out.body.id }, include: { layer: { select: { sourceType: true } } }, orderBy: { createdAt: 'asc' } }),
    );
    expect(consumptions.map((c) => ({ source: c.layer?.sourceType ?? null, qty: Number(c.qty), unitCost: Number(c.unitCost) }))).toEqual([
      { source: 'OPENING', qty: 10, unitCost: 4 },
      { source: 'GOODS_RECEIPT', qty: 2, unitCost: 6 },
    ]);
    expect(await layersOf(plainProductId)).toEqual([
      { source: 'OPENING', received: 10, remaining: 0, unitCost: 4, acquiredAt: daysAgo(20), batch: false },
      { source: 'GOODS_RECEIPT', received: 10, remaining: 8, unitCost: 6, acquiredAt: today(), batch: false },
    ]);
  });

  it('[SPEC 8.14] ③ المؤقّت: بيعٌ سبق الإعلان يُسوّيه الافتتاحُ بالكاتب القائم وقيدِ فرقٍ بتاريخ اليوم', async () => {
    // إخراجٌ بلا طبقةٍ ⟵ استهلاكٌ مؤقّت بآخر تكلفةٍ معروفة (بطاقةُ الصنف 7).
    const out = await post('/inventory/movements').send({ productId: provisionalProductId, warehouseId, type: 'OUT', qty: 3, date: today(), reason: 'بيعٌ قبل الإعلان' }).expect(201);
    const open = await get('/inventory/provisional').expect(200);
    expect((open.body as { movementId: string }[]).some((r) => r.movementId === out.body.id)).toBe(true);

    const before = await ledger();
    const res = await post('/inventory/opening')
      .send({ lines: [{ productId: provisionalProductId, warehouseId, qty: 8, unitCost: 9, acquiredAt: daysAgo(10) }] })
      .expect(201);
    // تاريخُ الافتتاح المعلَنُ من قبل يُطبَّق بلا أن يُذكر.
    expect(res.body.openingDate).toBe(today());
    expect(res.body.provisionalSettled).toBe(1);
    // الفرقُ = (9 − 7) × 3 = 6 على تكلفة المبيعات، والطبقةُ بقيت 5.
    expect(res.body.provisionalCostDelta).toBe(6);
    expect(await layersOf(provisionalProductId)).toEqual([{ source: 'OPENING', received: 8, remaining: 5, unitCost: 9, acquiredAt: daysAgo(10), batch: false }]);
    const stillOpen = await get('/inventory/provisional').expect(200);
    expect((stillOpen.body as { movementId: string }[]).some((r) => r.movementId === out.body.id)).toBe(false);

    const settlement = await entriesNamed(`تسوية استهلاكٍ مؤقّت — رصيدٌ افتتاحيّ ${res.body.no}`);
    expect(settlement).toHaveLength(1);
    expect(settlement[0].date.toISOString().slice(0, 10)).toBe(today());
    const after = await ledger();
    // الإعلانُ 72 على 1300 ناقص فرقُ التسوية 6 إلى 5100.
    expect(delta(after, before, '1300')).toBe(66);
    expect(delta(after, before, '3900')).toBe(72);
    expect(delta(after, before, '5100')).toBe(6);
  });

  it('[SPEC 8.14] ④ الحدودُ المسمّاة: متتبَّعٌ بلا دفعة (ولا يُكتب شيء) · اقتناءٌ بعد الافتتاح · تاريخُ افتتاحٍ ثانٍ · صنفٌ تحرّك قبل الافتتاح', async () => {
    const countBefore = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockOpening.count());
    const movementsBefore = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.count({ where: { origin: 'OPENING' } }));

    // متتبَّعٌ بلا دفعة — القاعدةُ القائمة بالدالّة نفسِها؛ والسطرُ الأوّل السليمُ لا يُكتب معه.
    const noBatch = await post('/inventory/opening')
      .send({ lines: [line({ qty: 1 }), { productId: trackedProductId, warehouseId, qty: 2, unitCost: 2.5, acquiredAt: daysAgo(1) }] })
      .expect(400);
    expect(noBatch.body.message).toContain('inventory.batch_required');

    // اقتناءٌ بعد تاريخ الافتتاح.
    const late = await post('/inventory/opening').send({ lines: [line({ acquiredAt: daysAhead(1) })] }).expect(400);
    expect(late.body.message).toContain('stockOpenings.acquired_after_opening');

    // تاريخُ افتتاحٍ ثانٍ — يومٌ واحد للمنشأة.
    const second = await post('/inventory/opening').send({ openingDate: daysAgo(1), lines: [line({})] }).expect(409);
    expect(second.body.message).toContain('stockOpenings.date_mismatch');

    // صنفٌ له حركةٌ قبل تاريخ الافتتاح.
    await post('/inventory/movements').send({ productId: movedProductId, warehouseId, type: 'IN', qty: 4, date: daysAgo(5), unitCost: 1, reason: 'إدخالٌ قديم' }).expect(201);
    const moved = await post('/inventory/opening').send({ lines: [{ productId: movedProductId, warehouseId, qty: 2, unitCost: 1, acquiredAt: daysAgo(30) }] }).expect(409);
    expect(moved.body.message).toContain('stockOpenings.after_movement');

    expect(await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockOpening.count())).toBe(countBefore);
    expect(await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.count({ where: { origin: 'OPENING' } }))).toBe(movementsBefore);
  });

  it('[SPEC 8.14] ⑤ مصدرٌ واحد لرصيد 1300: الرصيدُ الافتتاحيُّ لحساب المخزون من شاشة الحسابات يُرفض', async () => {
    const accounts = (await get('/accounts').expect(200)).body as { id: string; code: string; balance: string }[];
    const inventory = accounts.find((a) => a.code === '1300')!;
    expect(inventory).toBeTruthy();
    const before = Number(inventory.balance);
    const res = await patch(`/accounts/${inventory.id}`).send({ openingBalance: 100 }).expect(409);
    expect(res.body.message).toContain('accounts.opening_inventory_via_stock');
    // ولا يتغيّر رصيدُه؛ والتعديلُ بلا رصيدٍ افتتاحيّ يمرّ.
    await patch(`/accounts/${inventory.id}`).send({ name: 'المخزون' }).expect(200);
    const again = (await get('/accounts').expect(200)).body as { code: string; balance: string }[];
    expect(Number(again.find((a) => a.code === '1300')!.balance)).toBe(before);
    // وحسابٌ جديد برمز 1300 لا يُنشأ برصيدٍ افتتاحيّ في منشأةٍ بلا 1300 (الرمزُ محجوز — لو لم يوجد).
    const dup = await post('/accounts').send({ code: '1300', name: 'مخزون ثانٍ', type: 'asset', openingBalance: 50 }).expect(409);
    expect(dup.body.message).toBeTruthy();
  });

  it('[SPEC 8.14] ⑥ قفلُ الفترة شرطٌ لا تفصيل: فترةُ الافتتاح مقفلة ⟵ يُرفض ولا يبقى رأسٌ ولا حركة', async () => {
    lockCompany = await registerIsolatedCompany(app, 'opening-stock-locked');
    const t = lockCompany.token;
    const cid = lockCompany.companyId;
    const suffix = Date.now();
    const wh = (await post('/warehouses', t).send({ name: `مستودع مقفل ${suffix}` }).expect(201)).body.id;
    const prod = (await post('/products', t).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف مقفل ${suffix}`, price: 5, cost: 2 }).expect(201)).body.id;
    const year = await post('/fiscal-years', t).send({ name: 'سنة الافتتاح', start: '2026-01-01', end: '2026-12-31' }).expect(201);
    const january = year.body.periods.find((p: { month: number }) => p.month === 1);
    await patch(`/fiscal-years/periods/${january.id}/close`, t).expect(200);

    // بلا تاريخٍ مُعلَن يُشتقّ تاريخُ الافتتاح من بداية السنة المالية — وهي مقفلة.
    const blocked = await post('/inventory/opening', t).send({ lines: [{ productId: prod, warehouseId: wh, qty: 3, unitCost: 2, acquiredAt: '2025-12-15' }] }).expect(409);
    expect(blocked.body.message).toContain('fiscal.period_closed');
    expect(blocked.body.message).toContain('01/2026');
    const left = await tenantPrisma.runInTenantContext(cid, async (tx) => ({
      openings: await tx.stockOpening.count(),
      movements: await tx.stockMovement.count(),
      layers: await tx.inventoryLayer.count(),
    }));
    expect(left).toEqual({ openings: 0, movements: 0, layers: 0 });
  });

  it('[SPEC 8.14] ⑦ الإلغاءُ عكسٌ لا محو: غيرُ المستهلَك يُعكس بحركةٍ وقيد، والمستهلَكُ يُرفض، والعامُّ لا يمسّ حركةَ الافتتاح؛ والعزل', async () => {
    // المستهلَكُ (سطرُ الصنف الأوّل استُهلكت طبقتُه في ②) يُرفض مسمّىً.
    const consumed = await post(`/inventory/opening/${openingId}/lines/${plainLineId}/void`).expect(409);
    expect(consumed.body.message).toContain('stockOpenings.line_consumed');

    // مسارُ عكس الحركات العامّ لا يمسّ حركةَ الافتتاح — لها مستندُها.
    const generic = await post(`/inventory/movements/${plainMovementId}/reverse`).expect(409);
    expect(generic.body.message).toContain('inventory.movement_has_document');

    // غيرُ المستهلَك (المتتبَّع) يُعكس: حركةُ إخراجٍ تشير إلى الأصل، الطبقةُ تُقفل، وقيدٌ يعكس نصيبَه.
    const before = await ledger();
    const res = await post(`/inventory/opening/${openingId}/lines/${trackedLineId}/void`).expect(201);
    const voided = (res.body.lines as { id: string; voidedAt: string | null; voidMovementId: string | null; voidJournalEntryId: string | null }[]).find((l) => l.id === trackedLineId)!;
    expect(voided.voidedAt).toBeTruthy();
    expect(voided.voidMovementId).toBeTruthy();
    expect(voided.voidJournalEntryId).toBeTruthy();
    expect(res.body.baseAmount).toBe(40);
    expect(res.body.resultingQty).toBe(0);
    expect(await layersOf(trackedProductId)).toEqual([{ source: 'OPENING', received: 5, remaining: 0, unitCost: 2.5, acquiredAt: daysAgo(3), batch: true }]);
    const reversal = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.stockMovement.findUniqueOrThrow({ where: { id: voided.voidMovementId! } }));
    expect(reversal.type).toBe('OUT');
    expect(reversal.origin).toBe('OPENING');
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(-12.5);
    expect(delta(after, before, '3900')).toBe(-12.5);
    const voidEntries = await entriesNamed(`إلغاءُ سطرٍ من الرصيد الافتتاحيّ — مخزون ${openingNo}`);
    expect(voidEntries).toHaveLength(1);

    // والمُلغى لا يُلغى ثانيةً.
    const twice = await post(`/inventory/opening/${openingId}/lines/${trackedLineId}/void`).expect(409);
    expect(twice.body.message).toContain('stockOpenings.line_voided');

    // التقريرُ يستثني المُلغى من المجموع.
    const report = await get('/inventory/opening').expect(200);
    expect(report.body.totals.baseAmount).toBe(112);
    expect(report.body.totals.lines).toBe(2);

    // العزل: منشأةٌ أخرى لا ترى الإعلانَ ولا تلغي سطره.
    await get(`/inventory/opening/${openingId}`, other!.token).expect(404);
    await post(`/inventory/opening/${openingId}/lines/${plainLineId}/void`, other!.token).expect(404);
    const otherReport = await get('/inventory/opening', other!.token).expect(200);
    expect(otherReport.body.items).toHaveLength(0);
  });

  it('[SPEC 8.14] ⑧ القائم: كتلةُ العدّ في الهجرة تُعاد على الحقيقة في معاملةٍ تُرجَع، والتقريرُ يعدّ طبقاتِ التسوية خارج المجموع ولا يحوّلها', async () => {
    // حالةٌ معلومة: إدخالٌ يدويّ — طبقةُ تسويةٍ بمتبقٍّ (افتتاحٌ مقنَّعٌ محتمَل) — تبقى تسويةً.
    await post('/inventory/movements').send({ productId: movedProductId, warehouseId, type: 'IN', qty: 6, date: today(), unitCost: 1.5, reason: 'رصيدٌ أدخل يدوياً' }).expect(201);
    const report = await get('/inventory/opening').expect(200);
    // الحركتان اليدويتان لصنف «المتحرّك» (④ و⑧) طبقتا تسويةٍ بمتبقٍّ — تُعدّان، ولا تدخلان المجموع (112).
    expect(report.body.legacyAdjustmentLayers.count).toBe(2);
    expect(report.body.legacyAdjustmentLayers.qtyRemaining).toBe(10);
    expect(report.body.totals.baseAmount).toBe(112);
    expect(await layersOf(movedProductId)).toEqual([
      { source: 'ADJUSTMENT', received: 4, remaining: 4, unitCost: 1, acquiredAt: daysAgo(5), batch: false },
      { source: 'ADJUSTMENT', received: 6, remaining: 6, unitCost: 1.5, acquiredAt: today(), batch: false },
    ]);

    // كتلةُ العدّ من نصّ الهجرة نفسِه — تُعاد في معاملةٍ تُرجَع: تصرخ ولا تكتب.
    const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20260919230000_stock_openings', 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    const start = sql.indexOf('DO $$');
    const end = sql.indexOf('END $$;', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const doBlock = sql.slice(start, end + 'END $$;'.length);
    expect(doBlock).toContain('RAISE WARNING');
    expect(doBlock).not.toContain('RAISE NOTICE');
    expect(doBlock).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/);
    const replay = await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layersBefore = await tx.inventoryLayer.count();
      await tx.$executeRawUnsafe(doBlock);
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      const layersAfter = await tx.inventoryLayer.count();
      const adjustment = await tx.inventoryLayer.findMany({ where: { sourceType: 'ADJUSTMENT' }, select: { sourceType: true } });
      throw Object.assign(new Error('rollback'), { replay: { layersBefore, layersAfter, adjustment } });
    }).catch((e: Error & { replay?: unknown }) => e.replay as { layersBefore: number; layersAfter: number; adjustment: { sourceType: string }[] });
    expect(replay.layersAfter).toBe(replay.layersBefore);
    // ولا تُحوَّل: كلُّ طبقة تسويةٍ بقيت تسويةً بعد الكتلة.
    expect(replay.adjustment.every((l) => l.sourceType === 'ADJUSTMENT')).toBe(true);
    expect(replay.adjustment).toHaveLength(2);
  });
});
