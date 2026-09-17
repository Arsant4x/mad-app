import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * ⚖️ **تعديلُ فاتورة الشراء — بعكسٍ لا بحذف، والمفصلُ محكوم** (`ق-٩٩٧` · `ق-١٠٠٦`/⑥ · `ق-١٠٠٨`):
 *
 *   ① قبل أيّ استهلاك ⟵ يُعدَّل كلُّ شيء **بعكسٍ لا بحذف، والرفُّ يتبع**: القيدُ يُعكس ويُعاد، والاستلامُ
 *      يُعكس بحركةٍ خارجة من طبقته ويُعاد بطبقةٍ جديدة، والسطرُ القديم يُحفظ متجاوَزاً لا محذوفاً.
 *   ② بعد استهلاكٍ ولو جزئيّ ⟵ **الكميةُ والتكلفةُ مجمَّدتان**، وما عداهما يُعدَّل — والرسالةُ تسمّي المخرج.
 *   ③ والحذفُ إلغاءٌ بقيد عكس (`voidedAt`) — لا `500` ولا محو — ولا يُلغى ما استُهلك منه.
 *
 * منشأةٌ معزولة، والحارسُ يقرأ الدفترَ والرفَّ والإقرارَ معاً في كلّ مرحلة (`ق-١٠٠٨`/٢).
 */
