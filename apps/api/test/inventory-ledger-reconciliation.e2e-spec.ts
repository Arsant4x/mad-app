import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { inventoryLedgerReconciliation, type InventoryLedgerReconciliation } from '../src/inventory/inventory-ledger-reconciliation.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (42.4 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(128000);

/**
 * 🔴 `ق-١٣٤٣` — **حارسُ المطابقة: رصيدُ `1300` ⇄ قيمةُ الطبقات**، قبل بناء «غير القابل للخصم» (`ق-١٣٤٢`).
 *
 * **بنصّ المالك**: «فيُبنى حارسٌ حيٌّ يقارن الرصيدَ بمجموع المتبقّي في تكلفته، ويسقط بفرق.»
 *
 * **① المساراتُ الموثَّقة — منشأةٌ معزولة تمرّ بها واحداً بعد آخر، والفرقُ يُقرأ بعد كلِّ خطوة ويجب أن يكون صفراً**:
 * رصيدٌ افتتاحيّ · شراءٌ باستلامٍ ضمنيّ · بيع · مرتجعُ بيعٍ سليم · شطب · تحويلٌ بين مستودعين · إشعارُ سعرٍ من المورّد ·
 * تكلفةٌ محمَّلة · بيعٌ بعد الرفع · إدخالٌ وإخراجٌ يدويّان وعكسُ الإخراج (معلَنةٌ بقرارها في `manualOneSided`) ·
 * إعادةُ بضاعةٍ إلى المورّد · شراءٌ باستلامٍ مسجَّلٍ ثم إلغاؤه.
 *
 * **② العيوبُ الثلاثة (`ق-١٣٤٤`) — تُقاس ولا تُصلَح**: منشأةٌ ثانية تبني ترتيبَها — بيعٌ ثم تحويلٌ ثم شطبٌ ثم مرتجعٌ ثم تكلفةٌ
 * محمَّلة ثم مرتجعٌ ثانٍ — **وتوكيداتُها تسجّل حجمَ كلِّ عيبٍ رقماً**: فحين يُصلَح البندُ المستقلّ يسقط توكيدُه ويُحدَّث.
 * ⚠️ **ومنها ما لا يراه الحارس**: التحويلُ والشطب يُسيئان توزيعَ الحصّة بين `1300` و`5100` و`5800` **والمجموعُ متطابق** —
 * فيُقاسان بالحسابات والطبقات لا بالفرق.
 */
