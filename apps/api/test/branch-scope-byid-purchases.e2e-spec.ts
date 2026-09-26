import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — الحزمةُ كلُّها 19.7 ث على `mad_app_clean` (فأطولُ اختبارٍ دونها)، مقيسةٌ لا مفترَضة.
jest.setTimeout(240000);

/** صفُّ الشراء كما تعرضه قائمةُ المالك — الحقولُ التي تُقرأ هنا وحدَها. */
interface PurchaseRow {
  id: string;
  no: string;
  status: string;
  supplierRef: string | null;
  voidedAt: string | null;
}

interface AttachmentRow {
  id: string;
  filename: string;
}

/** سندُ الصرف كما يعيده `GET /supplier-payments[/:id]` (`withAllocatedTotals`). */
interface SupplierPaymentRow {
  id: string;
  no: string;
  reversesId: string | null;
  allocatedTotal: string;
  allocations: { purchaseId: string; amount: string }[];
}

interface BankRow {
  id: string;
  balance: string;
}

/**
 * 🔴 **قياسٌ لا إصلاح — مسحُ المسارات بالمعرّف (review-264، البنود #1–#9)**: موظّفٌ مقيَّدٌ بفرع الشمال
 * (`branchIds: [الشمال]`) يصل إلى **مستنداتِ فرع الجنوب بمعرّفها** في المشتريات: يوقّع رابطَ تنزيلِ مرفق
 * شرائها ويحذفه ويسرد مرفقاتِه ويزرع فيه مرفقاً، ويعدّل الشراءَ ويلغيه، ويقرأ سندَ صرفها ويعيد توزيعه
 * ويعكسه — لأن هذه المساراتِ لا تمرّر فروعَ الفاعل (`tenant.allowedBranchIds`)، والخدمةُ تقرأ الصفَّ
 * بمعرّفه وحدَه (`findUnique({ where: { id } })`) بينما القائمةُ نفسُها تحجبه (`branchFilter`).
 *
 * **والمتوقَّعُ على شيفرة اليوم أن تسقط الحالاتُ الموسومة 🔴** — فهي تُثبت السلوكَ **المقصود** لا القائم،
 * وسقوطُها هو القياس: كلُّ حالةٍ تجمع رمزَ الردّ والحقلَ الذي كان الاختراقُ سيغيّره (الحالةُ · التخصيص ·
 * مرجعُ المورّد · ختمُ الإلغاء · بقاءُ المرفق · رصيدُ الصندوق) في توكيدٍ واحد، فيُقرأ من الفرق **ما وقع
 * فعلاً** لا أوّلُ ما سقط وحدَه.
 *
 * **الحكم**: الصفُّ خارج فروع الفاعل غيرُ موجودٍ له — 404 لا 403، فلا يُسرَّب وجودُ مستندِ فرعٍ آخر.
 * **ومالكُ المنشأة يرى الفروعَ كلَّها** فهو من يُنشئ صفوفَ الجنوب ويعيد قراءتها بعد كلِّ محاولة؛ **وحالةٌ
 * موجبةٌ لكلِّ خدمة** (المرفقات · الشراء · سند الصرف) يؤدّي فيها الفاعلُ نفسُه الفعلَ نفسَه على صفِّ
 * الشمال فينجح — فالرفضُ للفرع لا للفعل.
 *
 * ⚠️ **وحدُّها معلَن**: حالاتُ المرفقات تحتاج التخزينَ (MinIO) حيّاً كأختها `purchase-attachments.e2e-spec`؛
 * وكلُّ مسارٍ كاتبٍ يعمل على صفٍّ خاصٍّ به، فاختراقٌ يقع اليوم في حالةٍ لا يُفسد حالةً بعدها.
 */