describe('تعديلُ فاتورة الشراء بعكسٍ وتجميدُها بعد الاستهلاك وإلغاؤها (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  let other: IsolatedCompany | undefined;
  let token: string;
  let companyId: string;
  let supplierId: string;
  let customerId: string;
  let warehouseId: string;
  let branchId: string;
  let productId: string;
  let purchaseId: string;
  let purchaseNo: string;
  const today = () => new Date().toISOString().slice(0, 10);

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (path: string) => auth(request(app.getHttpServer()).get(path));
  const post = (path: string) => auth(request(app.getHttpServer()).post(path));
  const patch = (path: string) => auth(request(app.getHttpServer()).patch(path));
  const del = (path: string) => auth(request(app.getHttpServer()).delete(path));

  async function ledger(): Promise<Record<string, number>> {
    const res = await get('/accounts').expect(200);
    return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
  }

  async function shelf() {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layers = await tx.inventoryLayer.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } });
      const movements = await tx.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'asc' }, select: { type: true, origin: true, qty: true, reason: true } });
      return {
        layers: layers.map((l) => ({ received: Number(l.qtyReceived), remaining: Number(l.qtyRemaining), unitCost: Number(l.unitCost) })),
        movements: movements.map((m) => ({ ...m, qty: Number(m.qty) })),
      };
    });
  }

  async function stockOf(): Promise<number> {
    const res = await get('/inventory/stock-levels').expect(200);
    const row = (res.body as { productId: string; warehouseId: string; qty: number }[]).find((r) => r.productId === productId && r.warehouseId === warehouseId);
    return row ? Number(row.qty) : 0;
  }

  async function vat() {
    const d = new Date();
    const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    const res = await get(`/obligations/vat-declaration?year=${d.getUTCFullYear()}&quarter=${quarter}`).expect(200);
    return { standard: Number(res.body.purchasesStandard), tax: Number(res.body.purchasesStandardVat), excluded: Number(res.body.purchasesExcluded) };
  }

  async function entriesNamed(fragment: string): Promise<number> {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.journalEntry.count({ where: { memo: { contains: fragment } } }));
  }

  async function snapshot() {
    return { ledger: await ledger(), shelf: await shelf(), stock: await stockOf(), vat: await vat() };
  }
  const delta = (after: Record<string, number>, before: Record<string, number>, code: string) => Number(((after[code] ?? 0) - (before[code] ?? 0)).toFixed(2));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'purchase-edit');
    token = company.token;
    companyId = company.companyId;
    other = await registerIsolatedCompany(app, 'purchase-edit-other');

    const suffix = Date.now();
    supplierId = (await post('/suppliers').send({ name: `مورّد تعديل ${suffix}` }).expect(201)).body.id;
    customerId = (await post('/customers').send({ name: `عميل تعديل ${suffix}` }).expect(201)).body.id;
    warehouseId = (await post('/warehouses').send({ name: `مستودع تعديل ${suffix}` }).expect(201)).body.id;
    branchId = (await post('/branches').send({ name: `فرع تعديل ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await post('/products').send({ name: `صنف تعديل ${suffix}`, price: 100, cost: 40 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await app.close();
  });

  it('① قبل أيّ استهلاك: تعديلُ البنود ١٠×٤٠ ⟵ ٨×٤٢ بعكس القيد وإعادته، والرفُّ يتبع بعكس الاستلام وإعادته', async () => {
    const before = await snapshot();
    const created = await post('/purchases')
      .send({ supplierId, date: today(), subtotal: 400, warehouseId, branchId, category: 'بضاعة', lines: [{ description: 'صنف', productId, quantity: 10, unitPrice: 40, taxRate: 15 }] })
      .expect(201);
    purchaseId = created.body.id;
    purchaseNo = created.body.no;
    const afterCreate = await snapshot();
    expect(afterCreate.shelf.layers).toEqual([{ received: 10, remaining: 10, unitCost: 40 }]);

    const res = await patch(`/purchases/${purchaseId}`).send({ subtotal: 336, lines: [{ description: 'صنف — تصحيح', productId, quantity: 8, unitPrice: 42, taxRate: 15 }] }).expect(200);
    // السطرُ الحيّ وحدَه في الردّ؛ والقديمُ محفوظٌ متجاوَزاً لا محذوفاً
    expect(res.body.lines).toHaveLength(1);
    expect(Number(res.body.lines[0].quantity)).toBe(8);
    expect(Number(res.body.subtotal)).toBe(336);
    const allLines = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.purchaseLine.findMany({ where: { purchaseId } }));
    expect(allLines).toHaveLength(2);
    expect(allLines.filter((l) => l.supersededAt !== null)).toHaveLength(1);

    const after = await snapshot();
    // الدفتر: عكسٌ وإعادة — الصافي 336 لا 400: المخزون −64 · المدخلات −9.6 · الذمّة −73.6؛ وقيدُ العكس قائمٌ لا محذوف
    expect(delta(after.ledger, afterCreate.ledger, '1300')).toBe(-64);
    expect(delta(after.ledger, afterCreate.ledger, '1250')).toBe(-9.6);
    expect(delta(after.ledger, afterCreate.ledger, '2100')).toBe(-73.6);
    expect(delta(after.ledger, before.ledger, '1300')).toBe(336);
    expect(await entriesNamed(`عكسُ فاتورة شراء ${purchaseNo}`)).toBe(1);
    expect(await entriesNamed(`فاتورة شراء ${purchaseNo}`)).toBeGreaterThanOrEqual(2);
    // الرفّ: الطبقةُ القديمة أُفرغت بحركةٍ خارجة (لا حُذفت)، وطبقةٌ جديدة ٨×٤٢
    expect(after.shelf.layers).toEqual([
      { received: 10, remaining: 0, unitCost: 40 },
      { received: 8, remaining: 8, unitCost: 42 },
    ]);
    expect(after.shelf.movements.map((m) => `${m.type}:${m.qty}`)).toEqual(['IN:10', 'OUT:10', 'IN:8']);
    expect(after.stock).toBe(8);
    // الإقرار يقرأ الصفَّ الحيّ: 336 و50.4
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(336, 2);
    expect(after.vat.tax - before.vat.tax).toBeCloseTo(50.4, 2);
  }, 30000);

  it('② بعد استهلاكٍ جزئيّ: الكميةُ والتكلفةُ مجمَّدتان والرسالةُ تسمّي المخرج — وما عداهما يُعدَّل', async () => {
    await post('/invoices')
      .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId, quantity: 2, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const before = await snapshot();
    expect(before.stock).toBe(6);

    for (const body of [
      { subtotal: 300, lines: [{ description: 'x', productId, quantity: 7, unitPrice: 42 }] },
      { subtotal: 300 },
      { exchangeRate: 2 },
      { warehouseId },
    ]) {
      const res = await patch(`/purchases/${purchaseId}`).send(body);
      expect(res.status).toBe(409);
      expect(String(res.body.message)).toContain('purchases.frozen_after_consumption');
    }
    const unchanged = await snapshot();
    expect(unchanged).toEqual(before);

    // ما عدا الكمية والتكلفة يُعدَّل: مرجعُ المورّد والاستحقاق والاستبعادُ من الإقرار
    const ok = await patch(`/purchases/${purchaseId}`).send({ supplierRef: 'SUP-77-B', dueDate: today(), excludeFromVat: true }).expect(200);
    expect(ok.body.supplierRef).toBe('SUP-77-B');
    expect(ok.body.excludeFromVat).toBe(true);
    const after = await snapshot();
    expect(after.ledger).toEqual(before.ledger);
    expect(after.shelf).toEqual(before.shelf);
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(-336, 2);
    expect(after.vat.excluded - before.vat.excluded).toBeCloseTo(336, 2);
    await patch(`/purchases/${purchaseId}`).send({ excludeFromVat: false }).expect(200);
  }, 30000);

  it('③ ما استُهلك منه لا يُلغى — والرسالةُ تسمّي المخرج', async () => {
    const before = await snapshot();
    const res = await del(`/purchases/${purchaseId}`);
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toContain('purchases.void_consumed');
    expect(await snapshot()).toEqual(before);
  }, 30000);

  it('④ الحذفُ إلغاءٌ بقيد عكس: الصفُّ يبقى مُلغىً، والدفترُ والرفُّ يعودان، والإقرارُ يقرأ الإلغاءَ في ربعه', async () => {
    const before = await snapshot();
    const created = await post('/purchases')
      .send({ supplierId, date: today(), subtotal: 50, warehouseId, branchId, category: 'بضاعة', lines: [{ description: 'صنف', productId, quantity: 5, unitPrice: 10, taxRate: 15 }] })
      .expect(201);
    const id = created.body.id as string;
    const afterCreate = await snapshot();
    expect(delta(afterCreate.ledger, before.ledger, '2100')).toBe(57.5);

    await del(`/purchases/${id}`).expect(204);
    const after = await snapshot();
    // الدفتر عاد بقيد عكسٍ قائم — لا بمحو القيد
    for (const code of ['1300', '1250', '2100']) expect(delta(after.ledger, before.ledger, code)).toBe(0);
    expect(await entriesNamed(`إلغاءُ فاتورة شراء ${created.body.no}`)).toBe(1);
    expect(await entriesNamed(`فاتورة شراء ${created.body.no}`)).toBeGreaterThanOrEqual(1);
    // الرفُّ عاد: الطبقةُ أُفرغت بحركةٍ خارجة، والرصيدُ كما كان
    expect(after.stock).toBe(before.stock);
    const last = after.shelf.layers[after.shelf.layers.length - 1];
    expect(last).toEqual({ received: 5, remaining: 0, unitCost: 10 });
    expect(after.shelf.movements.slice(-2).map((m) => `${m.type}:${m.qty}`)).toEqual(['IN:5', 'OUT:5']);
    // الإقرار: الصفُّ في ربعه والإلغاءُ في ربعه — والربعُ واحدٌ هنا فالصافي صفر
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(0, 2);
    expect(after.vat.tax - before.vat.tax).toBeCloseTo(0, 2);
    // الصفُّ باقٍ مُلغىً: لا تعديلَ ولا إلغاءَ ثانياً ولا إشعارَ عليه، ولا يظهر في فواتير المورّد المفتوحة
    const list = (await get('/purchases').expect(200)).body as { id: string; voidedAt: string | null; remaining: number }[];
    expect(list.find((p) => p.id === id)).toMatchObject({ remaining: 0 });
    expect(list.find((p) => p.id === id)?.voidedAt).toBeTruthy();
    const again = await patch(`/purchases/${id}`).send({ dueDate: today() });
    expect(again.status).toBe(409);
    expect(String(again.body.message)).toContain('purchases.voided');
    expect((await del(`/purchases/${id}`)).status).toBe(409);
    const note = await post(`/purchases/${id}/supplier-credit-note`).send({ reason: 'على مُلغاة' });
    expect(note.status).toBe(400);
    expect(String(note.body.message)).toContain('supplierNotes.target_voided');
    const open = (await get(`/supplier-payments/open-purchases/${supplierId}`).expect(200)).body as { id: string }[];
    expect(open.some((p) => p.id === id)).toBe(false);
  }, 30000);

  it('⑤ العزل: منشأةٌ أخرى لا تعدّل ولا تُلغي', async () => {
    const foreignPatch = await request(app.getHttpServer()).patch(`/purchases/${purchaseId}`).set('Authorization', `Bearer ${other!.token}`).send({ dueDate: today() });
    expect(foreignPatch.status).toBe(404);
    const foreignDel = await request(app.getHttpServer()).delete(`/purchases/${purchaseId}`).set('Authorization', `Bearer ${other!.token}`);
    expect(foreignDel.status).toBe(404);
  }, 30000);
});
