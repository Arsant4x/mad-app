import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * ٧ **التكاليفُ المحمَّلة** (`ق-١١٤٥` · `ق-١١٤٦`) — الحارسُ الحيّ يقرأ **الدفترَ والطبقةَ معاً** في كلِّ مرحلة:
 *
 *   ① توزيعٌ بالقيمة على استلامٍ واحد قبل أي استهلاك: كلُّه إلى الرفّ (`1300`)، وتكلفةُ الوحدة تزيد بنصيبها، ومصروفُ الفئة يُعاد تصنيفُه، والدفترُ يتوازن.
 *   ② الفرقُ الثاني (`ق-١٠٧٥`): تكلفةٌ تصل بعد بيع بعضِ الطبقة — حصّةُ المستهلَك إلى `5100` الآن، وحصّةُ الرفّ إلى `1300`، وما يُباع بعدها يخرج بالتكلفة الجديدة.
 *   ③ إرساليةٌ على استلامين: التوزيعُ بالقيمة بأوزان سطور الاستلام، والأخيرُ يحمل بقيّةَ التدوير فلا هللةَ تبقى.
 *   ④ الحدودُ المسمّاة: سطرٌ مخزنيّ · سطرٌ وُزِّع · طبقةٌ من استلامٍ مُلغى · مجموعٌ يدويّ يخالف السطر · طبقةٌ مكرَّرة · بلا طبقات.
 *   ⑤ الإلغاءُ عكسٌ لا محو — يعيد التكلفةَ ويعكس القيدَ، ويسمح بتوزيعٍ جديد — ويُرفض بعد استهلاكٍ لاحق.
 *   ⑥ التجميد: شراءٌ خدميّ وُزِّع لا يُعدَّل ولا يُلغى، واستلامٌ على طبقته توزيعٌ لا يُعكس — حتى يُلغى التوزيع.
 *   ⑦ العزل: منشأةٌ أخرى لا ترى التوزيعَ ولا توزّع.
 *
 * منشأةٌ معزولة؛ والطبقاتُ تُقرأ بالمخطَّط والدفترُ من `/accounts`.
 */
