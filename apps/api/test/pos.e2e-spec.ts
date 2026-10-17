import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';
import { backdateShiftOpening } from './backdate-shift';
import { decodeZatcaQr } from '../src/zatca/qr.util';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (39.0 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(120000);

/**
 * الكاشير v1 (مستند §6): مناوبة تُفتح بعهدة، بيعٌ يصير فاتورة مدفوعة على نفس
 * سلسلة الترقيم، درجٌ يُشتق من الفواتير لا من عدّاد، وإقفال يحسب الفرق بنفسه.
 */
describe('POS cashier (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let productId: string;
  let shiftId: string;
  // عتاد اختبارات خصم المخزون: مستودع + فرع مربوط به + صنف مخزني + وردية فرعية.
  let warehouseId: string;
  let branchId: string;
  let trackedProductId: string;
  let invShiftId: string;
  const invoiceIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  /** الرصيد الحي لزوج (صنف، مستودع) من شاشة الأرصدة — صفر يعني لا صف له. */
  const qtyAt = async (pid: string, wid: string): Promise<number> => {
    const rows = (await auth(request(app.getHttpServer()).get('/inventory/stock-levels')).expect(200)).body;
    const row = rows.find((r: { productId: string; warehouseId: string }) => r.productId === pid && r.warehouseId === wid);
    return row ? Number(row.qty) : 0;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `قهوة مختصة ${suffix}`, price: 100 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    if (invShiftId) await auth(request(app.getHttpServer()).post(`/pos/shifts/${invShiftId}/close`)).send({ declaredClosing: 0 });
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), invoiceIds);
    // حركات المخزون أولاً — Restrict يمنع حذف صنف/مستودع له تاريخ حركات.
    if (trackedProductId) {
      // القائمة مقسّمة صفحات الآن — البحث بلاحقة التشغيل الفريدة (اسم الصنف
      // والمستودع يحملانها) يعيد حركات هذا الاختبار وحدها بدل مسح صفحة واحدة.
      // ㉙ لا حذفَ لحركةٍ بعد اليوم (ق-١٠٦٣): حركاتُ هذا الاختبار — إدخالُه اليدويّ وبيعُه — تبقى في سجلّ منشأة العرض
      // كما تبقى فواتيرُه، والصنفُ معها (حركاتُه تحميه من الحذف بـRestrict).
      await auth(request(app.getHttpServer()).delete(`/trash/products/${trackedProductId}`));
    }
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`));
    await auth(request(app.getHttpServer()).delete(`/trash/products/${productId}`));
    if (branchId) await auth(request(app.getHttpServer()).delete(`/branches/${branchId}`));
    if (warehouseId) await auth(request(app.getHttpServer()).delete(`/warehouses/${warehouseId}`));
    await app.close();
  });

  it('opens a shift with a float — and refuses a second open drawer', async () => {
    const res = await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 200 }).expect(201);
    shiftId = res.body.id;
    expect(res.body.status).toBe('OPEN');

    await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 50 }).expect(409);
  }, 60000);

  it('rings a cash sale as a real PAID invoice (numbering + VAT included)', async () => {
    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 2 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(res.body.id);

    expect(res.body.status).toBe('PAID');
    expect(res.body.paymentMethod).toBe('CASH');
    expect(res.body.posShiftId).toBe(shiftId);
    expect(res.body.no).toBeTruthy();
    // 2 × 100 + 15% ضريبة
    expect(Number(res.body.total)).toBeCloseTo(230, 2);
    // بلا عميل مسمّى → «عميل نقدي» تلقائياً.
    expect(res.body.customer.name).toBe('عميل نقدي');
    // وردية بلا فرع ⇒ لا مستودع خصم — تخطٍّ صريح مُعلَن، لا انهيار.
    expect(res.body.stockDeduction).toEqual({ deducted: false, reason: 'NO_BRANCH_WAREHOUSE' });

    /**
     * ⭐ **والسطر يحمل الصنف لا اسمه وحده.**
     *
     * الكاشير يعرف الصنف يقيناً — ويبحث عنه ليأخذ سعره — وكان يحتفظ بالاسم
     * فقط. فينتج سطرٌ بلا `productId`، أي «خدميّ» بتعريف الطبقة، **فلا تكلفة
     * مبيعات له أبداً** مهما اكتملت الطبقات.
     *
     * ⚠️ وهو المسار الأخطر لأنه **الوحيد الذي يخصم من المخزون**: فتخرج
     * البضاعة من الرفّ ولا يخرج ما يقابلها من الدفتر.
     */
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].productId).toBe(productId);
  }, 60000);

  it('rings a card sale and derives the drawer from the invoices', async () => {
    const sale = await auth(request(app.getHttpServer()).post('/pos/sales'))
      // بلا ربط — جهازٌ مستقلّ: رقمُ مرجعه إلزاميّ (`ق-١٤١٩`).
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD', cardDeviceReference: 'RRN-POS-CARD' })
      .expect(201);
    invoiceIds.push(sale.body.id);

    const cur = await auth(request(app.getHttpServer()).get('/pos/shifts/current')).expect(200);
    expect(cur.body.shift.id).toBe(shiftId);
    expect(cur.body.shift.salesCount).toBe(2);
    // ② المالُ نصّاً بخانتين (`ق-١٢٣٥`): الشكلُ جزءٌ من العقد فيُقارَن حرفاً.
    expect(cur.body.shift.cashTotal).toBe('230.00');
    expect(cur.body.shift.cardTotal).toBe('115.00');
    // الدرج المتوقع = العهدة + النقد فقط — الشبكة ليست في الدرج.
    expect(cur.body.shift.expectedCash).toBe('430.00');
  }, 60000);

  it('[SPEC 7.3] closes the shift computing the variance itself — and blocks further sales', async () => {
    const res = await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 400 }).expect(201);
    expect(res.body.status).toBe('CLOSED');
    // عدّ 400 والمتوقع 430 → عجز 30 — نصّاً بإشارته.
    expect(res.body.variance).toBe('-30.00');

    await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(409);
    await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 400 }).expect(409);
  }, 60000);

  it('[SPEC 8.2 8.10] deducts branch-warehouse stock inside the sale — untracked lines are skipped explicitly', async () => {
    // مستودع + فرع مربوط به (Branch.warehouseId) + صنف مخزني برصيد استلام 10.
    warehouseId = (await auth(request(app.getHttpServer()).post('/warehouses')).send({ name: `مستودع كاشير ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع كاشير ${suffix}`, warehouseId }).expect(201)).body.id;
    trackedProductId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `عصير برتقال ${suffix}`, price: 50 }).expect(201)).body.id;
    await auth(request(app.getHttpServer()).post('/inventory/movements'))
      .send({ reason: 'اختبار — رصيدٌ للكاشير', productId: trackedProductId, warehouseId, type: 'IN', qty: 10, unitCost: 20, date: new Date().toISOString().slice(0, 10) })
      .expect(201);

    invShiftId = (await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body.id;

    // سلة مختلطة: صنف مخزني + صنف بلا أي حركة (خدمة/غير متعقَّب) — الفاتورة
    // تشمل الاثنين، والخصم يطال المخزني وحده.
    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId: trackedProductId, quantity: 2 }, { productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(res.body.id);

    expect(res.body.stockDeduction).toMatchObject({ deducted: true, warehouseId, movements: 1, belowZero: [] });
    expect(await qtyAt(trackedProductId, warehouseId)).toBeCloseTo(8, 2);
    expect(await qtyAt(productId, warehouseId)).toBe(0);

    // الرصيد مشتق من دفتر الحركات لا من عدّاد (قاعدة 11): حركة OUT حقيقية
    // على فرع الوردية تحمل رقم الفاتورة.
    const movements = (await auth(request(app.getHttpServer()).get('/inventory/movements')).query({ search: suffix, pageSize: 100 }).expect(200)).body.items;
    const out = movements.find((m: { type: string; productId: string }) => m.type === 'OUT' && m.productId === trackedProductId);
    expect(out).toBeTruthy();
    expect(Number(out.qty)).toBeCloseTo(2, 2);
    expect(out.warehouseId).toBe(warehouseId);
    expect(out.branchId).toBe(branchId);
    expect(out.reason).toContain(res.body.no);
  }, 60000);

  it('insufficient stock never blocks a sale — it goes negative with a soft warning (existing inventory policy)', async () => {
    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId: trackedProductId, quantity: 20 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(res.body.id);

    expect(res.body.status).toBe('PAID');
    // 8 − 20 = −12: البيع يمضي والسالب يُعلَن تحذيراً ناعماً، لا رفضاً.
    expect(res.body.stockDeduction.deducted).toBe(true);
    // ② الكمّيةُ نصّاً بثلاث خانات (`ق-١٢٣٥`).
    expect(res.body.stockDeduction.belowZero).toEqual([{ productId: trackedProductId, resultingQty: '-12.000' }]);
    expect(await qtyAt(trackedProductId, warehouseId)).toBeCloseTo(-12, 2);
  }, 60000);

  it('offline sync deducts exactly once — an idempotent resend does not double-deduct', async () => {
    const before = await qtyAt(trackedProductId, warehouseId);
    const payload = { clientSaleId: randomUUID(), lines: [{ productId: trackedProductId, quantity: 3 }], paymentMethod: 'CASH' as const };

    const first = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    invoiceIds.push(first.body.id);
    expect(await qtyAt(trackedProductId, warehouseId)).toBeCloseTo(before - 3, 2);

    const second = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    expect(second.body.id).toBe(first.body.id);
    // نفس الفاتورة، نفس الرصيد — الإرسال المكرر لا يخصم ثانيةً.
    expect(await qtyAt(trackedProductId, warehouseId)).toBeCloseTo(before - 3, 2);
  }, 60000);

  it('the pos screen is gated by the owner-granted template', async () => {
    const tpl = await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `بلا كاشير ${suffix}`, allowedScreens: ['dashboard'] })
      .expect(201);
    const username = `no-pos-${suffix}`;
    const emp = await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'موظف بلا كاشير', username, password: 'PosPass1234!', permissionTemplateId: tpl.body.id })
      .expect(201);
    const empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'PosPass1234!' })).body.accessToken;

    await request(app.getHttpServer()).get('/pos/shifts').set('Authorization', `Bearer ${empToken}`).expect(403);

    await auth(request(app.getHttpServer()).delete(`/company-users/${emp.body.id}`));
    await auth(request(app.getHttpServer()).delete(`/templates/${tpl.body.id}`));
  }, 60000);

  it('إيصال الكاشير يحمل الوسوم الخمسة — بساعة الحائط نفسها، وفي المسار المكرَّر أيضاً (ق-١٨٦)', async () => {
    // الاسم القانوني والرقم الضريبي شرطُ الرمز — يُضبطان هنا لا يُفترَضان من البذرة.
    const legalName = `مؤسسة الإيصال ${suffix}`;
    const vatNumber = `3${String(Date.now()).padStart(13, '0').slice(-13)}3`;
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ legalName, vatNumber }).expect(200);

    // مناوبةٌ مفتوحة إن لم تكن — الاختبار أخيرٌ في الملف فيُغلق ما فتحه.
    const open = await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 0 });
    const openedHere = open.status === 201;
    // The sale is synced at a fixed past instant, so the shift opened before it.
    const current = (await auth(request(app.getHttpServer()).get('/pos/shifts/current')).expect(200)).body.shift.id as string;
    await backdateShiftOpening(app, companyIdOfToken(token), [current], new Date('2026-09-01T00:00:00.000Z'));

    const payload = { clientSaleId: randomUUID(), ringAt: '2026-09-04T22:15:00.000Z', ringOffsetMin: 180, lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' };
    const sale = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    invoiceIds.push(sale.body.id);

    expect(sale.body.receiptQr).toBeTruthy();
    const fields = decodeZatcaQr(sale.body.receiptQr);
    expect(fields[1]).toBe(legalName);
    expect(fields[2]).toBe(vatNumber);
    // وسم ٣ = يومُ الجهاز ووقتُه محلياً بلا لاحقة (ق-١٨٥) — لا 22:15 ولا 00:00:00.
    expect(fields[3]).toBe('2026-09-05T01:15:00');
    expect(fields[4]).toBe(Number(sale.body.total).toFixed(2));
    expect(fields[5]).toBe(Number(sale.body.taxTotal).toFixed(2));

    // إعادةُ الإرسال تعيد الفاتورةَ نفسها **بإيصالٍ كامل** — فطرفيةٌ أعادت المزامنة تطبع رمزاً لا فراغاً.
    const again = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    expect(again.body.id).toBe(sale.body.id);
    expect(again.body.receiptQr).toBe(sale.body.receiptQr);

    if (openedHere) await auth(request(app.getHttpServer()).post(`/pos/shifts/${open.body.id}/close`)).send({ declaredClosing: 0 });
  }, 60000);
});