describe('فروعُ الفاعل عند الوصول بالمعرّف — المشترياتُ ومرفقاتُها وسنداتُ الصرف (قياس review-264)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);
  // يومُ الاختبار بتقويم `UTC` (`ق-١١٩٥`) — لا من منطقة العملية.
  const today = () => new Date().toISOString().slice(0, 10);

  const SOUTH_REF = `مرجع الجنوب ${suffix}`;

  let northId: string;
  let southId: string;
  let supplierId: string;
  let boxSouth: string;

  // صفُّ كلِّ مسارٍ كاتبٍ خاصٌّ به (انظر الحدَّ المعلَن في الرأس).
  let purchaseSouth: string; // المرفقات #1–#4 وتعديلُ الشراء #5
  let purchaseSouthVoid: string; // إلغاءُ الشراء #6
  let purchaseSouthPaid: string; // يسدّده `paymentSouth` كاملاً — #8
  let purchaseNorth: string;
  let purchaseNorthVoid: string;
  let purchaseNorthPaid: string;

  let attSouthDownload: string; // #1
  let attSouthDelete: string; // #2

  let paymentSouth: string; // #7 و#8 — مخصَّصٌ على `purchaseSouthPaid`
  let paymentSouthReverse: string; // #9 — على صندوق الجنوب بلا تخصيص
  let paymentNorth: string;

  /** شراءٌ معفى بإجماليّ ١٠٠ — فالإجماليُّ هو ما يُسدَّد، بلا ضريبةٍ تُحسب (كـ`supplier-payments.e2e-spec`). */
  const makePurchase = async (branchId: string, supplierRef: string): Promise<string> =>
    (
      (
        await asOwner(http().post('/purchases'))
          .send({ supplierId, branchId, date: today(), category: `بند ${suffix}`, subtotal: 100, exempt: true, supplierRef })
          .expect(201)
      ).body as { id: string }
    ).id;

  /** رفعُ مستند PDF على شراء — الحقلُ `file` كما في `purchase-attachments.e2e-spec`. */
  const upload = (actor: (r: request.Test) => request.Test, purchaseId: string, filename: string) =>
    actor(http().post(`/purchases/${purchaseId}/attachments`)).attach('file', Buffer.from(`%PDF-1.4 ${filename}`), {
      filename,
      contentType: 'application/pdf',
    });

  const attachmentIdsAsOwner = async (purchaseId: string): Promise<string[]> =>
    ((await asOwner(http().get(`/purchases/${purchaseId}/attachments`)).expect(200)).body as AttachmentRow[]).map((a) => a.id);

  /** لا `GET /purchases/:id` — فالمالكُ يعيد القراءةَ من القائمة التي يرى فيها الفروعَ كلَّها (والمُلغى فيها). */
  const purchaseAsOwner = async (id: string): Promise<PurchaseRow> => {
    const rows = (await asOwner(http().get('/purchases')).expect(200)).body as PurchaseRow[];
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`الشراءُ ${id} غائبٌ عن قائمة المالك`);
    return row;
  };

  const paymentAsOwner = async (id: string): Promise<SupplierPaymentRow> =>
    (await asOwner(http().get(`/supplier-payments/${id}`)).expect(200)).body as SupplierPaymentRow;

  const paymentsAsOwner = async (): Promise<SupplierPaymentRow[]> =>
    (await asOwner(http().get('/supplier-payments')).expect(200)).body as SupplierPaymentRow[];

  const bankBalanceAsOwner = async (id: string): Promise<number> => {
    const banks = (await asOwner(http().get('/banks')).expect(200)).body as BankRow[];
    const bank = banks.find((b) => b.id === id);
    if (!bank) throw new Error(`الصندوقُ ${id} غائبٌ عن قائمة المالك`);
    return Number(bank.balance);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'scope-byid-pur');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;

    // قالبٌ تملكه المنشأة بشاشة المورّدين وأفعالها كلِّها (بلا تفصيل = كلُّ الأفعال) — فالرفضُ لا يأتي من القالب.
    const template = await asOwner(http().post('/templates')).send({ name: `المشتريات ${suffix}`, allowedScreens: ['dashboard', 'suppliers'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف الشمال', username: `north-byid-pur-${suffix}`, password: 'ScopePass123!', permissionTemplateId: template.body.id, branchIds: [northId] })
      .expect(201);
    // الدخولُ يردّ `200` لا `201` (`@HttpCode` على المسار).
    restrictedToken = (await http().post('/auth/login').send({ username: `north-byid-pur-${suffix}`, password: 'ScopePass123!' }).expect(200)).body.accessToken;

    supplierId = (await asOwner(http().post('/suppliers')).send({ name: `مورّد الفروع ${suffix}` }).expect(201)).body.id;
    boxSouth = (
      (await asOwner(http().post('/banks')).send({ name: `صندوق الجنوب ${suffix}`, kind: 'CASH_BOX', openingBalance: 1000, openingDate: today(), branchId: southId }).expect(201))
        .body as { id: string }
    ).id;

    purchaseSouth = await makePurchase(southId, SOUTH_REF);
    purchaseSouthVoid = await makePurchase(southId, `إلغاء الجنوب ${suffix}`);
    purchaseSouthPaid = await makePurchase(southId, `مسدَّد الجنوب ${suffix}`);
    purchaseNorth = await makePurchase(northId, `مرجع الشمال ${suffix}`);
    purchaseNorthVoid = await makePurchase(northId, `إلغاء الشمال ${suffix}`);
    purchaseNorthPaid = await makePurchase(northId, `مسدَّد الشمال ${suffix}`);

    attSouthDownload = ((await upload(asOwner, purchaseSouth, `مستند-الجنوب-تنزيل-${suffix}.pdf`).expect(201)).body as { id: string }).id;
    attSouthDelete = ((await upload(asOwner, purchaseSouth, `مستند-الجنوب-حذف-${suffix}.pdf`).expect(201)).body as { id: string }).id;

    const pay = async (body: Record<string, unknown>): Promise<string> =>
      ((await asOwner(http().post('/supplier-payments')).send({ supplierId, date: today(), amount: 100, method: 'CASH', ...body }).expect(201)).body as { id: string }).id;
    paymentSouth = await pay({ branchId: southId, allocations: [{ purchaseId: purchaseSouthPaid, amount: 100 }] });
    paymentSouthReverse = await pay({ branchId: southId, bankId: boxSouth });
    paymentNorth = await pay({ branchId: northId, allocations: [{ purchaseId: purchaseNorthPaid, amount: 100 }] });
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  // ── مرفقاتُ الشراء (`PurchaseAttachmentsService`) ──

  // #1 — GET /purchases/attachments/:attachmentId/download-url [suppliers:view] — قراءة
  it('[SPEC 2.7] 🔴 رابطُ تنزيلِ مرفقِ شراءٍ من فرعٍ آخر بمعرّف المرفق — 404 لا رابطٌ موقَّع `GET /purchases/attachments/:attachmentId/download-url`', async () => {
    await asRestricted(http().get(`/purchases/attachments/${attSouthDownload}/download-url`)).expect(404);
  });

  // #2 — DELETE /purchases/attachments/:attachmentId [suppliers:delete] — حذفٌ صلب
  it('[SPEC 2.7] 🔴 حذفُ مرفقِ شراءٍ من فرعٍ آخر بمعرّفه — 404، والمرفقُ باقٍ في قائمة المالك `DELETE /purchases/attachments/:attachmentId`', async () => {
    const res = await asRestricted(http().delete(`/purchases/attachments/${attSouthDelete}`));
    const listed = await attachmentIdsAsOwner(purchaseSouth);
    expect({ status: res.status, stillListed: listed.includes(attSouthDelete) }).toEqual({ status: 404, stillListed: true });
  });

  // #3 — GET /purchases/:purchaseId/attachments [suppliers:view] — قراءة (وكشفُ وجود الشراء)
  it('[SPEC 2.7] 🔴 قائمةُ مرفقاتِ شراءٍ من فرعٍ آخر بمعرّف الشراء — 404 لا قائمة `GET /purchases/:purchaseId/attachments`', async () => {
    await asRestricted(http().get(`/purchases/${purchaseSouth}/attachments`)).expect(404);
  });

  // #4 — POST /purchases/:purchaseId/attachments [suppliers:add] — زرعُ مستند
  it('[SPEC 2.7] 🔴 رفعُ مرفقٍ على شراءٍ من فرعٍ آخر — 404، ولا مرفقَ جديدٌ عليه `POST /purchases/:purchaseId/attachments`', async () => {
    const before = await attachmentIdsAsOwner(purchaseSouth);
    const res = await upload(asRestricted, purchaseSouth, `مزروع-${suffix}.pdf`);
    const planted = (await attachmentIdsAsOwner(purchaseSouth)).filter((id) => !before.includes(id));
    expect({ status: res.status, planted }).toEqual({ status: 404, planted: [] });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يرفع مرفقاً على شراء فرعه ويسرده ويوقّع رابطَه ويحذفه — فالرفضُ للفرع لا للفعل', async () => {
    const id = ((await upload(asRestricted, purchaseNorth, `فاتورة-الشمال-${suffix}.pdf`).expect(201)).body as { id: string }).id;
    const listed = (await asRestricted(http().get(`/purchases/${purchaseNorth}/attachments`)).expect(200)).body as AttachmentRow[];
    expect(listed.map((a) => a.id)).toContain(id);
    const signed = (await asRestricted(http().get(`/purchases/attachments/${id}/download-url`)).expect(200)).body as { url: unknown };
    expect(typeof signed.url).toBe('string');
    await asRestricted(http().delete(`/purchases/attachments/${id}`)).expect(204);
    expect(await attachmentIdsAsOwner(purchaseNorth)).not.toContain(id);
  });

  // ── فاتورةُ الشراء (`PurchasesService`) ──

  // #5 — PATCH /purchases/:id [suppliers:edit] — كتابةٌ، وقراءةٌ متنكّرةٌ في تعديلٍ فارغ
  it('[SPEC 2.7] 🔴 تعديلُ شراءٍ من فرعٍ آخر بمعرّفه — 404 للكتابة وللتعديل الفارغ الذي يعيد الصفّ، ومرجعُ المورّد باقٍ `PATCH /purchases/:id`', async () => {
    const write = await asRestricted(http().patch(`/purchases/${purchaseSouth}`)).send({ supplierRef: `معدَّلٌ من فرعٍ آخر ${suffix}` });
    const emptyRead = await asRestricted(http().patch(`/purchases/${purchaseSouth}`)).send({});
    const south = await purchaseAsOwner(purchaseSouth);
    expect({ write: write.status, emptyRead: emptyRead.status, supplierRef: south.supplierRef }).toEqual({
      write: 404,
      emptyRead: 404,
      supplierRef: SOUTH_REF,
    });
  });

  // #6 — DELETE /purchases/:id [suppliers:delete] — إلغاءٌ بقيد عكس
  it('[SPEC 2.7] 🔴 إلغاءُ شراءٍ من فرعٍ آخر بمعرّفه — 404، ولا يُختم مُلغىً `DELETE /purchases/:id`', async () => {
    const res = await asRestricted(http().delete(`/purchases/${purchaseSouthVoid}`));
    const south = await purchaseAsOwner(purchaseSouthVoid);
    expect({ status: res.status, voidedAt: south.voidedAt }).toEqual({ status: 404, voidedAt: null });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يعدّل شراءَ فرعه ويلغي آخرَ منه — فالرفضُ للفرع لا للفعل', async () => {
    const editedRef = `مرجع الشمال المعدَّل ${suffix}`;
    await asRestricted(http().patch(`/purchases/${purchaseNorth}`)).send({ supplierRef: editedRef }).expect(200);
    expect((await purchaseAsOwner(purchaseNorth)).supplierRef).toBe(editedRef);
    await asRestricted(http().delete(`/purchases/${purchaseNorthVoid}`)).expect(204);
    expect((await purchaseAsOwner(purchaseNorthVoid)).voidedAt).not.toBeNull();
  });

  // ── سنداتُ الصرف (`SupplierPaymentsService`) ──

  // #7 — GET /supplier-payments/:id [suppliers:view] — قراءة (وكشفُ الوجود)
  it('[SPEC 2.7] 🔴 قراءةُ سندِ صرفِ فرعٍ آخر بمعرّفه — 404 لا السندُ بتخصيصاته `GET /supplier-payments/:id`', async () => {
    await asRestricted(http().get(`/supplier-payments/${paymentSouth}`)).expect(404);
  });

  // #8 — POST /supplier-payments/:id/allocate [suppliers:edit] — محوُ التخصيص يعيد الشراءَ المسدَّد مستحقّاً
  it('[SPEC 2.7] 🔴 إعادةُ توزيعِ سندِ صرفِ فرعٍ آخر — 404، وتخصيصُه باقٍ وشراؤه مسدَّد `POST /supplier-payments/:id/allocate`', async () => {
    // الشرطُ المسبق مقروءاً لا مفترَضاً: السندُ سدّد الشراءَ كاملاً قبل المحاولة.
    expect((await purchaseAsOwner(purchaseSouthPaid)).status).toBe('PAID');
    const res = await asRestricted(http().post(`/supplier-payments/${paymentSouth}/allocate`)).send({ allocations: [] });
    const payment = await paymentAsOwner(paymentSouth);
    const purchase = await purchaseAsOwner(purchaseSouthPaid);
    expect({ status: res.status, allocatedTotal: payment.allocatedTotal, purchaseStatus: purchase.status }).toEqual({
      status: 404,
      allocatedTotal: '100.00',
      purchaseStatus: 'PAID',
    });
  });

  // #9 — POST /supplier-payments/:id/reverse [suppliers:record] — سندٌ عاكسٌ في دفتر فرعٍ آخر وصندوقِه
  it('[SPEC 2.7] 🔴 عكسُ سندِ صرفِ فرعٍ آخر — 404، ولا سندَ عاكسٌ ولا يتحرّك صندوقُ ذلك الفرع `POST /supplier-payments/:id/reverse`', async () => {
    const boxBefore = await bankBalanceAsOwner(boxSouth);
    const res = await asRestricted(http().post(`/supplier-payments/${paymentSouthReverse}/reverse`)).send({ reason: `عكسٌ من فرعٍ آخر ${suffix}` });
    const reversals = (await paymentsAsOwner()).filter((p) => p.reversesId === paymentSouthReverse).map((p) => p.no);
    const boxAfter = await bankBalanceAsOwner(boxSouth);
    expect({ status: res.status, reversals, box: boxAfter }).toEqual({ status: 404, reversals: [], box: boxBefore });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يقرأ سندَ فرعه ويعيد توزيعه ويعكسه — فالرفضُ للفرع لا للفعل', async () => {
    const read = (await asRestricted(http().get(`/supplier-payments/${paymentNorth}`)).expect(200)).body as SupplierPaymentRow;
    expect(read.id).toBe(paymentNorth);
    const reallocated = (await asRestricted(http().post(`/supplier-payments/${paymentNorth}/allocate`)).send({ allocations: [] }).expect(201))
      .body as SupplierPaymentRow;
    expect(reallocated.allocations).toHaveLength(0);
    const reversal = (await asRestricted(http().post(`/supplier-payments/${paymentNorth}/reverse`)).send({ reason: `تصحيح الشمال ${suffix}` }).expect(201))
      .body as SupplierPaymentRow;
    expect(reversal.reversesId).toBe(paymentNorth);
  });
});