describe('حارسُ المطابقة: رصيدُ 1300 ⇄ قيمةُ الطبقات (e2e · ق-١٣٤٣)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  const companies: IsolatedCompany[] = [];
  const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
  });

  afterAll(async () => {
    for (const c of companies) await removeIsolatedCompany(app, c);
    await app.close();
  });

  /** منشأةٌ معزولة بمورّدٍ وناقلٍ وعميلٍ ومستودعين وفرعٍ على الأوّل. */
  async function setUp(tag: string) {
    const company = await registerIsolatedCompany(app, tag);
    companies.push(company);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
    const get = (path: string) => auth(request(app.getHttpServer()).get(path));
    const post = (path: string) => auth(request(app.getHttpServer()).post(path));
    const del = (path: string) => auth(request(app.getHttpServer()).delete(path));
    const suffix = `${Date.now()}`;
    const supplierId = (await post('/suppliers').send({ name: `مورّد مطابقة ${suffix}` }).expect(201)).body.id as string;
    const carrierId = (await post('/suppliers').send({ name: `ناقل مطابقة ${suffix}` }).expect(201)).body.id as string;
    const customerId = (await post('/customers').send({ kind: 'NATURAL', name: `عميل مطابقة ${suffix}` }).expect(201)).body.id as string;
    const warehouseA = (await post('/warehouses').send({ name: `مستودع أ ${suffix}` }).expect(201)).body.id as string;
    const warehouseB = (await post('/warehouses').send({ name: `مستودع ب ${suffix}` }).expect(201)).body.id as string;
    const branchId = (await post('/branches').send({ name: `فرع مطابقة ${suffix}`, warehouseId: warehouseA }).expect(201)).body.id as string;
    const product = async (name: string, cost: number) =>
      (await post('/products').send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `${name} ${suffix}`, price: 150, cost }).expect(201)).body.id as string;

    const recon = (): Promise<InventoryLedgerReconciliation> => tenantPrisma.runInTenantContext(company.companyId, (tx) => inventoryLedgerReconciliation(tx));
    const ledger = async (): Promise<Record<string, number>> => {
      const res = await get('/accounts').expect(200);
      return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
    };
    const layersOf = (pid: string) =>
      tenantPrisma.runInTenantContext(company.companyId, async (tx) =>
        (await tx.inventoryLayer.findMany({ where: { productId: pid }, orderBy: [{ acquiredAt: 'asc' }, { createdAt: 'asc' }] })).map((l) => ({
          warehouseId: l.warehouseId,
          source: l.sourceType,
          remaining: Number(l.qtyRemaining),
          unitCost: Number(l.unitCost),
        })),
      );

    const buy = (pid: string, quantity: number, unitPrice: number, extra: Record<string, unknown> = {}) =>
      post('/purchases').send({ supplierId, date: today(), subtotal: quantity * unitPrice, warehouseId: warehouseA, branchId, category: 'بضاعة', lines: [{ description: 'صنف', productId: pid, quantity, unitPrice, taxRate: 15 }], ...extra });
    const sell = (pid: string, quantity: number) =>
      post('/invoices').send({ customerId, branchId, issueDate: today(), dueDate: today(), lines: [{ description: 'بيع', productId: pid, quantity, unitPrice: 150, taxRate: 15 }] });
    const returnSale = (invoice: { id: string; lines: { id: string }[] }, pid: string, quantity: number) =>
      post(`/invoices/${invoice.id}/credit-note`).send({
        reason: 'إرجاع بضاعة سليمة',
        lines: [{ description: 'مرتجع', productId: pid, quantity, unitPrice: 150, taxRate: 15, returnsLineId: invoice.lines[0].id, returnCondition: 'GOOD' }],
      });
    // الشطبُ يُسجَّل «بانتظار المراجعة» ولا يمسّ الرفَّ ولا الدفتر حتى يُعتمد (`PENDING_REVIEW` ⟵ `approve`) — فيُعتمد هنا.
    const writeOff = async (pid: string, qty: number) => {
      const created = await post('/inventory/write-offs').send({ productId: pid, warehouseId: warehouseA, branchId, qty, reasonCode: NO_ADJUSTMENT.code, occurredAt: today() }).expect(201);
      expect(created.body.status).toBe('PENDING_REVIEW');
      const approved = await post(`/inventory/write-offs/${created.body.id}/approve`).send({}).expect(201);
      expect(approved.body.status).toBe('APPROVED');
    };
    const move = (body: Record<string, unknown>) => post('/inventory/movements').send({ date: today(), ...body });
    const freight = async (amount: number) => {
      const res = await post('/purchases')
        .send({ supplierId: carrierId, date: today(), subtotal: amount, branchId, category: 'مصروفات أخرى', lines: [{ description: 'شحن', quantity: 1, unitPrice: amount, taxRate: 15 }] })
        .expect(201);
      return { id: res.body.id as string, lineId: res.body.lines[0].id as string };
    };
    const receiptOf = async (purchaseId: string) => (await get(`/purchases/${purchaseId}/receipts`).expect(200)).body.receipts[0].id as string;

    return { company, get, post, del, supplierId, warehouseA, warehouseB, branchId, product, recon, ledger, layersOf, buy, sell, returnSale, writeOff, move, freight, receiptOf };
  }

  describe('① المساراتُ الموثَّقة — الفرقُ صفرٌ بعد كلِّ خطوة', () => {
    let s: Awaited<ReturnType<typeof setUp>>;
    let p: string;
    let q: string;
    let purchase: { id: string; lines: { id: string }[] };
    let sale: { id: string; lines: { id: string }[] };
    let manualOutId: string;

    const balanced = async (step: string) => {
      const r = await s.recon();
      // الرسالةُ تسمّي الخطوة والأرقام — فالسقوطُ يقول أين افترق الحسابان وبكم.
      expect({ step, difference: r.difference }).toEqual({ step, difference: 0 });
      return r;
    };

    beforeAll(async () => {
      s = await setUp('ledger-recon');
      p = await s.product('صنف المطابقة', 40);
      q = await s.product('صنف الافتتاح', 4);
    });

    it('⓪ الرصيدُ الافتتاحيّ: قيدُ 1300/3900 وطبقتُه بالقيمة نفسِها', async () => {
      await s.post('/inventory/opening').send({ openingDate: today(), lines: [{ productId: q, warehouseId: s.warehouseA, qty: 10, unitCost: 4, acquiredAt: daysAgo(5) }] }).expect(201);
      const r = await balanced('opening');
      // مصادقةُ المسبار: يرى ما أُعلن — لا صفرَ على صفر.
      expect(r).toEqual(expect.objectContaining({ ledger: 40, layers: 40, manualOneSided: 0, openProvisional: 0 }));
    });

    it('① شراءٌ باستلامٍ ضمنيّ · ② بيع · ③ مرتجعٌ سليم · ④ شطب · ⑤ تحويل', async () => {
      purchase = (await s.buy(p, 10, 40).expect(201)).body;
      expect((await balanced('purchase')).layers).toBe(440);
      sale = (await s.sell(p, 3).expect(201)).body;
      expect((await balanced('sale')).layers).toBe(320);
      await s.returnSale(sale, p, 1).expect(201);
      expect((await balanced('sale-return')).layers).toBe(360);
      await s.writeOff(p, 1);
      expect((await balanced('write-off')).layers).toBe(320);
      await s.move({ productId: p, warehouseId: s.warehouseA, toWarehouseId: s.warehouseB, type: 'TRANSFER', qty: 2 }).expect(201);
      expect((await balanced('transfer')).layers).toBe(320);
    });

    it('⑥ إشعارُ سعرٍ من المورّد · ⑦ تكلفةٌ محمَّلة · ⑧ بيعٌ بعد الرفع', async () => {
      await s.post(`/purchases/${purchase.id}/supplier-credit-note`).send({ reason: 'تخفيض ريالين', lines: [{ description: 'تخفيض سعر', quantity: 10, unitPrice: 2, returnsPurchaseLineId: purchase.lines[0].id }] }).expect(201);
      await balanced('supplier-price-note');
      const f = await s.freight(100);
      await s.post(`/purchases/${f.id}/landed-costs`).send({ purchaseLineId: f.lineId, goodsReceiptIds: [await s.receiptOf(purchase.id)] }).expect(201);
      await balanced('landed-cost');
      await s.sell(p, 2).expect(201);
      await balanced('sale-after-raise');
    });

    it('⑨ إدخالٌ يدويّ · ⑩ إخراجٌ يدويّ · ⑪ عكسُه — تتحرّك الطبقاتُ بلا قيدٍ بقرارٍ قائم، ويُعلَن ذلك رقماً', async () => {
      await s.move({ productId: q, warehouseId: s.warehouseA, type: 'IN', qty: 5, unitCost: 4 }).expect(201);
      const afterIn = await balanced('manual-in');
      expect(afterIn.manualOneSided).toBe(20);
      manualOutId = (await s.move({ productId: q, warehouseId: s.warehouseA, type: 'OUT', qty: 2 }).expect(201)).body.id;
      expect((await balanced('manual-out')).manualOneSided).toBe(12);
      await s.post(`/inventory/movements/${manualOutId}/reverse`).send({}).expect(201);
      expect((await balanced('manual-out-reversed')).manualOneSided).toBe(20);
    });

    it('⑫ إعادةُ بضاعةٍ إلى المورّد · ⑬ شراءٌ باستلامٍ مسجَّلٍ ثم إلغاؤه', async () => {
      await s.post(`/purchases/${purchase.id}/supplier-credit-note`).send({ reason: 'إعادة وحدة', lines: [{ description: 'إعادة', quantity: 1, unitPrice: 40, returnsPurchaseLineId: purchase.lines[0].id, goodsReturned: true }] }).expect(201);
      await balanced('supplier-goods-return');
      const later = (await s.buy(p, 4, 50, { receiveNow: false }).expect(201)).body;
      await balanced('purchase-not-received');
      const receipt = (await s.post(`/purchases/${later.id}/receipts`).send({ receivedAt: today(), lines: [{ purchaseLineId: later.lines[0].id, quantity: 4 }] }).expect(201)).body;
      await balanced('registered-receipt');
      await s.del(`/purchases/${later.id}/receipts/${receipt.id}`).expect(204);
      await balanced('receipt-voided');
    });
  });

  describe('② العيوبُ الثلاثة (ق-١٣٤٤) — تُقاس ولا تُصلَح', () => {
    let s: Awaited<ReturnType<typeof setUp>>;
    let p: string;
    let sale: { id: string; lines: { id: string }[] };
    let landed: { cogs: number; writeOffAccount: number };

    beforeAll(async () => {
      s = await setUp('ledger-recon-defects');
      p = await s.product('صنف العيوب', 40);
      // طبقةٌ بعشر وحداتٍ بأربعين — ثم يغادرها: بيعٌ (٣) · تحويلٌ (٢) · شطبٌ (١) · ويعود واحدٌ من البيع.
      const purchase = (await s.buy(p, 10, 40).expect(201)).body;
      sale = (await s.sell(p, 3).expect(201)).body;
      await s.move({ productId: p, warehouseId: s.warehouseA, toWarehouseId: s.warehouseB, type: 'TRANSFER', qty: 2 }).expect(201);
      await s.writeOff(p, 1);
      await s.returnSale(sale, p, 1).expect(201);
      expect((await s.recon()).difference).toBe(0);

      // تكلفةٌ محمَّلة ١٠٠ على الاستلام: عشرةٌ للوحدة؛ على الرفّ خمسٌ (+٥٠ للطبقة) و«المستهلَكُ» خمسٌ (+٥٠ لـ5100).
      const before = await s.ledger();
      const f = await s.freight(100);
      await s.post(`/purchases/${f.id}/landed-costs`).send({ purchaseLineId: f.lineId, goodsReceiptIds: [await s.receiptOf(purchase.id)] }).expect(201);
      const after = await s.ledger();
      landed = { cogs: Number(((after['5100'] ?? 0) - (before['5100'] ?? 0)).toFixed(2)), writeOffAccount: Number(((after['5800'] ?? 0) - (before['5800'] ?? 0)).toFixed(2)) };
    });

    it('العيبُ الأوّل — التحويلُ «مستهلَك» وهو على رفٍّ آخر: حصّةُ وحدتَي التحويل (٢٠) ذهبت إلى 5100، وطبقةُ المقصِد بتكلفتها القديمة — والحارسُ لا يراه', async () => {
      const layers = await s.layersOf(p);
      const dest = layers.find((l) => l.warehouseId === s.warehouseB)!;
      expect(dest).toEqual(expect.objectContaining({ source: 'TRANSFER', remaining: 2, unitCost: 40 }));
      // الخمسُ «المستهلَكة» = بيعٌ صافٍ (٢) + تحويل (٢) + شطب (١): كلُّها إلى 5100 — ومنها ٢٠ حقُّها طبقةُ المقصِد.
      expect(landed.cogs).toBe(50);
      expect((await s.recon()).difference).toBe(0);
    });

    it('العيبُ الثاني — الإتلافُ يذهب إلى تكلفة المبيعات: حصّةُ الوحدة المشطوبة (١٠) في 5100 لا في 5800', async () => {
      expect(landed.writeOffAccount).toBe(0);
      expect(landed.cogs).toBe(50);
    });

    it('🔴 العيبُ الثالث — مرتجعُ البيع بعد الرفع لا يُعيد فرقَ الرفع: الطبقةُ تستقبل الوحدةَ بخمسين والدفترُ بأربعين — الحارسُ يراه −١٠', async () => {
      await s.returnSale(sale, p, 1).expect(201);
      const r = await s.recon();
      // حجمُ العيب رقماً: وحدةٌ × فرقُ الرفع (١٠) — يصير صفراً حين يُصلَح البندُ المستقلّ، فيسقط هذا التوكيدُ ويُحدَّث.
      expect(r.difference).toBe(-10);
    });
  });
});