describe('التكاليفُ المحمَّلة — توزيعُ فاتورةٍ خدمية على طبقاتٍ مسمّاة (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  let other: IsolatedCompany | undefined;
  let token: string;
  let companyId: string;
  let supplierId: string;
  let carrierId: string;
  let customerId: string;
  let warehouseId: string;
  let branchId: string;
  let productA: string;
  let productB: string;
  const today = () => new Date().toISOString().slice(0, 10);

  const auth = (r: request.Test, t = token) => r.set('Authorization', `Bearer ${t}`);
  const get = (path: string, t?: string) => auth(request(app.getHttpServer()).get(path), t);
  const post = (path: string, t?: string) => auth(request(app.getHttpServer()).post(path), t);
  const patch = (path: string) => auth(request(app.getHttpServer()).patch(path));
  const del = (path: string, t?: string) => auth(request(app.getHttpServer()).delete(path), t);

  async function ledger(): Promise<Record<string, number>> {
    const res = await get('/accounts').expect(200);
    return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
  }
  const delta = (after: Record<string, number>, before: Record<string, number>, code: string) => Number(((after[code] ?? 0) - (before[code] ?? 0)).toFixed(2));

  async function layerOf(pid: string, index = 0) {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layers = await tx.inventoryLayer.findMany({ where: { productId: pid }, orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }] });
      const l = layers[index];
      return { id: l.id, received: Number(l.qtyReceived), remaining: Number(l.qtyRemaining), unitCost: Number(l.unitCost) };
    });
  }

  async function entriesNamed(fragment: string): Promise<number> {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.journalEntry.count({ where: { memo: { startsWith: fragment } } }));
  }

  /** شراءٌ مخزنيّ من مورّد البضاعة — بضاعةٌ (فئة `COGS`) تُستلم ضمنيّاً ما لم يُقل غيرُه. */
  function stockedPurchase(pid: string, quantity: number, unitPrice: number, overrides: Record<string, unknown> = {}) {
    return { supplierId, date: today(), subtotal: quantity * unitPrice, warehouseId, branchId, category: 'بضاعة', lines: [{ description: 'صنف', productId: pid, quantity, unitPrice, taxRate: 15 }], ...overrides };
  }

  /** شراءٌ خدميّ من الناقل — سطرٌ بلا صنف (شحن) على فئة «مصروفات أخرى» (`5400`). */
  function servicePurchase(amount: number, description = 'شحن', overrides: Record<string, unknown> = {}) {
    return { supplierId: carrierId, date: today(), subtotal: amount, branchId, category: 'مصروفات أخرى', lines: [{ description, quantity: 1, unitPrice: amount, taxRate: 15 }], ...overrides };
  }

  async function sell(pid: string, quantity: number, unitPrice = 150) {
    return post('/invoices').send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId: pid, quantity, unitPrice, taxRate: 15 }] }).expect(201);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'landed-costs');
    token = company.token;
    companyId = company.companyId;
    other = await registerIsolatedCompany(app, 'landed-costs-other');

    const suffix = Date.now();
    supplierId = (await post('/suppliers').send({ name: `مورّد بضاعة ${suffix}` }).expect(201)).body.id;
    carrierId = (await post('/suppliers').send({ name: `ناقل ${suffix}` }).expect(201)).body.id;
    customerId = (await post('/customers').send({ name: `عميل تكلفة ${suffix}` }).expect(201)).body.id;
    warehouseId = (await post('/warehouses').send({ name: `مستودع تكلفة ${suffix}` }).expect(201)).body.id;
    branchId = (await post('/branches').send({ name: `فرع تكلفة ${suffix}`, warehouseId }).expect(201)).body.id;
    productA = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف أ ${suffix}`, price: 150, cost: 40 }).expect(201)).body.id;
    productB = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف ب ${suffix}`, price: 150, cost: 20 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await app.close();
  });

  // ما تشترك فيه المراحل — الشراءُ الخدميّ الأوّل وتوزيعُه (يُلغى في ⑤ ويُعاد).
  let firstPurchaseId: string;
  let firstReceiptId: string;
  let firstStockedLineId: string;
  let freightId: string;
  let freightLineId: string;
  let freightNo: string;
  let firstDistributionId: string;

  it('[SPEC 5.8] ① توزيعٌ بالقيمة على استلامٍ واحد قبل أي استهلاك: كلُّه إلى الرفّ، والتكلفةُ تزيد بنصيبها، ومصروفُ الفئة يُعاد تصنيفُه', async () => {
    const stocked = await post('/purchases').send(stockedPurchase(productA, 10, 40)).expect(201);
    firstPurchaseId = stocked.body.id;
    firstStockedLineId = stocked.body.lines[0].id;
    const receipts = await get(`/purchases/${firstPurchaseId}/receipts`).expect(200);
    firstReceiptId = receipts.body.receipts[0].id;
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ received: 10, remaining: 10, unitCost: 40 }));

    const beforeFreight = await ledger();
    const freight = await post('/purchases').send(servicePurchase(100)).expect(201);
    freightId = freight.body.id;
    freightNo = freight.body.no;
    freightLineId = freight.body.lines[0].id;
    const afterFreight = await ledger();
    // فاتورةُ الناقل كما هي: مصروفٌ على فئتها، وضريبتُها مدخلات، وذمّتُها للناقل.
    expect(delta(afterFreight, beforeFreight, '5400')).toBe(100);
    expect(delta(afterFreight, beforeFreight, '1250')).toBe(15);
    expect(delta(afterFreight, beforeFreight, '2100')).toBe(115);

    const listedBefore = await get(`/purchases/${freightId}/landed-costs`).expect(200);
    expect(listedBefore.body.serviceLines).toEqual([expect.objectContaining({ purchaseLineId: freightLineId, baseAmount: 100, distributed: false })]);

    const before = await ledger();
    const res = await post(`/purchases/${freightId}/landed-costs`).send({ purchaseLineId: freightLineId, goodsReceiptIds: [firstReceiptId] }).expect(201);
    firstDistributionId = res.body.id;
    expect(res.body.method).toBe('VALUE');
    expect(Number(res.body.baseAmount)).toBe(100);
    expect(Number(res.body.baseInventory)).toBe(100);
    expect(Number(res.body.baseCogs)).toBe(0);
    expect(res.body.journalEntryId).toBeTruthy();
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0]).toEqual(expect.objectContaining({ baseAmount: '100', baseInventory: '100', baseCogs: '0', qtyRemainingAt: '10', unitCostBefore: '40', unitCostAfter: '50' }));

    // الطبقةُ: 40 + 100/10 = 50 — والكمّيةُ كما هي.
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ received: 10, remaining: 10, unitCost: 50 }));

    // الدفترُ: الرفُّ يزيد بما وُزِّع، ومصروفُ الفئة ينقص به، ولا شيءَ على تكلفة المبيعات — وقيدُ الشراء لم يُمسّ.
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(100);
    expect(delta(after, before, '5400')).toBe(-100);
    expect(delta(after, before, '5100')).toBe(0);
    expect(delta(after, before, '2100')).toBe(0);
    expect(await entriesNamed(`تكلفةٌ محمَّلة — فاتورة شراء ${freightNo}`)).toBe(1);
    expect(await entriesNamed(`فاتورة شراء ${freightNo}`)).toBe(1);

    const listed = await get(`/purchases/${freightId}/landed-costs`).expect(200);
    expect(listed.body.distributions).toHaveLength(1);
    expect(listed.body.serviceLines[0].distributed).toBe(true);
  });

  it('[SPEC 5.8] ② الفرقُ الثاني: تكلفةٌ تصل بعد بيع بعضِ الطبقة — حصّةُ المستهلَك إلى 5100 الآن، والرفُّ بالجديد، وما يُباع بعدها يخرج بها', async () => {
    await post('/purchases').send(stockedPurchase(productB, 10, 20)).expect(201);
    // بيعُ 4 من 10 قبل وصول التخليص — تكلفتُها 20.
    await sell(productB, 4);
    expect(await layerOf(productB)).toEqual(expect.objectContaining({ received: 10, remaining: 6, unitCost: 20 }));

    const clearing = await post('/purchases').send(servicePurchase(50, 'تخليص')).expect(201);
    const layer = await layerOf(productB);
    const before = await ledger();
    const res = await post(`/purchases/${clearing.body.id}/landed-costs`).send({ purchaseLineId: clearing.body.lines[0].id, method: 'QUANTITY', layerIds: [layer.id] }).expect(201);
    // 50 على 10 وحدات = 5 للوحدة: 6 على الرفّ ⟵ 30، و4 استُهلكت ⟵ 20.
    expect(Number(res.body.baseInventory)).toBe(30);
    expect(Number(res.body.baseCogs)).toBe(20);
    expect(res.body.lines[0]).toEqual(expect.objectContaining({ qtyRemainingAt: '6', unitCostBefore: '20', unitCostAfter: '25' }));
    expect(await layerOf(productB)).toEqual(expect.objectContaining({ remaining: 6, unitCost: 25 }));

    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(30);
    expect(delta(after, before, '5100')).toBe(20);
    expect(delta(after, before, '5400')).toBe(-50);

    // ما يُباع بعدها يخرج بالتكلفة الجديدة: وحدةٌ واحدة ⟵ 25 لا 20.
    const beforeSale = await ledger();
    await sell(productB, 1);
    const afterSale = await ledger();
    expect(delta(afterSale, beforeSale, '5100')).toBe(25);
    expect(delta(afterSale, beforeSale, '1300')).toBe(-25);
    expect(await layerOf(productB)).toEqual(expect.objectContaining({ remaining: 5, unitCost: 25 }));
  });

  it('[SPEC 5.8] ③ إرساليةٌ على استلامين: التوزيعُ بالقيمة بأوزان سطور الاستلام، والأخيرُ يحمل بقيّةَ التدوير', async () => {
    const pending = await post('/purchases').send(stockedPurchase(productA, 3, 60, { receiveNow: false })).expect(201);
    const lineId: string = pending.body.lines[0].id;
    const r1 = await post(`/purchases/${pending.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 1 }] }).expect(201);
    const r2 = await post(`/purchases/${pending.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 2 }] }).expect(201);

    const freight = await post('/purchases').send(servicePurchase(100)).expect(201);
    const before = await ledger();
    const res = await post(`/purchases/${freight.body.id}/landed-costs`).send({ purchaseLineId: freight.body.lines[0].id, goodsReceiptIds: [r1.body.id, r2.body.id] }).expect(201);
    // الأوزانُ 60 : 120 ⟵ 33.33 و 66.67 — المجموعُ 100.00 بلا هللةٍ عالقة.
    const amounts = res.body.lines.map((l: { baseAmount: string }) => Number(l.baseAmount)).sort((a: number, b: number) => a - b);
    expect(amounts).toEqual([33.33, 66.67]);
    expect(Number(res.body.baseAmount)).toBe(100);
    expect(Number(res.body.baseInventory)).toBe(100);
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(100);
    expect(delta(after, before, '5400')).toBe(-100);

    // الطبقتان: 60 + 33.33/1 و 60 + 66.67/2.
    const l1 = await layerOf(productA, 1);
    const l2 = await layerOf(productA, 2);
    expect([l1.unitCost, l2.unitCost].sort((a, b) => a - b)).toEqual([93.33, 93.335]);
  });

  it('[SPEC 5.8] ④ الحدودُ المسمّاة: سطرٌ مخزنيّ · سطرٌ وُزِّع · طبقةٌ من استلامٍ مُلغى · مجموعٌ يدويّ مخالف · طبقةٌ مكرَّرة · بلا طبقات', async () => {
    const layer = await layerOf(productA);
    // سطرٌ مخزنيّ لا يُوزَّع — الشراءُ المخزنيّ نفسُه ليس فاتورةَ ناقل.
    const notService = await post(`/purchases/${firstPurchaseId}/landed-costs`).send({ purchaseLineId: firstStockedLineId, layerIds: [layer.id] }).expect(400);
    expect(notService.body.message).toBe('landedCosts.line_not_service');

    // السطرُ الموزَّع في ① لا يُوزَّع ثانيةً.
    const twice = await post(`/purchases/${freightId}/landed-costs`).send({ purchaseLineId: freightLineId, layerIds: [layer.id] }).expect(409);
    expect(String(twice.body.message)).toContain('landedCosts.line_already_distributed');
    // والطبقةُ الثانية (§6.6): الفهرسُ الجزئيّ يرفض صفّاً فعّالاً ثانياً على السطر نفسِه ولو تجاوز أحدٌ الخدمة.
    await expect(
      tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.landedCostDistribution.create({
          data: { companyId, purchaseId: freightId, purchaseLineId: freightLineId, method: 'VALUE', date: new Date(), baseAmount: 1, baseInventory: 1, baseCogs: 0 },
        }),
      ),
    ).rejects.toMatchObject({ code: 'P2002' });

    // طبقةٌ من استلامٍ مُلغى — شراءٌ يُستلم ثم يُلغى استلامُه.
    const voidable = await post('/purchases').send(stockedPurchase(productB, 2, 30, { receiveNow: false })).expect(201);
    const rec = await post(`/purchases/${voidable.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: voidable.body.lines[0].id, quantity: 2 }] }).expect(201);
    const voidedLayerId = (await tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryLayer.findFirst({ where: { sourceMovement: { goodsReceiptLineId: rec.body.lines[0].id } }, select: { id: true } })))!.id;
    await del(`/purchases/${voidable.body.id}/receipts/${rec.body.id}`).expect(204);
    const freight = await post('/purchases').send(servicePurchase(40)).expect(201);
    const fl = freight.body.lines[0].id;
    const voided = await post(`/purchases/${freight.body.id}/landed-costs`).send({ purchaseLineId: fl, layerIds: [voidedLayerId] }).expect(400);
    expect(String(voided.body.message)).toContain('landedCosts.layer_not_receipt');

    // مجموعٌ يدويّ يخالف قيمةَ السطر.
    const mismatch = await post(`/purchases/${freight.body.id}/landed-costs`).send({ purchaseLineId: fl, method: 'MANUAL', lines: [{ layerId: layer.id, baseAmount: 39 }] }).expect(409);
    expect(String(mismatch.body.message)).toContain('landedCosts.manual_sum_mismatch');

    // طبقةٌ مكرَّرة، وبلا طبقات.
    const repeated = await post(`/purchases/${freight.body.id}/landed-costs`).send({ purchaseLineId: fl, layerIds: [layer.id, layer.id] }).expect(400);
    expect(repeated.body.message).toBe('landedCosts.layer_repeated');
    const none = await post(`/purchases/${freight.body.id}/landed-costs`).send({ purchaseLineId: fl }).expect(400);
    expect(none.body.message).toBe('landedCosts.no_layers');

    // ولا أثرَ في الدفتر ولا في الطبقة من الرفض كلِّه.
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ unitCost: 50 }));
    expect((await get(`/purchases/${freight.body.id}/landed-costs`).expect(200)).body.distributions).toHaveLength(0);
  });

  it('[SPEC 5.8] ⑤ الإلغاءُ عكسٌ لا محو: التكلفةُ تُعاد والقيدُ يُعكس ويُسمح بتوزيعٍ جديد — ويُرفض بعد استهلاكٍ لاحق', async () => {
    const before = await ledger();
    await del(`/purchases/${freightId}/landed-costs/${firstDistributionId}`).expect(204);
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(-100);
    expect(delta(after, before, '5400')).toBe(100);
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ remaining: 10, unitCost: 40 }));
    expect(await entriesNamed(`عكسُ تكلفةٍ محمَّلة — فاتورة شراء ${freightNo}`)).toBe(1);
    const listed = await get(`/purchases/${freightId}/landed-costs`).expect(200);
    expect(listed.body.distributions[0].voidedAt).toBeTruthy();
    expect(listed.body.distributions[0].voidJournalEntryId).toBeTruthy();
    expect(listed.body.serviceLines[0].distributed).toBe(false);
    // مُلغىً لا يُلغى ثانيةً.
    await del(`/purchases/${freightId}/landed-costs/${firstDistributionId}`).expect(409);

    // السطرُ حرٌّ فيُوزَّع من جديد (الفهرسُ الجزئيّ على الفعّال وحدَه).
    const again = await post(`/purchases/${freightId}/landed-costs`).send({ purchaseLineId: freightLineId, goodsReceiptIds: [firstReceiptId] }).expect(201);
    firstDistributionId = again.body.id;
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ unitCost: 50 }));

    // بيعٌ بعد التوزيع يخرج بالتكلفة الجديدة — فالإلغاءُ بعده يُرفض مسمّىً ولا يمسّ شيئاً.
    await sell(productA, 1);
    const frozenBefore = await ledger();
    const refused = await del(`/purchases/${freightId}/landed-costs/${firstDistributionId}`).expect(409);
    expect(String(refused.body.message)).toContain('landedCosts.void_after_consumption');
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ remaining: 9, unitCost: 50 }));
    expect(delta(await ledger(), frozenBefore, '1300')).toBe(0);
  });

  it('[SPEC 5.8] ⑥ التجميد: شراءٌ خدميّ وُزِّع لا يُعدَّل ولا يُلغى، واستلامٌ على طبقته توزيعٌ لا يُعكس', async () => {
    const edit = await patch(`/purchases/${freightId}`).send({ category: 'مصروفات تأسيس' }).expect(409);
    expect(String(edit.body.message)).toContain('purchases.frozen_by_landed_costs');
    const remove = await del(`/purchases/${freightId}`).expect(409);
    expect(String(remove.body.message)).toContain('purchases.frozen_by_landed_costs');
    // والملاحظاتُ لا تمسّ القيد فتمرّ.
    await patch(`/purchases/${freightId}`).send({ supplierRef: 'BL-1' }).expect(200);

    const voidReceipt = await del(`/purchases/${firstPurchaseId}/receipts/${firstReceiptId}`).expect(409);
    expect(String(voidReceipt.body.message)).toContain('goodsReceipts.void_with_landed_cost');
    expect(await layerOf(productA)).toEqual(expect.objectContaining({ remaining: 9, unitCost: 50 }));
  });

  it('[SPEC 5.8] ⑦ العزل: منشأةٌ أخرى لا ترى التوزيعَ ولا توزّع', async () => {
    await get(`/purchases/${freightId}/landed-costs`, other!.token).expect(404);
    const layer = await layerOf(productA);
    await post(`/purchases/${freightId}/landed-costs`, other!.token).send({ purchaseLineId: freightLineId, layerIds: [layer.id] }).expect(404);
    await del(`/purchases/${freightId}/landed-costs/${firstDistributionId}`, other!.token).expect(404);
    expect(await tenantPrisma.runInTenantContext(other!.companyId, (tx) => tx.landedCostDistribution.count())).toBe(0);
  });
});
