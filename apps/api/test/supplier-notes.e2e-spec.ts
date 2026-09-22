import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (33.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(105000);

/**
 * ⚖️ **إشعارُ المورّد — الحارسُ الحيّ يقرأ الدفترَ والرفَّ والضريبةَ معاً في كلّ مرحلة** (`ق-١٠٠٨`/٢).
 *
 * المبادئُ الستّة (`ق-١٠٠٦`): ① مستندُه يُسجَّل بمرجعه الخارجيّ وقيدُه قيدُنا · ② مرحَّلٌ يُعكس ولا يُحذف
 * ولا يُعدَّل · ③ الرفُّ على طبقة الاستلام الأصلية — خروجاً بحدّ ما عليه · ④ ضريبةُ المدخلات بإشارتها
 * في فترة الإشعار · ⑤ السقفُ من الأصل وما سبق يُخصم · ⑥ ما استُهلك لا يُعاد.
 *
 * منشأةٌ معزولة (`ق-٧٢٢`) — الأرقامُ محسوبةٌ يداً: شراءُ ١٠ بـ٤٠ · إعادةُ ٤ · بيعُ ٣ · تخفيضُ ٢ على ٦ ·
 * زيادةُ ١ على ١٠. وكلُّ مرحلةٍ تُقرأ ثلاثاً: أرصدةُ الحسابات (`/accounts`) · الطبقةُ والحركاتُ والاستهلاكات
 * · وإقرارُ الضريبة (`/obligations/vat-declaration`).
 */
describe('إشعارُ المورّد — الدفترُ والرفُّ والضريبةُ معاً (e2e)', () => {
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
  let purchaseLineId: string;
  let priceNoteId: string;
  const UNIT_COST = 40;
  const today = () => new Date().toISOString().slice(0, 10);

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const get = (path: string) => auth(request(app.getHttpServer()).get(path));
  const post = (path: string) => auth(request(app.getHttpServer()).post(path));

  /** الدفتر: رصيدُ كلّ حساب بإشارته الطبيعية (الأصلُ والمصروفُ مدينان، والالتزامُ دائن). */
  async function ledger(): Promise<Record<string, number>> {
    const res = await get('/accounts').expect(200);
    return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
  }

  /** الرفّ: الطبقةُ الوحيدة للصنف بكميّتها وتكلفتها، وحركاتُه، واستهلاكاتُ الطبقة. */
  async function shelf() {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layers = await tx.inventoryLayer.findMany({ where: { productId }, orderBy: { createdAt: 'asc' } });
      const movements = await tx.stockMovement.findMany({ where: { productId }, orderBy: { createdAt: 'asc' }, select: { type: true, origin: true, qty: true, purchaseLineId: true, invoiceLineId: true, reason: true } });
      const consumptions = await tx.inventoryConsumption.findMany({ where: { layer: { productId } }, orderBy: { createdAt: 'asc' }, select: { qty: true, unitCost: true } });
      return {
        layers: layers.map((l) => ({ received: Number(l.qtyReceived), remaining: Number(l.qtyRemaining), unitCost: Number(l.unitCost) })),
        movements: movements.map((m) => ({ ...m, qty: Number(m.qty) })),
        consumptions: consumptions.map((c) => ({ qty: Number(c.qty), unitCost: Number(c.unitCost) })),
      };
    });
  }

  async function stockOf(): Promise<number> {
    const res = await get('/inventory/stock-levels').expect(200);
    const row = (res.body as { productId: string; warehouseId: string; qty: number }[]).find((r) => r.productId === productId && r.warehouseId === warehouseId);
    return row ? Number(row.qty) : 0;
  }

  /** الإقرار: مشترياتُ الربع الخاضعةُ وضريبتُها — الإشعارُ الدائن يدخل بإشارته في ربعِ تاريخه. */
  async function vat() {
    const d = new Date();
    const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    const res = await get(`/obligations/vat-declaration?year=${d.getUTCFullYear()}&quarter=${quarter}`).expect(200);
    return { standard: Number(res.body.purchasesStandard), tax: Number(res.body.purchasesStandardVat), count: Number(res.body.purchaseCount) };
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

    company = await registerIsolatedCompany(app, 'supplier-notes');
    token = company.token;
    companyId = company.companyId;
    other = await registerIsolatedCompany(app, 'supplier-notes-other');

    const suffix = Date.now();
    supplierId = (await post('/suppliers').send({ name: `مورّد إشعارات ${suffix}` }).expect(201)).body.id;
    customerId = (await post('/customers').send({ kind: 'NATURAL', name: `عميل إشعارات ${suffix}` }).expect(201)).body.id;
    warehouseId = (await post('/warehouses').send({ name: `مستودع إشعارات ${suffix}` }).expect(201)).body.id;
    branchId = (await post('/branches').send({ name: `فرع إشعارات ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف إشعارات ${suffix}`, price: 100, cost: UNIT_COST }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, other);
    await app.close();
  });

  it('① شراءُ ١٠ بـ٤٠ برقم فاتورة المورّد مرجعاً خارجياً — الدفترُ والرفُّ والإقرار', async () => {
    const before = await snapshot();
    const res = await post('/purchases')
      .send({ supplierId, date: today(), subtotal: 10 * UNIT_COST, warehouseId, branchId, supplierRef: 'SUP-INV-2026-77', category: 'بضاعة', lines: [{ description: 'صنفٌ مخزني', productId, quantity: 10, unitPrice: UNIT_COST, taxRate: 15 }] })
      .expect(201);
    purchaseId = res.body.id;
    purchaseLineId = res.body.lines[0].id;
    expect(res.body.docType).toBe('PURCHASE');
    expect(res.body.supplierRef).toBe('SUP-INV-2026-77');
    expect(res.body.journalEntryId).toBeTruthy();

    const after = await snapshot();
    // الدفتر: المخزون 400 · المدخلات 60 · الذمّة 460 · ولا تكلفةَ مبيعات
    expect(delta(after.ledger, before.ledger, '1300')).toBe(400);
    expect(delta(after.ledger, before.ledger, '1250')).toBe(60);
    expect(delta(after.ledger, before.ledger, '2100')).toBe(460);
    expect(delta(after.ledger, before.ledger, '5100')).toBe(0);
    // الرفّ: طبقةٌ واحدة بعشرٍ بتكلفة 40
    expect(after.shelf.layers).toEqual([{ received: 10, remaining: 10, unitCost: 40 }]);
    expect(after.stock).toBe(10);
    // الإقرار: 400 خاضعةً و60 ضريبةً
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(400, 2);
    expect(after.vat.tax - before.vat.tax).toBeCloseTo(60, 2);
  }, 30000);

  it('[SPEC 30.1] ② إعادةُ ٤ إلى المورّد بإشعاره الدائن — تخرج من طبقتها الأصلية، والذمّةُ والمدخلاتُ والإقرارُ تنخفض بإشارتها', async () => {
    const before = await snapshot();
    const res = await post(`/purchases/${purchaseId}/supplier-credit-note`)
      .send({ reason: 'إعادة أربع وحدات', supplierRef: 'SUP-CN-9', lines: [{ description: 'إعادة', quantity: 4, unitPrice: UNIT_COST, returnsPurchaseLineId: purchaseLineId, goodsReturned: true }] })
      .expect(201);
    expect(res.body.docType).toBe('SUPPLIER_CREDIT_NOTE');
    expect(res.body.no).toMatch(/^SCN-/);
    expect(res.body.relatedPurchaseId).toBe(purchaseId);
    expect(res.body.supplierRef).toBe('SUP-CN-9');
    expect(res.body.status).toBe('PAID');
    expect(Number(res.body.total)).toBeCloseTo(184, 2);
    expect(res.body.journalEntryId).toBeTruthy();
    // الصنفُ انتقل إلى سطر الإشعار من أصله وإن أُغفل في الطلب
    expect(res.body.lines[0].productId).toBe(productId);

    const after = await snapshot();
    // الدفتر: الذمّة −184 · المدخلات −24 · المخزون −160 (٤ × تكلفة الطبقة) · ولا أثرَ على تكلفة المبيعات
    expect(delta(after.ledger, before.ledger, '2100')).toBe(-184);
    expect(delta(after.ledger, before.ledger, '1250')).toBe(-24);
    expect(delta(after.ledger, before.ledger, '1300')).toBe(-160);
    expect(delta(after.ledger, before.ledger, '5100')).toBe(0);
    // الرفّ: الطبقةُ نفسُها إلى ٦ — لا طبقةَ جديدة — بحركة OUT تحمل سطرَ الإشعار، واستهلاكٍ مسجَّلٍ صفّاً
    expect(after.shelf.layers).toEqual([{ received: 10, remaining: 6, unitCost: 40 }]);
    const out = after.shelf.movements.filter((m) => m.type === 'OUT');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ origin: 'RECEIPT', qty: 4, purchaseLineId: res.body.lines[0].id, reason: `إعادةٌ إلى المورّد ${res.body.no}` });
    expect(after.shelf.consumptions).toEqual([{ qty: 4, unitCost: 40 }]);
    expect(after.stock).toBe(6);
    // الإقرار: −160 و−24 في ربع الإشعار، والإشعارُ صفٌّ يُعدّ
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(-160, 2);
    expect(after.vat.tax - before.vat.tax).toBeCloseTo(-24, 2);
    expect(after.vat.count - before.vat.count).toBe(1);
    // القائمة: ما ائتمن به المورّد يخفّض متبقّي الأصل، والإشعارُ لا متبقّيَ عليه
    // ② الثلاثةُ نصٌّ بخانتين (`ق-١٢٣٥`) — تُقارَن حرفاً.
    const list = (await get('/purchases').expect(200)).body as { id: string; credited: string; remaining: string; allocated: string }[];
    expect(list.find((p) => p.id === purchaseId)).toMatchObject({ credited: '184.00', allocated: '0.00', remaining: '276.00' });
    expect(list.find((p) => p.id === res.body.id)).toMatchObject({ credited: '0.00', remaining: '0.00' });
  }, 30000);

  it('③ بعد بيع ٣: تخفيضُ سعرٍ بـ٢ على ٦ — ما على الرفّ يتبع طبقته وما استُهلك تكلفةُ مبيعاتٍ في فترة الإشعار', async () => {
    await post('/invoices')
      .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId, quantity: 3, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const afterSale = await snapshot();
    expect(afterSale.shelf.layers).toEqual([{ received: 10, remaining: 3, unitCost: 40 }]);
    expect(afterSale.stock).toBe(3);

    const res = await post(`/purchases/${purchaseId}/supplier-credit-note`)
      .send({ reason: 'تخفيض سعر ريالين للوحدة', lines: [{ description: 'تخفيض سعر', quantity: 6, unitPrice: 2, returnsPurchaseLineId: purchaseLineId }] })
      .expect(201);
    priceNoteId = res.body.id;
    expect(Number(res.body.total)).toBeCloseTo(13.8, 2);

    const after = await snapshot();
    // الدفتر: ٣ على الرفّ × ٢ = 6 من المخزون · ٣ مستهلَكة × ٢ = 6 من تكلفة المبيعات · المدخلات −1.8 · الذمّة −13.8
    expect(delta(after.ledger, afterSale.ledger, '1300')).toBe(-6);
    expect(delta(after.ledger, afterSale.ledger, '5100')).toBe(-6);
    expect(delta(after.ledger, afterSale.ledger, '1250')).toBe(-1.8);
    expect(delta(after.ledger, afterSale.ledger, '2100')).toBe(-13.8);
    // الرفّ: الكميةُ كما هي، وتكلفةُ الطبقة 38 — ولا حركةَ جديدة
    expect(after.shelf.layers).toEqual([{ received: 10, remaining: 3, unitCost: 38 }]);
    expect(after.shelf.movements).toHaveLength(afterSale.shelf.movements.length);
    expect(after.stock).toBe(3);
    // الإقرار: −12 و−1.8
    expect(after.vat.standard - afterSale.vat.standard).toBeCloseTo(-12, 2);
    expect(after.vat.tax - afterSale.vat.tax).toBeCloseTo(-1.8, 2);
  }, 30000);

  it('④ الرفضُ مسمّىً ولا أثرَ له: فوق المتبقّي · فوق ما على الرفّ · فوق ما استُلم · سطرٌ من شراءٍ آخر', async () => {
    const before = await snapshot();
    // السقفُ من الأصل (⑤): المتبقّي 460 − 184 − 13.8 = 262.2، وإشعارٌ بـ345 يتجاوزه
    const over = await post(`/purchases/${purchaseId}/supplier-credit-note`).send({ reason: 'زائد', lines: [{ description: 'زائد', quantity: 10, unitPrice: 30, returnsPurchaseLineId: purchaseLineId }] });
    expect(over.status).toBe(400);
    expect(String(over.body.message)).toContain('supplierNotes.exceeds_remaining');
    // ما استُهلك لا يُعاد (⑥): على الرفّ ٣ وإعادةُ ٤ تُرفض
    const beyondShelf = await post(`/purchases/${purchaseId}/supplier-credit-note`).send({ reason: 'إعادة فوق الرفّ', lines: [{ description: 'إعادة', quantity: 4, unitPrice: UNIT_COST, returnsPurchaseLineId: purchaseLineId, goodsReturned: true }] });
    expect(beyondShelf.status).toBe(400);
    expect(String(beyondShelf.body.message)).toContain('supplierNotes.return_exceeds_stock');
    // فوق ما استُلم في السطر
    const beyondReceived = await post(`/purchases/${purchaseId}/supplier-credit-note`).send({ reason: 'فوق المستلَم', lines: [{ description: 'إعادة', quantity: 11, unitPrice: 1, returnsPurchaseLineId: purchaseLineId }] });
    expect(beyondReceived.status).toBe(400);
    expect(String(beyondReceived.body.message)).toContain('supplierNotes.return_exceeds_received');
    // سطرٌ من شراءٍ آخر
    const otherPurchase = await post('/purchases').send({ supplierId, date: today(), subtotal: 50, lines: [{ description: 'خدمة', quantity: 1, unitPrice: 50 }] }).expect(201);
    const foreign = await post(`/purchases/${purchaseId}/supplier-credit-note`).send({ reason: 'سطرٌ غريب', lines: [{ description: 'إعادة', quantity: 1, unitPrice: 1, returnsPurchaseLineId: otherPurchase.body.lines[0].id }] });
    expect(foreign.status).toBe(400);
    expect(String(foreign.body.message)).toContain('supplierNotes.return_line_not_original');

    const after = await snapshot();
    // لا أثرَ في الدفتر ولا الرفّ ولا الإقرار — غير الشراء الخدميّ الشاهد (50 على فئته + 7.5 مدخلات = 57.5 ذمّة)
    for (const code of ['1300', '5100']) expect(delta(after.ledger, before.ledger, code)).toBe(0);
    expect(delta(after.ledger, before.ledger, '1250')).toBe(7.5);
    expect(delta(after.ledger, before.ledger, '2100')).toBe(57.5);
    expect(after.shelf).toEqual(before.shelf);
    expect(after.stock).toBe(before.stock);
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(50, 2);
  }, 30000);

  it('⑤ إشعارُ المورّد المدين بريالٍ على ١٠ — المرآة: الرفُّ يزيد تكلفته والمستهلَك تكلفةُ مبيعات، والذمّةُ تزيد وتُسدَّد', async () => {
    const before = await snapshot();
    const res = await post(`/purchases/${purchaseId}/supplier-debit-note`)
      .send({ reason: 'فرق سعر ريال للوحدة', supplierRef: 'SUP-DN-3', lines: [{ description: 'فرق سعر', quantity: 10, unitPrice: 1, returnsPurchaseLineId: purchaseLineId }] })
      .expect(201);
    expect(res.body.docType).toBe('SUPPLIER_DEBIT_NOTE');
    expect(res.body.no).toMatch(/^SDN-/);
    expect(res.body.status).toBe('DUE');
    expect(Number(res.body.total)).toBeCloseTo(11.5, 2);

    const after = await snapshot();
    // الدفتر: ٣ على الرفّ × ١ = 3 إلى المخزون · ٧ مستهلَكة (٤ أُعيدت + ٣ بيعت) × ١ = 7 تكلفةَ مبيعات · المدخلات +1.5 · الذمّة +11.5
    expect(delta(after.ledger, before.ledger, '1300')).toBe(3);
    expect(delta(after.ledger, before.ledger, '5100')).toBe(7);
    expect(delta(after.ledger, before.ledger, '1250')).toBe(1.5);
    expect(delta(after.ledger, before.ledger, '2100')).toBe(11.5);
    expect(after.shelf.layers).toEqual([{ received: 10, remaining: 3, unitCost: 39 }]);
    expect(after.stock).toBe(3);
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(10, 2);
    expect(after.vat.tax - before.vat.tax).toBeCloseTo(1.5, 2);
    // المدينُ يُسدَّد كالشراء: يظهر في فواتير المورّد المفتوحة بمتبقّيه — والدائنُ لا يظهر
    const open = (await get(`/supplier-payments/open-purchases/${supplierId}`).expect(200)).body as { id: string; remaining: string; docType: string }[];
    expect(open.find((p) => p.id === res.body.id)).toMatchObject({ docType: 'SUPPLIER_DEBIT_NOTE', remaining: '11.50' });
    expect(open.find((p) => p.id === purchaseId)).toMatchObject({ docType: 'PURCHASE', remaining: '262.20' });
    expect(open.some((p) => p.docType === 'SUPPLIER_CREDIT_NOTE')).toBe(false);
  }, 30000);

  it('⑥ مرحَّلٌ لا يُعدَّل ولا يُحذف — والتصحيحُ بإشعارٍ مقابل بسقفه، ولا بضاعةَ تُعاد على مدين', async () => {
    const before = await snapshot();
    const patch = await auth(request(app.getHttpServer()).patch(`/purchases/${priceNoteId}`)).send({ subtotal: 1 });
    expect(patch.status).toBe(409);
    expect(String(patch.body.message)).toContain('supplierNotes.immutable');
    const del = await auth(request(app.getHttpServer()).delete(`/purchases/${priceNoteId}`));
    expect(del.status).toBe(409);
    // الأصلُ الذي صدرت عليه إشعاراتٌ يبقى
    const delOriginal = await auth(request(app.getHttpServer()).delete(`/purchases/${purchaseId}`));
    expect(delOriginal.status).toBe(409);
    expect(String(delOriginal.body.message)).toContain('purchases.has_notes');
    // دائنٌ على دائن: يعكس مرّتين — مرفوض
    const creditOnCredit = await post(`/purchases/${priceNoteId}/supplier-credit-note`).send({ reason: 'دائن على دائن' });
    expect(creditOnCredit.status).toBe(400);
    expect(String(creditOnCredit.body.message)).toContain('supplierNotes.target_invalid');
    // مدينٌ ببضاعةٍ تُعاد — مرفوض
    const debitWithGoods = await post(`/purchases/${purchaseId}/supplier-debit-note`).send({ reason: 'بضاعة على مدين', lines: [{ description: 'x', quantity: 1, unitPrice: 1, returnsPurchaseLineId: purchaseLineId, goodsReturned: true }] });
    expect(debitWithGoods.status).toBe(400);
    expect(String(debitWithGoods.body.message)).toContain('supplierNotes.debit_no_goods');
    // مدينٌ يصحّح دائناً زائداً — بسقفِ ما بقي من الدائن (13.8): 23 يتجاوزه، و2.3 يمرّ ويعكس أثره على الفئة
    const overCorrection = await post(`/purchases/${priceNoteId}/supplier-debit-note`).send({ reason: 'تصحيح زائد', lines: [{ description: 'تصحيح', quantity: 1, unitPrice: 20 }] });
    expect(overCorrection.status).toBe(400);
    expect(String(overCorrection.body.message)).toContain('supplierNotes.exceeds_remaining');
    const unchanged = await snapshot();
    expect(unchanged.ledger).toEqual(before.ledger);
    expect(unchanged.shelf).toEqual(before.shelf);
    expect(unchanged.vat).toEqual(before.vat);

    const correction = await post(`/purchases/${priceNoteId}/supplier-debit-note`).send({ reason: 'الدائنُ زاد ريالين', lines: [{ description: 'تصحيح', quantity: 1, unitPrice: 2 }] }).expect(201);
    expect(correction.body.relatedPurchaseId).toBe(priceNoteId);
    const after = await snapshot();
    expect(delta(after.ledger, before.ledger, '2100')).toBe(2.3);
    expect(delta(after.ledger, before.ledger, '1250')).toBe(0.3);
    // بلا رابطِ سطرٍ أصليّ: لا رفَّ ولا مخزون — القيمةُ إلى حساب الفئة الموروثة («بضاعة» ⇒ `5100`)
    expect(delta(after.ledger, before.ledger, '1300')).toBe(0);
    expect(delta(after.ledger, before.ledger, '5100')).toBe(2);
    expect(after.shelf).toEqual(before.shelf);
    expect(after.vat.standard - before.vat.standard).toBeCloseTo(2, 2);
  }, 30000);

  it('⑦ العزل: منشأةٌ أخرى لا ترى الشراء ولا تُسجّل عليه إشعاراً', async () => {
    const foreign = await request(app.getHttpServer())
      .post(`/purchases/${purchaseId}/supplier-credit-note`)
      .set('Authorization', `Bearer ${other!.token}`)
      .send({ reason: 'من منشأةٍ أخرى' });
    expect(foreign.status).toBe(404);
    const list = (await request(app.getHttpServer()).get('/purchases').set('Authorization', `Bearer ${other!.token}`).expect(200)).body as { id: string }[];
    expect(list.some((p) => p.id === purchaseId)).toBe(false);
  }, 30000);
});
