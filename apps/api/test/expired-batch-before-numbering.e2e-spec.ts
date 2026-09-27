import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: منشأةٌ معزولة وستّةُ مشترياتٍ وثمانيةُ بيوعٍ (منها الكاشير) — ثلاثةُ أضعاف ما يلزم عادةً على الأقلّ.
jest.setTimeout(300000);

/**
 * `ق-١٤٩٠` · المسار `INV-①` — **البيعُ من دفعةٍ منتهية يُرفض قبل ترقيم الفاتورة، فلا يحترق رقمُها.**
 *
 * كان رفضُ المنتهي (`ق-١٠٨٢`) يقع في `consumeFifo` داخل التسليم — بعد `nextDocumentNumber` — والعدّادُ على منفذٍ
 * مستقلّ يلتزم فوراً (`ق-٣٤٨`)، فيبقى الرفضُ برسالته صحيحاً **ويترك فجوةً في سلسلة الفاتورة الضريبية**. والآن يُفحص
 * في `createWithinTx` قبل الترقيم بقراءة التسليم نفسِها (`assertSaleNotBlockedByExpiry` ⟵ `readConsumptionView`).
 *
 * ⚠️ **والرفضُ وحدَه لا يُثبت شيئاً هنا**: رفضُ التنفيذ باقٍ طبقةَ سباق، فيبقى `409` بالرسالة نفسِها ولو نُقل الفحصُ
 * بعد الترقيم. **فالحكمُ في رقم الفاتورة التالية** — متّصلاً — وفي نصّ الرسالة حين يفرّق بين الفحص والتنفيذ (②).
 *
 * منشأةٌ معزولةٌ وليدة: لا فاتورةَ فيها قبل الحزمة، فأوّلُ رقمٍ يصدر `INV-<السنة>-0001` (العدّادُ يُبذر من أعلى
 * قائمٍ = صفر ثم يزيد واحداً — `sequence-allocator.ts`)، والسنةُ `getUTCFullYear()` ليوم المستند (`document-year.util.ts`).
 */
