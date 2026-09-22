import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { postReversalEntry } from '../src/journal/auto-posting.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (30.9 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(95000);

/**
 * ٢٥ **الاستلامُ المستقلّ** (`ق-١١٢١` · `ق-١١٢٢` · `ق-١١٣١`) — الحارسُ الحيّ يقرأ **الدفترَ والرفَّ والمطابقةَ معاً** في كلِّ مرحلة:
 *
 *   ① الضمنيُّ افتراضاً: شراءٌ مخزنيٌّ يُنشئ استلاماً كاملاً بتاريخ الشراء، وقيدين (فاتورةٌ على الوسيط · استلامٌ على `1300`)، والوسيطُ يتصافى.
 *   ② `receiveNow: false`: فاتورةٌ بلا رفّ — لا طبقة، والوسيطُ يحمل ما فُوتر ولم يُستلم، والمطابقةُ تعدّه.
 *   ③ الاستلامُ الجزئيّ ثم المكمِّل — والطبقةُ بتاريخ **الوصول** لا الفاتورة، والمكمِّلُ يرحّل الفرقَ فلا هللةَ تبقى (`3 × 0.333`).
 *   ④ الحدودُ المسمّاة: فوق المتبقّي · سطرٌ خدميّ · سطرٌ من شراءٍ آخر · سطرٌ مكرَّر · على إشعار.
 *   ⑤ الإلغاءُ عكسٌ لا محو — ولا يُلغى ما استُهلك منه، وبنودُ الشراء مجمَّدةٌ حتى يُعكس المسجَّل.
 *   ⑥ إشعارُ المورّد على سطرٍ لم يُستلم كاملاً أو استُلم على مرّتين يُردّ مسمّىً (حدٌّ معلَن).
 *   ⑦ العزل: منشأةٌ أخرى لا ترى الاستلامَ ولا تسجّل عليه.
 *   ⑧ القائم: صفوفُ ما قبل البناء تُكتب من حركاتها (الهجرةُ تُعاد على حالةٍ معلومة في معاملةٍ تُرجَع) — ثم قيدُها يُكتب حين يُعاد ترحيلُ شرائها.
 *
 * منشأةٌ معزولة، والمطابقةُ (`GET /purchases/receipts/reconciliation`) هي حارسُ الرصيد الذي حكم به المالك: ما بقي في الوسيط من المستندات مطابَقاً بالدفتر.
 */
