import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { inventoryLedgerReconciliation, type InventoryLedgerReconciliation } from '../src/inventory/inventory-ledger-reconciliation.util';
import { inventoryDistributionCheck, type InventoryDistributionCheck } from '../src/inventory/inventory-distribution.util';
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
 * تكلفةٌ محمَّلة · بيعٌ بعد الرفع · إدخالٌ وإخراجٌ يدويّان وعكسُ الإخراج (**قيدُها على `5810` منذ `ق-١٣٦٣` — والمعادلةُ صارمة**) ·
 * إعادةُ بضاعةٍ إلى المورّد · شراءٌ باستلامٍ مسجَّلٍ ثم إلغاؤه · إخراجٌ يدويٌّ وراء الرصيد يُسوّيه استلام (فرقُه على `5810` لا `5100`) ·
 * وقديمٌ بلا قيد **يُعدّ ولا يُطرح** (`legacyManualUnposted` — الفرقُ يساوي سالبَه).
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
    const distribution = (): Promise<InventoryDistributionCheck> => tenantPrisma.runInTenantContext(company.companyId, (tx) => inventoryDistributionCheck(tx));
    const ledger = async (): Promise<Record<string, number>> => {
      const res = await get('/accounts').expect(200);
      return Object.fromEntries((res.body as { code: string; balance: string }[]).map((a) => [a.code, Number(a.balance)]));
    };
    /** تغيُّرُ أرصدة الدليل حول فعلٍ واحد — لكلِّ رمزٍ بإشارته الطبيعية (المدينُ موجبٌ في الأصول والمصروفات). */
    const deltaOf = async (fn: () => Promise<void>) => {
      const before = await ledger();
      await fn();
      const after = await ledger();
      return (code: string) => Number(((after[code] ?? 0) - (before[code] ?? 0)).toFixed(2));
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
    // ق-١٣٧٧: السببُ إلزاميٌّ للحركة اليدوية — افتراضُ الاختبار، ويُطغى عليه بالجسم.
    const move = (body: Record<string, unknown>) => post('/inventory/movements').send({ date: today(), reason: 'اختبار — حركةٌ يدوية', ...body });
    const freight = async (amount: number) => {
      const res = await post('/purchases')
        .send({ supplierId: carrierId, date: today(), subtotal: amount, branchId, category: 'مصروفات أخرى', lines: [{ description: 'شحن', quantity: 1, unitPrice: amount, taxRate: 15 }] })
        .expect(201);
      return { id: res.body.id as string, lineId: res.body.lines[0].id as string };
    };
    const receiptOf = async (purchaseId: string) => (await get(`/purchases/${purchaseId}/receipts`).expect(200)).body.receipts[0].id as string;

    return { company, get, post, del, supplierId, warehouseA, warehouseB, branchId, product, recon, distribution, ledger, deltaOf, layersOf, buy, sell, returnSale, writeOff, move, freight, receiptOf };
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
      // ⚖️ ق-١٣٦٤ والحارسُ الثاني بعد كلِّ خطوة: القسمةُ المسجَّلة تطابق المشتقّة من الصفوف، والحسابان المخصوصان يطابقان سجلَّهما.
      const d = await s.distribution();
      expect({ step, findings: d.findings, writeOff: d.writeOff.difference, variance: d.variance.difference }).toEqual({ step, findings: [], writeOff: 0, variance: 0 });
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
      expect(r).toEqual(expect.objectContaining({ ledger: 40, layers: 40, openProvisional: 0, legacyManualUnposted: 0 }));
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

    it('⑨ إدخالٌ يدويّ · ⑩ إخراجٌ يدويّ · ⑪ عكسُه — ⚖️ ق-١٣٦٣: لكلٍّ قيدٌ على فروقات المخزون (5810) مقابل 1300 بما تحرّك في الطبقات', async () => {
      // ⓐ الإدخال: خمسٌ بأربعة ⟵ مدين 1300 / دائن 5810 بعشرين — والحركةُ تحمل قيدَها.
      let delta = await s.deltaOf(async () => {
        const inMove = (await s.move({ productId: q, warehouseId: s.warehouseA, type: 'IN', qty: 5, unitCost: 4 }).expect(201)).body;
        expect(typeof inMove.journalEntryId).toBe('string');
      });
      expect({ inv: delta('1300'), variance: delta('5810'), cogs: delta('5100') }).toEqual({ inv: 20, variance: -20, cogs: 0 });
      expect(await balanced('manual-in')).toEqual(expect.objectContaining({ legacyManualUnposted: 0, openProvisional: 0 }));

      // ⓑ الإخراج: اثنتان من طبقة الافتتاح (FIFO بأربعة) ⟵ مدين 5810 / دائن 1300 بثمانية — بتكلفة الطبقة لا البطاقة.
      delta = await s.deltaOf(async () => {
        manualOutId = (await s.move({ productId: q, warehouseId: s.warehouseA, type: 'OUT', qty: 2 }).expect(201)).body.id;
      });
      expect({ inv: delta('1300'), variance: delta('5810') }).toEqual({ inv: -8, variance: 8 });
      await balanced('manual-out');

      // ⓒ العكس: مرآةُ قيد أصله بما عاد إلى الطبقات.
      delta = await s.deltaOf(async () => {
        const rev = (await s.post(`/inventory/movements/${manualOutId}/reverse`).send({}).expect(201)).body;
        expect(typeof rev.journalEntryId).toBe('string');
      });
      expect({ inv: delta('1300'), variance: delta('5810') }).toEqual({ inv: 8, variance: -8 });
      expect((await balanced('manual-out-reversed')).legacyManualUnposted).toBe(0);
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

    it('⑭ إخراجٌ يدويٌّ وراء الرصيد ثم استلامٌ يسوّيه — المؤقّتُ مقيَّدٌ على 5810، وفرقُ تسويته على 5810 لا على تكلفة المبيعات (ق-١٣٦٣)', async () => {
      const r = await s.product('صنف المؤقّت اليدويّ', 10);
      // لا طبقةَ للصنف: الاثنتان مؤقّتتان ببطاقته (عشرة) — والقيدُ بهما.
      let delta = await s.deltaOf(async () => {
        await s.move({ productId: r, warehouseId: s.warehouseA, type: 'OUT', qty: 2 }).expect(201);
      });
      expect({ inv: delta('1300'), variance: delta('5810') }).toEqual({ inv: -20, variance: 20 });
      expect((await balanced('manual-out-provisional')).openProvisional).toBe(20);

      // يصل الشراءُ بخمسٍ باثني عشر: تُسوّى الاثنتان من طبقته (+٤ فرقاً) — على الفروقات، وتكلفةُ المبيعات لا تتحرّك.
      delta = await s.deltaOf(async () => {
        await s.buy(r, 5, 12).expect(201);
      });
      expect({ inv: delta('1300'), variance: delta('5810'), cogs: delta('5100') }).toEqual({ inv: 56, variance: 4, cogs: 0 });
      expect((await balanced('manual-provisional-settled')).openProvisional).toBe(0);
    });

    it('⑯ مؤقّتُ إخراجٍ يدويٍّ قديمٍ بلا قيد يُسوّيه استلام — قيمتُه كلُّها تخرج الآن على 5810 (حدثُ اليوم لا فرقٌ عن قيدٍ لم يقع)', async () => {
      const u = await s.product('صنف المؤقّت القديم', 10);
      // كما كتبته الشيفرةُ قبل ق-١٣٦٣: إخراجٌ يدويٌّ وراء الرصيد — استهلاكٌ مؤقّتٌ بالبطاقة (عشرة) بلا قيد.
      await tenantPrisma.runInTenantContext(s.company.companyId, async (tx) => {
        const m = await tx.stockMovement.create({
          data: { companyId: s.company.companyId, productId: u, warehouseId: s.warehouseA, type: 'OUT', qty: 2, date: new Date(), origin: 'MANUAL', reason: 'إخراجٌ قديمٌ بلا قيد' },
        });
        await tx.inventoryConsumption.create({ data: { companyId: s.company.companyId, layerId: null, movementId: m.id, qty: 2, unitCost: 10 } });
      });
      // لم يُقيَّد فلا يُعدّ في المؤقّت المفتوح، ولا طبقةَ حرّكها — الفرقُ صفر.
      expect(await balanced('legacy-provisional-open')).toEqual(expect.objectContaining({ openProvisional: 0, legacyManualUnposted: 0 }));

      const delta = await s.deltaOf(async () => {
        await s.buy(u, 5, 12).expect(201);
      });
      // الاستلامُ 60 على 1300، والتسويةُ تُخرج الوحدتين بقيمتهما كاملةً (24) على 5810 — لا فرقاً (4) عن مؤقّتٍ لم يُقيَّد أصلاً.
      expect({ inv: delta('1300'), variance: delta('5810'), cogs: delta('5100') }).toEqual({ inv: 36, variance: 24, cogs: 0 });
      await balanced('legacy-provisional-settled');
    });

    it('⑰ تحويلٌ وراء الرصيد ثم استلامٌ يسوّيه — التحويلُ ليس إخراجاً يدويّاً (مصدرُه MANUAL): فرقُه فرقٌ لا قيمتُه، و5810 لا تتحرّك', async () => {
      const v = await s.product('صنف التحويل المؤقّت', 10);
      // لا طبقةَ في المصدر: الاثنتان مؤقّتتان ببطاقته (عشرة)، وتولد لهما في المقصِد طبقةٌ بالتكلفة نفسِها — ولا قيد.
      let delta = await s.deltaOf(async () => {
        await s.move({ productId: v, warehouseId: s.warehouseA, toWarehouseId: s.warehouseB, type: 'TRANSFER', qty: 2 }).expect(201);
      });
      expect({ inv: delta('1300'), variance: delta('5810') }).toEqual({ inv: 0, variance: 0 });
      expect((await balanced('transfer-provisional')).openProvisional).toBe(20);

      // يصل الشراءُ باثني عشر: فرقُ الاثنتين (٤) — لا قيمتُهما (٢٤) — **يتبع الوحدتين إلى طبقة المقصِد** (ق-١٣٦٤: «ولا يُعدّ
      // مستهلكاً»): لا تكلفةَ مبيعات ولا فروقات، والمقصِدُ صار باثني عشر.
      delta = await s.deltaOf(async () => {
        await s.buy(v, 5, 12).expect(201);
      });
      expect({ inv: delta('1300'), variance: delta('5810'), cogs: delta('5100') }).toEqual({ inv: 60, variance: 0, cogs: 0 });
      expect((await s.layersOf(v)).find((l) => l.warehouseId === s.warehouseB)).toEqual(expect.objectContaining({ source: 'TRANSFER', remaining: 2, unitCost: 12 }));
      await balanced('transfer-provisional-settled');
    });

    it('⑮ قديمٌ بلا قيد (سبق ق-١٣٦٣) يُعدّ ولا يُطرح — الحارسُ صارم: الفرقُ يساوي سالبَ ما حرّكه القديم', async () => {
      const t = await s.product('صنف القديم', 7);
      // صفٌّ كما كتبته الشيفرةُ قبل ق-١٣٦٣: حركةٌ يدوية وطبقتُها بلا قيد — يُكتب مباشرةً لأن المسارَ لم يعد ينتجه.
      await tenantPrisma.runInTenantContext(s.company.companyId, async (tx) => {
        const m = await tx.stockMovement.create({
          data: { companyId: s.company.companyId, productId: t, warehouseId: s.warehouseA, type: 'IN', qty: 3, date: new Date(), origin: 'MANUAL', reason: 'قديمٌ بلا قيد' },
        });
        await tx.inventoryLayer.create({
          data: { companyId: s.company.companyId, productId: t, warehouseId: s.warehouseA, qtyReceived: 3, qtyRemaining: 3, unitCost: 7, acquiredAt: new Date(), sourceType: 'ADJUSTMENT', sourceMovementId: m.id },
        });
      });
      const r = await s.recon();
      // مصادقةُ المسبار بالعكس: لو بقي «اليدويّ» مطروحاً لكان الفرقُ صفراً — وهو −٢١ مسمّىً بمصدره.
      expect({ legacy: r.legacyManualUnposted, difference: r.difference }).toEqual({ legacy: 21, difference: -21 });
    });
  });

  describe('② العيوبُ الثلاثة (ق-١٣٤٤) — أُصلحت (ق-١٣٦٤): الأرقامُ المسمّاة نفسُها في حالها الصحيح، والحارسُ الثاني يراها', () => {
    let s: Awaited<ReturnType<typeof setUp>>;
    let p: string;
    let sale: { id: string; lines: { id: string }[] };
    let landed: { inv: number; cogs: number; writeOffAccount: number; variance: number };

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

      // تكلفةٌ محمَّلة ١٠٠ على الاستلام: عشرةٌ للوحدة — على الرفّ خمسٌ (+٥٠ للطبقة)، والخارجُ خمسٌ تُقسَم على مخارجها:
      // بيعٌ صافٍ (٢ ⟵ ٢٠ إلى 5100) · تحويلٌ (٢ ⟵ ٢٠ تتبع إلى طبقة المقصِد) · شطبٌ (١ ⟵ ١٠ إلى 5800).
      const delta = await s.deltaOf(async () => {
        const f = await s.freight(100);
        await s.post(`/purchases/${f.id}/landed-costs`).send({ purchaseLineId: f.lineId, goodsReceiptIds: [await s.receiptOf(purchase.id)] }).expect(201);
      });
      landed = { inv: delta('1300'), cogs: delta('5100'), writeOffAccount: delta('5800'), variance: delta('5810') };
    });

    it('الأوّل أُصلح — التحويلُ يتبع: طبقةُ المقصِد بخمسين، وحصّتا وحدتيه (٢٠) على الرفّ لا في 5100', async () => {
      const dest = (await s.layersOf(p)).find((l) => l.warehouseId === s.warehouseB)!;
      expect(dest).toEqual(expect.objectContaining({ source: 'TRANSFER', remaining: 2, unitCost: 50 }));
      expect(landed).toEqual({ inv: 70, cogs: 20, writeOffAccount: 10, variance: 0 });
      expect((await s.recon()).difference).toBe(0);
    });

    it('الثاني أُصلح — الإتلافُ إلى 5800: حصّةُ الوحدة المشطوبة (١٠) هناك لا في تكلفة المبيعات', async () => {
      expect(landed.writeOffAccount).toBe(10);
      expect(landed.cogs).toBe(20);
    });

    it('الثالث أُصلح — مرتجعُ البيع بعد الرفع يعود بتكلفة خروجه (٤٠) وما رُفع عليه بعدها (١٠) يُعاد من 5100 إلى المخزون: الفرقُ صفر', async () => {
      const delta = await s.deltaOf(async () => {
        await s.returnSale(sale, p, 1).expect(201);
      });
      expect({ inv: delta('1300'), cogs: delta('5100') }).toEqual({ inv: 50, cogs: -50 });
      expect((await s.recon()).difference).toBe(0);
      const origin = (await s.layersOf(p)).find((l) => l.warehouseId === s.warehouseA && l.source === 'GOODS_RECEIPT')!;
      expect(origin).toEqual(expect.objectContaining({ remaining: 6, unitCost: 50 }));
    });

    it('إلغاءُ توزيعٍ تبعَ التحويلَ يعيد طبقةَ المقصِد معه — من حصصه المسجَّلة، والفرقُ صفرٌ بعده', async () => {
      const w = await s.product('صنف الإلغاء', 10);
      const purchase = (await s.buy(w, 4, 10).expect(201)).body;
      await s.move({ productId: w, warehouseId: s.warehouseA, toWarehouseId: s.warehouseB, type: 'TRANSFER', qty: 1 }).expect(201);
      // ٨ على أربع: اثنان للوحدة — ثلاثٌ على الرفّ (+٦) وواحدةٌ حُوّلت فتتبعها (+٢) إلى المقصِد.
      const f = await s.freight(8);
      let distributionId = '';
      let delta = await s.deltaOf(async () => {
        distributionId = (await s.post(`/purchases/${f.id}/landed-costs`).send({ purchaseLineId: f.lineId, goodsReceiptIds: [await s.receiptOf(purchase.id)] }).expect(201)).body.id;
      });
      expect({ inv: delta('1300'), cogs: delta('5100') }).toEqual({ inv: 8, cogs: 0 });
      const unitCosts = async () => Object.fromEntries((await s.layersOf(w)).map((l) => [l.warehouseId === s.warehouseB ? 'dest' : 'origin', l.unitCost]));
      expect(await unitCosts()).toEqual({ origin: 12, dest: 12 });

      delta = await s.deltaOf(async () => {
        await s.del(`/purchases/${f.id}/landed-costs/${distributionId}`).expect(204);
      });
      expect({ inv: delta('1300'), cogs: delta('5100') }).toEqual({ inv: -8, cogs: 0 });
      expect(await unitCosts()).toEqual({ origin: 10, dest: 10 });
      expect((await s.recon()).difference).toBe(0);
    });

    it('🔴 الحارسُ الثاني (على التوزيع) نظيفٌ على الحالة الصحيحة — ويرى الحصّتين: الأصلَ والتابعَ إلى المقصِد', async () => {
      const d = await s.distribution();
      expect({ findings: d.findings, writeOff: d.writeOff.difference, variance: d.variance.difference }).toEqual({ findings: [], writeOff: 0, variance: 0 });
      // مصادقةُ المسبار: يرى ما سُجّل — لا صفرَ على صفر: حصّتا التوزيع الأوّل (الأصلُ والتابع) وحصّتا الملغى (تبقيان سجلّاً).
      expect(d.sharesChecked).toBe(4);
      expect(d.writeOff.ledger).toBe(50);
    });
  });
});