describe('البيعُ من دفعةٍ منتهية يُرفض قبل الترقيم — ولا يحترق رقمُ الفاتورة (ق-١٤٩٠)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let co: IsolatedCompany;
  let supplierId: string;
  let customerId: string;
  let warehouseId: string;
  let branchId: string;
  const suffix = `${Date.now()}`;
  // يومٌ واحدٌ ثابتٌ لمستندات الحزمة كلّها — فسنةُ الترقيم واحدة، والانتهاءُ يُقاس بالأيام منه.
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  const day = (offset: number) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const today = day(0);
  const year = today.slice(0, 4);
  const inv = (n: string) => `INV-${year}-${n}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

  const product = async (name: string, expiryTracked: boolean) =>
    (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked, taxCategory: 'S', name, price: 100 }).expect(201)).body.id as string;
  const purchase = (lines: { productId: string; quantity: number; unitPrice: number; batchNo: string; expiryDate: string }[], date: string) =>
    auth(http().post('/purchases')).send({
      supplierId,
      date,
      subtotal: lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0),
      warehouseId,
      branchId,
      lines: lines.map((l) => ({ description: 'صنفٌ مخزني', taxRate: 15, ...l })),
    });
  const invoice = (lines: { description: string; productId?: string; quantity: number; unitPrice: number; taxRate: number }[]) =>
    auth(http().post('/invoices')).send({ customerId, branchId, issueDate: today, dueDate: today, lines });
  /** كلُّ أرقام الفواتير في المنشأة — مرتّبةً؛ فالفجوةُ تظهر رقماً ناقصاً من التسلسل. */
  const invoiceNos = () =>
    tenantPrisma.runInTenantContext(co.companyId, async (tx) => (await tx.invoice.findMany({ orderBy: { no: 'asc' }, select: { no: true } })).map((i) => i.no));
  const outMovements = (productId: string) => tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.stockMovement.count({ where: { productId, type: 'OUT' } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    co = await registerIsolatedCompany(app, 'expired-numbering');
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد ${suffix}` }).expect(201)).body.id;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ${suffix}` }).expect(201)).body.id;
    warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع ${suffix}` }).expect(201)).body.id;
    // الفرعُ بمستودعه — بلا مستودعٍ على الفرع لا تسليمَ أصلاً (`NO_WAREHOUSE`) فلا يبلغ الفحصُ ولا التنفيذُ شيئاً.
    branchId = (await auth(http().post('/branches')).send({ name: `فرع ${suffix}`, warehouseId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app?.close();
  });

  it('① المخزونُ كلُّه في دفعةٍ منتهية: يُرفض 409 بمفتاحه المسمّى — ولا فاتورةَ ولا حركة، والفاتورةُ التالية 0001', async () => {
    const name = `منتهٍ وحدَه ${suffix}`;
    const p = await product(name, true);
    // عشرُ وحداتٍ في دفعةٍ انتهت قبل خمسة أيام ⟸ `isExpiredOn(اليوم − 5، اليوم)` صادقة ⟸ غيرُ المنتهي = 0 · المنتهي = 10.
    await purchase([{ productId: p, quantity: 10, unitPrice: 10, batchNo: `X-${suffix}`, expiryDate: day(-5) }], day(-30)).expect(201);

    const refused = await invoice([{ description: 'بيع', productId: p, quantity: 2, unitPrice: 150, taxRate: 15 }]).expect(409);
    // المفتاحُ القائم `expired_stock_sale_refused` بنصّه العربيّ: المتاحُ 0 (لا غيرَ منتهٍ) والمطلوبُ 2.
    expect(String(refused.body.message)).toContain('لا يُباع من دفعةٍ منتهية');
    expect(String(refused.body.message)).toContain(`«${name}» 0 والمطلوب 2`);
    expect(await invoiceNos()).toEqual([]);
    expect(await outMovements(p)).toBe(0);

    // فاتورةٌ خدمية بعده: لو احترق رقمٌ بالرفض لكانت 0002 — والعدّادُ لم يُمسّ فهي الأولى.
    const ok = await invoice([{ description: `خدمة ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }]).expect(201);
    expect(ok.body.no).toBe(inv('0001'));
    expect(await invoiceNos()).toEqual([inv('0001')]);
  });

  it('② سطران للصنف نفسِه يُحكم عليهما بمجموعهما قبل الترقيم — والمطلوبُ بقدر غير المنتهي تماماً يُباع (الضابط)', async () => {
    const name = `سطران ${suffix}`;
    const q = await product(name, true);
    // دفعةٌ منتهية بعشر ودفعةٌ صالحة بثلاث ⟸ غيرُ المنتهي U = 3 · المنتهي E = 10.
    await purchase([{ productId: q, quantity: 10, unitPrice: 10, batchNo: `Y-${suffix}`, expiryDate: day(-5) }], day(-30)).expect(201);
    await purchase([{ productId: q, quantity: 3, unitPrice: 20, batchNo: `Z-${suffix}`, expiryDate: day(60) }], today).expect(201);

    const twoLines = [
      { description: 'بيع ١', productId: q, quantity: 2, unitPrice: 150, taxRate: 15 },
      { description: 'بيع ٢', productId: q, quantity: 2, unitPrice: 150, taxRate: 15 },
    ];
    const refused = await invoice(twoLines).expect(409);
    // الفحصُ المسبق بالمجموع: 2 + 2 = 4 > U = 3 وE = 10 > 0 ⟸ «… 3 والمطلوب 4».
    // (ورفضُ التنفيذ بعد الترقيم كان سيقول «… 1 والمطلوب 2»: السطرُ الأوّل يأخذ 2 من 3 فيبقى 1، والثاني يطلب 2.)
    expect(String(refused.body.message)).toContain(`«${name}» 3 والمطلوب 4`);
    expect(await invoiceNos()).toEqual([inv('0001')]);
    expect(await outMovements(q)).toBe(0);

    // الضابط: 3 > 3 كاذبة ⟸ لا رفض؛ والصرفُ يأخذ الثلاث من الدفعة الصالحة Z بتكلفتها 20 ⟸ 3 × 20 = 60.00، ولا مؤقّت.
    const ok = await invoice([{ description: 'بيع', productId: q, quantity: 3, unitPrice: 150, taxRate: 15 }]).expect(201);
    expect(ok.body.no).toBe(inv('0002'));
    expect(ok.body.stockFulfilment.totalCost).toBe('60.00');
    expect(ok.body.stockFulfilment.provisionalQty).toBe('0.000');
  });

  it('③ صنفٌ غيرُ معلَنٍ تتبّعُه يُباع من دفعته المنتهية كما كان — فالفحصُ يتبع سياسةَ الصنف لا الدفعةَ وحدَها', async () => {
    const u = await product(`غيرُ معلَن ${suffix}`, false);
    // غيرُ المعلَن سياسته FIFO ولا يُرفض منه المنتهي (`refuseExpired` كاذبة) ⟸ يأخذ 2 من الطبقة بتكلفة 10 ⟸ 20.00.
    await purchase([{ productId: u, quantity: 5, unitPrice: 10, batchNo: `W-${suffix}`, expiryDate: day(-5) }], day(-30)).expect(201);

    const ok = await invoice([{ description: 'بيع', productId: u, quantity: 2, unitPrice: 150, taxRate: 15 }]).expect(201);
    expect(ok.body.no).toBe(inv('0003'));
    expect(ok.body.stockFulfilment.totalCost).toBe('20.00');
    expect(ok.body.stockFulfilment.provisionalQty).toBe('0.000');
  });

  it('④ الكاشير يمرّ من الفحص نفسِه: بيعٌ من دفعةٍ منتهية يُرفض ولا يحرق رقماً — والبيعُ التالي 0004', async () => {
    // المناوبةُ على الفرع ذي المستودع — فالكاشيرُ يبيع من الرفّ نفسِه (`invoiceDto.branchId = shift.branchId`).
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201);
    const name = `كاشير منتهٍ ${suffix}`;
    const e = await product(name, true);
    await purchase([{ productId: e, quantity: 4, unitPrice: 10, batchNo: `V-${suffix}`, expiryDate: day(-5) }], day(-30)).expect(201);

    const refused = await auth(http().post('/pos/sales')).send({ lines: [{ productId: e, quantity: 1 }], paymentMethod: 'CASH' }).expect(409);
    // غيرُ المنتهي 0 والمطلوب 1.
    expect(String(refused.body.message)).toContain(`«${name}» 0 والمطلوب 1`);
    expect(await invoiceNos()).toEqual([inv('0001'), inv('0002'), inv('0003')]);
    expect(await outMovements(e)).toBe(0);

    // صنفٌ بلا حركةٍ قطّ ليس مخزنياً فلا يُخصم (قاعدةُ التسليم) — بيعُه ينجح، ورقمُه يلي الثالثة بلا فجوة.
    const plain = await product(`صنفٌ بلا رفّ ${suffix}`, false);
    await auth(http().post('/pos/sales')).send({ lines: [{ productId: plain, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
    expect(await invoiceNos()).toEqual([inv('0001'), inv('0002'), inv('0003'), inv('0004')]);
  });

  it('⑤ الفحصُ يقيس الانتهاءَ بيوم المستند لا بيوم الخادم — فاتورةٌ مؤرَّخةٌ قبل انتهاء الدفعة تُباع منها كما يبيعها الصرف', async () => {
    const r = await product(`مؤرَّخٌ قبل الانتهاء ${suffix}`, true);
    // دفعةٌ وحيدة بعشرٍ بتكلفة 10 تنتهي في اليوم −5 ⟸ بيومِ اليوم: U = 0 · E = 10 (منتهيةٌ كما في ①).
    await purchase([{ productId: r, quantity: 10, unitPrice: 10, batchNo: `S-${suffix}`, expiryDate: day(-5) }], day(-30)).expect(201);
    // والمستندُ في اليوم −6: `isExpiredOn(اليوم −5، اليوم −6)` = (−5 < −6) كاذبة ⟸ U = 10 · E = 0 ⟸ لا رفض؛ والصرفُ
    // بيوم المستند المخزَّن نفسِه يأخذ 2 من الدفعة بتكلفة 10 ⟸ 2 × 10 = 20.00، ولا مؤقّت.
    // ولو قاس الفحصُ بيوم الخادم لرأى U = 0 · E = 10 و2 > 0 ⟸ 409 — رفضٌ لبيعٍ يُجيزه الصرف. (رقمُ هذه الفاتورة لا يُوكَّد:
    // سنتُه سنةُ اليوم −6، وقد تسبق سنةَ الحزمة في أيامها الستة الأولى.)
    const ok = await auth(http().post('/invoices'))
      .send({ customerId, branchId, issueDate: day(-6), dueDate: day(-6), lines: [{ description: 'بيع', productId: r, quantity: 2, unitPrice: 150, taxRate: 15 }] })
      .expect(201);
    expect(ok.body.stockFulfilment.totalCost).toBe('20.00');
    expect(ok.body.stockFulfilment.provisionalQty).toBe('0.000');
  });
});