describe('الاستلامُ المستقلّ — كيانٌ فوق الشراء، وقيدان، وحارسُ رصيد (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  let other: IsolatedCompany | undefined;
  let legacyCompany: IsolatedCompany | undefined;
  let token: string;
  let companyId: string;
  let supplierId: string;
  let customerId: string;
  let warehouseId: string;
  let branchId: string;
  let productId: string;
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

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

  async function reconciliation() {
    const res = await get('/purchases/receipts/reconciliation').expect(200);
    return res.body as { account: { code: string; name: string } | null; ledgerBalance: number; expected: number; difference: number; invoicedNotReceived: number; receivedNotInvoiced: number; linesOpen: number; legacyPurchases: number };
  }

  async function layersOf(pid: string) {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layers = await tx.inventoryLayer.findMany({ where: { productId: pid }, orderBy: { createdAt: 'asc' } });
      return layers.map((l) => ({ received: Number(l.qtyReceived), remaining: Number(l.qtyRemaining), unitCost: Number(l.unitCost), acquiredAt: l.acquiredAt.toISOString().slice(0, 10) }));
    });
  }

  async function entriesNamed(fragment: string): Promise<number> {
    return tenantPrisma.runInTenantContext(companyId, (tx) => tx.journalEntry.count({ where: { memo: { contains: fragment } } }));
  }

  function stockedPurchase(overrides: Record<string, unknown> = {}) {
    return { supplierId, date: today(), subtotal: 400, warehouseId, branchId, category: 'بضاعة', lines: [{ description: 'صنف', productId, quantity: 10, unitPrice: 40, taxRate: 15 }], ...overrides };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'goods-receipts');
    token = company.token;
    companyId = company.companyId;
    other = await registerIsolatedCompany(app, 'goods-receipts-other');

    const suffix = Date.now();
    supplierId = (await post('/suppliers').send({ name: `مورّد استلام ${suffix}` }).expect(201)).body.id;
    customerId = (await post('/customers').send({ kind: 'NATURAL', name: `عميل استلام ${suffix}` }).expect(201)).body.id;
    warehouseId = (await post('/warehouses').send({ name: `مستودع استلام ${suffix}` }).expect(201)).body.id;
    branchId = (await post('/branches').send({ name: `فرع استلام ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف استلام ${suffix}`, price: 100, cost: 40 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await removeIsolatedCompany(app, legacyCompany);
    await app.close();
  });

  it('[SPEC 5.7] ① الضمنيُّ افتراضاً: استلامٌ كامل بتاريخ الشراء برقم GR، وقيدان، والوسيطُ يتصافى، والمطابقةُ صفر', async () => {
    const before = await ledger();
    const created = await post('/purchases').send(stockedPurchase()).expect(201);
    const purchaseId: string = created.body.id;

    const listed = await get(`/purchases/${purchaseId}/receipts`).expect(200);
    expect(listed.body.receipts).toHaveLength(1);
    const receipt = listed.body.receipts[0];
    expect(receipt.implicit).toBe(true);
    expect(receipt.no).toMatch(/^GR-\d{4}-\d{4}$/);
    expect(receipt.receivedAt.slice(0, 10)).toBe(today());
    expect(receipt.lines).toHaveLength(1);
    expect(Number(receipt.lines[0].quantity)).toBe(10);
    expect(Number(receipt.lines[0].baseAmount)).toBe(400);
    expect(receipt.journalEntryId).toBeTruthy();
    expect(listed.body.remaining).toEqual([expect.objectContaining({ ordered: 10, received: 10, remaining: 0, baseAmount: 400, basePosted: 400 })]);

    // الرفُّ: طبقةٌ واحدة بتاريخ الاستلام وبالتكلفة.
    expect(await layersOf(productId)).toEqual([{ received: 10, remaining: 10, unitCost: 40, acquiredAt: today() }]);

    // الدفترُ: `1300` بالبضاعة، `2100` بالإجمالي، `1250` بالضريبة — والوسيطُ صفرٌ صافياً بقيدين لا قيد.
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(400);
    // الأرصدةُ بجانبها الطبيعيّ: الالتزامُ يزيد بالدائن.
    expect(delta(after, before, '2100')).toBe(460);
    expect(delta(after, before, '1250')).toBe(60);
    expect(await entriesNamed(`استلام ${receipt.no}`)).toBe(1);
    // قيدُ الفاتورة يبدأ بها؛ وقيدُ الاستلام يذكرها في مذكّرته فلا يُعدّ معها.
    expect(await tenantPrisma.runInTenantContext(companyId, (tx) => tx.journalEntry.count({ where: { memo: { startsWith: `فاتورة شراء ${created.body.no}` } } }))).toBe(1);

    const rec = await reconciliation();
    expect(rec.account).not.toBeNull();
    expect(rec.account!.code).toMatch(/^21[0-9]{2}$/);
    expect(Number(rec.account!.code)).toBeGreaterThanOrEqual(2101);
    expect(delta(after, before, rec.account!.code)).toBe(0);
    expect(rec).toEqual(expect.objectContaining({ ledgerBalance: 0, expected: 0, difference: 0, invoicedNotReceived: 0, receivedNotInvoiced: 0, linesOpen: 0 }));
  });

  it('[SPEC 5.7] ② `receiveNow: false`: فاتورةٌ بلا رفّ — لا طبقة، والوسيطُ مدينٌ بما فُوتر ولم يُستلم، والمطابقةُ تعدّه', async () => {
    const before = await ledger();
    const created = await post('/purchases')
      .send(stockedPurchase({ subtotal: 500, lines: [{ description: 'صنف', productId, quantity: 5, unitPrice: 100, taxRate: 15 }], receiveNow: false }))
      .expect(201);
    const listed = await get(`/purchases/${created.body.id}/receipts`).expect(200);
    expect(listed.body.receipts).toHaveLength(0);
    expect(listed.body.remaining).toEqual([expect.objectContaining({ ordered: 5, received: 0, remaining: 5, baseAmount: 500, basePosted: 0 })]);
    // لا طبقةَ جديدة — ① وحدَها على الرفّ.
    expect(await layersOf(productId)).toHaveLength(1);

    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(0);
    expect(delta(after, before, '2100')).toBe(575);
    const rec = await reconciliation();
    // رصيدُ الوسيط دائناً موجباً: −500 = مدينٌ بخمسمئة (مفوتَرٌ لم يُستلم).
    expect(rec).toEqual(expect.objectContaining({ ledgerBalance: -500, expected: -500, difference: 0, invoicedNotReceived: 500, receivedNotInvoiced: 0, linesOpen: 1 }));
    expect(delta(after, before, rec.account!.code)).toBe(-500);
  });

  it('[SPEC 5.7] ③ الاستلامُ الجزئيّ ثم المكمِّل: الطبقةُ بتاريخ الوصول، والمكمِّلُ يرحّل الفرقَ — 3 × 0.333 تتصافى بلا هللة', async () => {
    const created = await post('/purchases')
      .send(stockedPurchase({ subtotal: 1, date: daysAgo(10), lines: [{ description: 'صنف', productId, quantity: 3, unitPrice: 0.333, taxRate: 15 }], receiveNow: false }))
      .expect(201);
    const purchaseId: string = created.body.id;
    const lineId: string = created.body.lines[0].id;
    const before = await ledger();

    const first = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: daysAgo(3), lines: [{ purchaseLineId: lineId, quantity: 1 }] }).expect(201);
    expect(first.body.implicit).toBe(false);
    expect(first.body.no).toMatch(/^GR-\d{4}-\d{4}$/);
    expect(Number(first.body.lines[0].baseAmount)).toBe(0.33);
    const second = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: daysAgo(2), lines: [{ purchaseLineId: lineId, quantity: 1 }] }).expect(201);
    expect(Number(second.body.lines[0].baseAmount)).toBe(0.33);
    // بعد اثنين: بقي 1 — والمطابقةُ تحمل الفرق 0.34 لا 0.33.
    let rec = await reconciliation();
    expect(rec.invoicedNotReceived).toBe(500.34);
    expect(rec.difference).toBe(0);
    const third = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: daysAgo(1), lines: [{ purchaseLineId: lineId, quantity: 1 }] }).expect(201);
    // المكمِّلُ يرحّل ما بقي: 1.00 − 0.66 = 0.34.
    expect(Number(third.body.lines[0].baseAmount)).toBe(0.34);

    // الرفُّ: ثلاثُ طبقاتٍ بتواريخ الوصول لا بتاريخ الفاتورة (قبل عشرة أيام).
    const layers = await layersOf(productId);
    expect(layers.slice(-3).map((l) => l.acquiredAt)).toEqual([daysAgo(3), daysAgo(2), daysAgo(1)]);
    expect(layers.slice(-3).map((l) => l.received)).toEqual([1, 1, 1]);

    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(1);
    rec = await reconciliation();
    // ② وحدَها مفتوحة (500) — وسطرُ الأجزاء الثلاثة أُقفل بلا هللة.
    expect(rec).toEqual(expect.objectContaining({ invoicedNotReceived: 500, linesOpen: 1, difference: 0 }));
    const listed = await get(`/purchases/${purchaseId}/receipts`).expect(200);
    expect(listed.body.receipts.map((r: { no: string }) => r.no)).toEqual([first.body.no, second.body.no, third.body.no]);
    expect(listed.body.remaining).toEqual([expect.objectContaining({ ordered: 3, received: 3, remaining: 0, baseAmount: 1, basePosted: 1 })]);
  });

  it('[SPEC 5.7] ④ الحدودُ المسمّاة: فوق المتبقّي · خدميّ · من شراءٍ آخر · مكرَّر · على إشعار — ولا يُكتب شيء', async () => {
    const created = await post('/purchases')
      .send(stockedPurchase({ subtotal: 250, lines: [{ description: 'صنف', productId, quantity: 2, unitPrice: 100, taxRate: 15 }, { description: 'خدمة نقل', quantity: 1, unitPrice: 50, taxRate: 15 }], receiveNow: false }))
      .expect(201);
    const purchaseId: string = created.body.id;
    const stockedLine: string = created.body.lines.find((l: { productId: string | null }) => l.productId).id;
    const serviceLine: string = created.body.lines.find((l: { productId: string | null }) => !l.productId).id;
    const foreign = await post('/purchases').send(stockedPurchase({ receiveNow: false })).expect(201);
    const recBefore = await reconciliation();

    const over = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: stockedLine, quantity: 3 }] });
    expect(over.status).toBe(409);
    expect(String(over.body.message)).toContain('goodsReceipts.exceeds_remaining');
    const service = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: serviceLine, quantity: 1 }] });
    expect(service.status).toBe(400);
    expect(String(service.body.message)).toContain('goodsReceipts.line_not_stocked');
    const notMine = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: foreign.body.lines[0].id, quantity: 1 }] });
    expect(notMine.status).toBe(400);
    const repeated = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: stockedLine, quantity: 1 }, { purchaseLineId: stockedLine, quantity: 1 }] });
    expect(repeated.status).toBe(400);
    expect(String(repeated.body.message)).toContain('goodsReceipts.line_repeated');

    // على إشعار مورّد لا يُسجَّل استلام — الإشعارُ على شراءٍ مستلَم (① أو غيره) صفٌّ في جدول الشراء بنوعه.
    const received = await post('/purchases').send(stockedPurchase({ subtotal: 100, lines: [{ description: 'صنف', productId, quantity: 1, unitPrice: 100, taxRate: 15 }] })).expect(201);
    const note = await post(`/purchases/${received.body.id}/supplier-debit-note`).send({ reason: 'فوترة إضافية', lines: [{ description: 'زيادة', quantity: 1, unitPrice: 5 }] }).expect(201);
    const onNote = await post(`/purchases/${note.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: stockedLine, quantity: 1 }] });
    expect(onNote.status).toBe(409);

    // لا شيءَ كُتب: المطابقةُ كما كانت إلا ما أضافه الشراءان الجديدان (غيرُ المستلَم منهما).
    const recAfter = await reconciliation();
    expect(recAfter.difference).toBe(0);
    expect(recAfter.invoicedNotReceived).toBe(recBefore.invoicedNotReceived);
    expect((await get(`/purchases/${purchaseId}/receipts`).expect(200)).body.receipts).toHaveLength(0);
  });

  it('[SPEC 5.7] ⑤ الإلغاءُ عكسٌ لا محو: الطبقةُ تُفرَغ بحركةٍ خارجة والقيدُ يُعكس والمطابقةُ صفر — ولا يُلغى ما استُهلك، وبنودُ الشراء مجمَّدةٌ حتى يُعكس المسجَّل', async () => {
    const created = await post('/purchases')
      .send(stockedPurchase({ subtotal: 400, lines: [{ description: 'صنف', productId, quantity: 4, unitPrice: 100, taxRate: 15 }], receiveNow: false }))
      .expect(201);
    const purchaseId: string = created.body.id;
    const lineId: string = created.body.lines[0].id;
    const receipt = await post(`/purchases/${purchaseId}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 4 }] }).expect(201);

    // بنودُ الشراء مجمَّدةٌ وعليه استلامٌ مسجَّل — الرسالةُ تسمّي المخرج.
    const frozen = await patch(`/purchases/${purchaseId}`).send({ subtotal: 300, lines: [{ description: 'صنف', productId, quantity: 3, unitPrice: 100, taxRate: 15 }] });
    expect(frozen.status).toBe(409);
    expect(String(frozen.body.message)).toContain('purchases.lines_frozen_after_receipt');

    const before = await ledger();
    const recBefore = await reconciliation();
    await del(`/purchases/${purchaseId}/receipts/${receipt.body.id}`).expect(204);
    const after = await ledger();
    expect(delta(after, before, '1300')).toBe(-400);
    const recAfter = await reconciliation();
    expect(recAfter.difference).toBe(0);
    expect(recAfter.invoicedNotReceived).toBe(Number((recBefore.invoicedNotReceived + 400).toFixed(2)));
    const shelf = await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const gr = await tx.goodsReceipt.findUniqueOrThrow({ where: { id: receipt.body.id }, include: { lines: true } });
      const movements = await tx.stockMovement.findMany({ where: { goodsReceiptLineId: gr.lines[0].id }, orderBy: { createdAt: 'asc' }, select: { type: true, qty: true, purchaseLineId: true } });
      const layer = await tx.inventoryLayer.findFirst({ where: { sourceMovement: { goodsReceiptLineId: gr.lines[0].id } } });
      return { voided: gr.voidedAt !== null, movements: movements.map((m) => ({ type: m.type, qty: Number(m.qty), purchaseLineId: m.purchaseLineId })), remaining: Number(layer!.qtyRemaining) };
    });
    expect(shelf).toEqual({ voided: true, movements: [{ type: 'IN', qty: 4, purchaseLineId: lineId }, { type: 'OUT', qty: 4, purchaseLineId: lineId }], remaining: 0 });
    expect((await del(`/purchases/${purchaseId}/receipts/${receipt.body.id}`)).status).toBe(409);

    // بعد العكس تُعدَّل البنود — ويبقى الشراءُ غيرَ مستلَم (لم يكن ضمنيّاً).
    await patch(`/purchases/${purchaseId}`).send({ subtotal: 300, lines: [{ description: 'صنف', productId, quantity: 3, unitPrice: 100, taxRate: 15 }] }).expect(200);
    const listed = await get(`/purchases/${purchaseId}/receipts`).expect(200);
    expect(listed.body.receipts.filter((r: { voidedAt: string | null }) => r.voidedAt === null)).toHaveLength(0);
    expect(listed.body.remaining).toEqual([expect.objectContaining({ ordered: 3, received: 0, remaining: 3 })]);
    expect((await reconciliation()).difference).toBe(0);

    // ولا يُلغى ما استُهلك منه: صنفٌ جديد (فالبيعُ يستهلك أقدمَ طبقات الصنف — FIFO — لا هذه) ⟵ استلامٌ ثم بيعٌ منه ثم إلغاء ⟵ 409 مسمّى.
    const productB: string = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف استهلاك ${Date.now()}`, price: 100, cost: 40 }).expect(201)).body.id;
    const pending = await post('/purchases').send(stockedPurchase({ subtotal: 300, lines: [{ description: 'صنف', productId: productB, quantity: 3, unitPrice: 100, taxRate: 15 }], receiveNow: false })).expect(201);
    const again = await post(`/purchases/${pending.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: pending.body.lines[0].id, quantity: 3 }] }).expect(201);
    await post('/invoices').send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId: productB, quantity: 1, unitPrice: 150, taxRate: 15 }] }).expect(201);
    const consumed = await del(`/purchases/${pending.body.id}/receipts/${again.body.id}`);
    expect(consumed.status).toBe(409);
    expect(String(consumed.body.message)).toContain('purchases.frozen_after_consumption');
    expect((await reconciliation()).difference).toBe(0);
  });

  it('[SPEC 5.7] ⑥ إشعارُ المورّد على سطرٍ لم يُستلم كاملاً أو استُلم على مرّتين يُردّ مسمّىً — حدٌّ معلَن لا صامت', async () => {
    const pending = await post('/purchases')
      .send(stockedPurchase({ subtotal: 200, lines: [{ description: 'صنف', productId, quantity: 2, unitPrice: 100, taxRate: 15 }], receiveNow: false }))
      .expect(201);
    const notReceived = await post(`/purchases/${pending.body.id}/supplier-credit-note`).send({ reason: 'تخفيض', lines: [{ description: 'تخفيض', quantity: 1, unitPrice: 10, returnsPurchaseLineId: pending.body.lines[0].id }] });
    expect(notReceived.status).toBe(400);
    expect(String(notReceived.body.message)).toContain('supplierNotes.line_not_received');

    const split = await post('/purchases')
      .send(stockedPurchase({ subtotal: 200, lines: [{ description: 'صنف', productId, quantity: 2, unitPrice: 100, taxRate: 15 }], receiveNow: false }))
      .expect(201);
    const lineId: string = split.body.lines[0].id;
    await post(`/purchases/${split.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 1 }] }).expect(201);
    await post(`/purchases/${split.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 1 }] }).expect(201);
    const multi = await post(`/purchases/${split.body.id}/supplier-credit-note`).send({ reason: 'إعادة', lines: [{ description: 'إعادة', quantity: 1, unitPrice: 100, returnsPurchaseLineId: lineId, goodsReturned: true }] });
    expect(multi.status).toBe(400);
    expect(String(multi.body.message)).toContain('supplierNotes.line_multi_receipt');
    expect((await reconciliation()).difference).toBe(0);
  });

  it('[SPEC 5.7] ⑦ العزل: منشأةٌ أخرى لا ترى الاستلامَ ولا تسجّله ولا تُلغيه — 404 لا 403', async () => {
    const created = await post('/purchases').send(stockedPurchase({ receiveNow: false })).expect(201);
    const lineId: string = created.body.lines[0].id;
    expect((await get(`/purchases/${created.body.id}/receipts`, other!.token)).status).toBe(404);
    expect((await post(`/purchases/${created.body.id}/receipts`, other!.token).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 1 }] })).status).toBe(404);
    const mine = await post(`/purchases/${created.body.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: lineId, quantity: 10 }] }).expect(201);
    expect((await del(`/purchases/${created.body.id}/receipts/${mine.body.id}`, other!.token)).status).toBe(404);
    // ومطابقةُ الأخرى فارغةٌ لا تقرأ وسيطَنا.
    const theirs = await get('/purchases/receipts/reconciliation', other!.token).expect(200);
    expect(theirs.body).toEqual(expect.objectContaining({ account: null, ledgerBalance: 0, expected: 0, difference: 0, linesOpen: 0 }));
  });

  it('[SPEC 5.7] ⑧ القائم: صفوفُ ما قبل البناء تُكتب من حركاتها بالهجرة نفسِها (حالةٌ معلومة في معاملةٍ تُرجَع)، وقيدُ استلامها يُكتب حين يُعاد ترحيلُ شرائها', async () => {
    legacyCompany = await registerIsolatedCompany(app, 'goods-receipts-legacy');
    const t = legacyCompany.token;
    const cid = legacyCompany.companyId;
    const suffix = Date.now();
    const sup = (await post('/suppliers', t).send({ name: `مورّد قديم ${suffix}` }).expect(201)).body.id;
    const wh = (await post('/warehouses', t).send({ name: `مستودع قديم ${suffix}` }).expect(201)).body.id;
    const br = (await post('/branches', t).send({ name: `فرع قديم ${suffix}`, warehouseId: wh }).expect(201)).body.id;
    const prod = (await post('/products', t).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف قديم ${suffix}`, price: 100, cost: 40 }).expect(201)).body.id;
    const created = await post('/purchases', t)
      .send({ supplierId: sup, date: daysAgo(5), subtotal: 400, warehouseId: wh, branchId: br, category: 'بضاعة', lines: [{ description: 'صنف', productId: prod, quantity: 10, unitPrice: 40, taxRate: 15 }] })
      .expect(201);
    const purchaseId: string = created.body.id;
    const lineId: string = created.body.lines[0].id;

    // كتلةُ الترحيل الرجعيّ **من نصّ الهجرة نفسِه** — لا نسخةٌ تُكتب هنا فتفترق عن المصدر.
    const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20260919140000_goods_receipts', 'migration.sql'), 'utf8').replace(/\r\n/g, '\n');
    const start = sql.indexOf('DO $$');
    const end = sql.indexOf('END $$;', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const doBlock = sql.slice(start, end + 'END $$;'.length);
    expect(doBlock).toContain('RAISE WARNING');

    const replay = await tenantPrisma.runInTenantContext(cid, async (tx) => {
      // الحالةُ المعلومة: حركةُ إدخالٍ بلا سطرِ استلام (كما كان القائمُ قبل البناء) — يُفكّ الرابطُ وتُحذف صفوفُ الاستلام.
      await tx.$executeRaw`UPDATE stock_movements SET "goodsReceiptLineId" = NULL WHERE "purchaseLineId" = ${lineId}`;
      await tx.$executeRaw`DELETE FROM goods_receipt_lines WHERE "purchaseLineId" = ${lineId}`;
      await tx.$executeRaw`DELETE FROM goods_receipts WHERE "purchaseId" = ${purchaseId}`;
      const beforeReplay = await tx.goodsReceipt.count({ where: { purchaseId } });
      await tx.$executeRawUnsafe(doBlock);
      // الكتلةُ تدور على المنشآت كلِّها وتترك سياقَ آخرِها — فيُعاد سياقُنا قبل القراءة، وإلا قرأت RLS منشأةً أخرى
      // (سقط مرّةً بعد مرورين — ترتيبُ المنشآت غيرُ محدَّد؛ §8.13: مجسٌّ يمرّ مرّةً ليس مجسّاً).
      await tx.$executeRaw`SELECT set_config('app.company_id', ${cid}, true)`;
      const receipts = await tx.goodsReceipt.findMany({ where: { purchaseId }, include: { lines: true } });
      const movement = await tx.stockMovement.findFirst({ where: { purchaseLineId: lineId, type: 'IN', origin: 'RECEIPT' }, select: { goodsReceiptLineId: true, date: true, warehouseId: true } });
      // ثم تُرجَع المعاملة — الحالةُ الحقيقية (① بقيدها) لا تُمسّ.
      throw Object.assign(new Error('rollback'), { replay: { beforeReplay, receipts, movement } });
    }).catch((e: Error & { replay?: unknown }) => e.replay as { beforeReplay: number; receipts: { no: string; implicit: boolean; receivedAt: Date; warehouseId: string; journalEntryId: string | null; lines: { id: string; quantity: unknown; baseAmount: unknown }[] }[]; movement: { goodsReceiptLineId: string | null; date: Date; warehouseId: string } | null });
    expect(replay.beforeReplay).toBe(0);
    expect(replay.receipts).toHaveLength(1);
    const rebuilt = replay.receipts[0];
    expect(rebuilt).toEqual(expect.objectContaining({ no: 'GR-' + daysAgo(5).slice(0, 4) + '-0001', implicit: true, warehouseId: wh, journalEntryId: null }));
    expect(rebuilt.receivedAt.toISOString().slice(0, 10)).toBe(daysAgo(5));
    expect(Number(rebuilt.lines[0].quantity)).toBe(10);
    expect(Number(rebuilt.lines[0].baseAmount)).toBe(400);
    expect(replay.movement!.goodsReceiptLineId).toBe(rebuilt.lines[0].id);
    // والحالةُ الحقيقية بعد الإرجاع كما كانت.
    const real = await get(`/purchases/${purchaseId}/receipts`, t).expect(200);
    expect(real.body.receipts).toHaveLength(1);
    expect(real.body.receipts[0].journalEntryId).toBeTruthy();

    // وقيدُ الاستلام القديم يُكتب حين يُعاد ترحيلُ شرائه: نُحاكي «استلامٌ بلا قيد» بعكس قيده وتفريغ مؤشّره،
    // ثم تعديلٌ يمسّ القيد (التاريخ) ⟵ الشراءُ على الوسيط واستلامُه على 1300، فالمطابقةُ صفر.
    await tenantPrisma.runInTenantContext(cid, async (tx) => {
      const gr = await tx.goodsReceipt.findFirstOrThrow({ where: { purchaseId } });
      await postReversalEntry(tx, cid, { entryId: gr.journalEntryId!, date: new Date(), memo: 'محاكاةُ استلامٍ رُحِّل داخل قيد شرائه' });
      await tx.goodsReceipt.update({ where: { id: gr.id }, data: { journalEntryId: null } });
    });
    const ledgerOf = async () => Object.fromEntries(((await get('/accounts', t).expect(200)).body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
    const before = await ledgerOf();
    await patch(`/purchases/${purchaseId}`).set('Authorization', `Bearer ${t}`).send({ date: daysAgo(4) }).expect(200);
    const after = await ledgerOf();
    expect(delta(after, before, '1300')).toBe(400);
    const gr = await get(`/purchases/${purchaseId}/receipts`, t).expect(200);
    expect(gr.body.receipts[0].journalEntryId).toBeTruthy();
    const rec = await get('/purchases/receipts/reconciliation', t).expect(200);
    expect(rec.body).toEqual(expect.objectContaining({ difference: 0, invoicedNotReceived: 0, linesOpen: 0 }));
  });
});
