import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — الحزمةُ كلُّها 22.7 ث على `mad_app_clean` (فأطولُ اختبارٍ دونها)، مقيسةٌ لا مفترَضة.
jest.setTimeout(240000);

/** جسمُ الرفض كما يكتبه `HttpExceptionFilter`. */
interface ErrorBody {
  message: string;
}

/** صفُّ الفاتورة في القائمة — لا مسارَ تفصيلٍ مفرد للفواتير، فالمالكُ يقرؤها من القائمة. */
interface InvoiceRow {
  id: string;
  no: string;
  status: string;
  notes: string | null;
  total: string;
}

/** سندُ القبض بتخصيصاته (`PAYMENT_INCLUDE`) — و`reversesId` على العكس يشير إلى أصله. */
interface PaymentView {
  id: string;
  no: string;
  reversesId: string | null;
  allocations: { invoiceId: string; amount: string }[];
}

/** عرضُ السعر كما يردّه `GET /quotes/:id` — بفاتورته المحوَّلة إن وُجدت. */
interface QuoteView {
  id: string;
  no: string;
  status: string;
  notes: string | null;
  total: string;
  convertedInvoice: { id: string; no: string } | null;
}

/** فاتورةٌ وسندُ قبضٍ خُصّص لها كاملاً — فحالتُها `PAID` قبل أي قياس. */
interface PaidPair {
  invoiceId: string;
  paymentId: string;
}

/**
 * 🔴 **قياسٌ لا حارس — مسحُ مسارات المعرّف (المراجعة 264)، البنود #10–#18 في المبيعات**: موظّفٌ مقيَّدٌ بفرع
 * الشمال (`branchIds: [North]`) يصل **بالمعرّف** إلى صفوف فرع الجنوب — يقرأ سندَ القبض، ويعيد توزيعه، ويعكسه؛
 * ويقرأ فاتورةَ الجنوب ويكتب ملاحظتَها ويستدلّ على وجودها ونوعها من ردّ الحذف؛ ويقرأ عرضَ السعر ويعدّله ويحذفه،
 * ويستدلّ من ردّ التحويل على وجوده ورقمِ فاتورته وتاريخِ انقضائه. **والسببُ واحد في المسارات كلّها**: المتحكّمُ لا
 * يمرّر `allowedBranchIds`، والخدمةُ تقرأ الصفَّ بمعرّفه وحدَه (`findUnique({ where: { id } })`) — بينما القائمةُ
 * نفسُها تُرشِّح بـ`branchFilter` فتُخفي ما يصل إليه المعرّف.
 *
 * ⚠️ **على شيفرة اليوم يُتوقَّع أن تسقط اختباراتُ 🔴 كلُّها** — والأحمرُ هو النتيجةُ المقيسة لا عطلٌ في الملف. كلُّ
 * اختبارٍ يجمع في توكيدٍ واحد **رمزَ الردّ وأثرَه على الصفّ** كما يقرؤه المالك، فيُظهر فرقُه ما سُرِّب وما كُتب معاً.
 * وبعد الإصلاح يصير الملفُّ حارسَه.
 *
 * **الحكم**: **الصفُّ خارج فروع الفاعل غيرُ موجودٍ له — 404 لا 403**، وبرسالة الصفّ المفقود نفسِها (يُقاس بمعرّفٍ
 * عشوائيّ على المسار ذاته) — فلا يُسرَّب وجودُ مستندِ فرعٍ آخر ولا نوعُه ولا رقمُ ما تحوّل إليه. **ومالكُ المنشأة
 * يرى الفروعَ كلَّها** فهو من يعيد قراءة صفّ الجنوب بعد كل محاولة. **وحالةٌ موجبةٌ لكلّ خدمة** (المقبوضات ·
 * الفواتير · العروض) تُثبت أن الفاعلَ نفسَه يؤدّي الفعلَ نفسَه على صفّ فرعه — فالرفضُ للفرع لا للفعل.
 */
describe('فروعُ الفاعل عند الوصول بالمعرّف — المقبوضاتُ والفواتيرُ وعروضُ الأسعار (المراجعة 264 · #10–#18)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);

  const today = () => new Date().toISOString().slice(0, 10);
  const plusDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const messageOf = (res: request.Response): string | null => (res.body as Partial<ErrorBody>).message ?? null;
  const leakedNoOf = (res: request.Response): string | null => (res.body as { no?: string }).no ?? null;

  /** سعرُ البند — والبندُ معفى بسببه المعلَن فالإجماليُّ هو السعرُ نفسُه بلا ضريبة (نمطُ `payments.e2e-spec`). */
  const LINE_PRICE = 100;
  const exemptLine = (description: string, unitPrice = LINE_PRICE) => ({
    description,
    quantity: 1,
    unitPrice,
    taxRate: 0,
    taxCategory: 'E',
    taxExemptionReasonCode: 'VATEX-SA-29',
  });

  let northId: string;
  let southId: string;
  let customerId: string;

  // ── المقبوضات: سندٌ مستقلٌّ لكل مسارٍ في الجنوب — فكتابةُ مسارٍ مكسور لا تُفسد قياسَ غيره.
  let paidNorth: PaidPair;
  let paidSouthRead: PaidPair;
  let paidSouthAllocate: PaidPair;
  let paidSouthReverse: PaidPair;

  // ── الفواتير
  const SOUTH_INVOICE_NOTES = `ملاحظةُ فاتورة الجنوب ${suffix}`;
  let invoiceNorth: string;
  let invoiceSouth: string;

  // ── عروضُ الأسعار
  const SOUTH_QUOTE_NOTES = `ملاحظةُ عرض الجنوب ${suffix}`;
  let quoteNorth: QuoteView;
  let quoteNorthDelete: QuoteView;
  let quoteSouthRead: QuoteView;
  let quoteSouthEdit: QuoteView;
  let quoteSouthDelete: QuoteView;
  let quoteSouthConvert: QuoteView;
  let quoteSouthConverted: QuoteView;
  let quoteSouthExpired: QuoteView;

  const makeInvoice = async (branchId: string, label: string, notes?: string): Promise<InvoiceRow> =>
    (
      await asOwner(http().post('/invoices'))
        .send({ customerId, branchId, issueDate: today(), dueDate: today(), ...(notes ? { notes } : {}), lines: [exemptLine(`${label} ${suffix}`)] })
        .expect(201)
    ).body as InvoiceRow;

  /** فاتورةٌ يسدّدها سندٌ نقديٌّ بكامل إجماليّها — بلا فائضٍ يستوجب إعلانَ `unallocated`. */
  const makePaidPair = async (branchId: string, label: string): Promise<PaidPair> => {
    const invoice = await makeInvoice(branchId, label);
    const amount = Number(invoice.total);
    const payment = (
      await asOwner(http().post('/payments'))
        .send({ customerId, branchId, date: today(), amount, method: 'CASH', allocations: [{ invoiceId: invoice.id, amount }] })
        .expect(201)
    ).body as PaymentView;
    return { invoiceId: invoice.id, paymentId: payment.id };
  };

  const makeQuote = async (branchId: string, label: string, over: Record<string, unknown> = {}): Promise<QuoteView> =>
    (
      await asOwner(http().post('/quotes'))
        .send({ customerId, branchId, issueDate: today(), validUntil: plusDays(30), lines: [exemptLine(`${label} ${suffix}`)], ...over })
        .expect(201)
    ).body as QuoteView;

  /** المالكُ يقرأ الفاتورةَ من القائمة (لا مسارَ تفصيلٍ مفرد) — `undefined` = لم تعد في القائمة. */
  const ownerInvoice = async (id: string): Promise<InvoiceRow | undefined> =>
    ((await asOwner(http().get('/invoices')).expect(200)).body as InvoiceRow[]).find((row) => row.id === id);
  const ownerPayment = async (id: string): Promise<PaymentView> => (await asOwner(http().get(`/payments/${id}`)).expect(200)).body as PaymentView;
  const ownerQuote = (id: string) => asOwner(http().get(`/quotes/${id}`));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'scope-byid-sales');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    customerId = (await asOwner(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل المبيعات ${suffix}` }).expect(201)).body.id;

    // قالبٌ تملكه المنشأة بالشاشات الثلاث وأفعالها كلِّها (بلا تفصيل = كلُّ الأفعال) — فالرفضُ لا يأتي من القالب.
    // (`invoice` تحرس الفواتيرَ وتحويلَ العرض معاً — `QuoteConversionController` خلفها بفعل `add`.)
    const template = await asOwner(http().post('/templates'))
      .send({ name: `المبيعات ${suffix}`, allowedScreens: ['dashboard', 'payments', 'invoice', 'quotes'] })
      .expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف الشمال', username: `north-sales-${suffix}`, password: 'ScopePass123!', permissionTemplateId: template.body.id, branchIds: [northId] })
      .expect(201);
    // الدخولُ يردّ `200` لا `201` (`@HttpCode` على المسار).
    restrictedToken = (await http().post('/auth/login').send({ username: `north-sales-${suffix}`, password: 'ScopePass123!' }).expect(200)).body.accessToken;

    paidNorth = await makePaidPair(northId, 'بيع الشمال');
    paidSouthRead = await makePaidPair(southId, 'بيع الجنوب للقراءة');
    paidSouthAllocate = await makePaidPair(southId, 'بيع الجنوب للتوزيع');
    paidSouthReverse = await makePaidPair(southId, 'بيع الجنوب للعكس');

    invoiceNorth = (await makeInvoice(northId, 'فاتورة الشمال')).id;
    invoiceSouth = (await makeInvoice(southId, 'فاتورة الجنوب', SOUTH_INVOICE_NOTES)).id;

    quoteNorth = await makeQuote(northId, 'عرض الشمال');
    quoteNorthDelete = await makeQuote(northId, 'عرض الشمال للحذف');
    quoteSouthRead = await makeQuote(southId, 'عرض الجنوب للقراءة');
    quoteSouthEdit = await makeQuote(southId, 'عرض الجنوب للتعديل', { notes: SOUTH_QUOTE_NOTES });
    quoteSouthDelete = await makeQuote(southId, 'عرض الجنوب للحذف');
    quoteSouthConvert = await makeQuote(southId, 'عرض الجنوب للتحويل');
    quoteSouthConverted = await makeQuote(southId, 'عرض الجنوب المحوَّل');
    // المالكُ يحوّله — فالتحويلُ الثاني يُردّ اليومَ `409` حاملاً رقمَ فاتورة الجنوب (البندُ #18 ب).
    await asOwner(http().post(`/quotes/${quoteSouthConverted.id}/convert`)).send({}).expect(201);
    // منقضٍ منذ ثلاثة أيام — فالتحويلُ يُردّ اليومَ `409` حاملاً تاريخَ انقضائه (البندُ #18 ج).
    quoteSouthExpired = await makeQuote(southId, 'عرض الجنوب المنقضي', { issueDate: plusDays(-30), validUntil: plusDays(-3) });

    // المسبارُ يُصادَق قبل أن يُقرأ — بحالتين معلومتَين:
    // ① القيدُ قائمٌ فعلاً: قائمةُ السندات تُظهر سندَ الشمال وتُخفي سندَ الجنوب عن الفاعل — فما يُقاس أدناه ثغرةُ
    //    المعرّف لا قيدٌ لم يُركَّب.
    const visibleToRestricted = ((await asRestricted(http().get('/payments')).expect(200)).body as PaymentView[]).map((p) => p.id);
    expect(visibleToRestricted).toContain(paidNorth.paymentId);
    expect(visibleToRestricted).not.toContain(paidSouthRead.paymentId);
    // ② فواتيرُ سندَي التوزيع والعكس مسدَّدةٌ قبل المحاولة — فبقاءُ `PAID` بعدها حكمٌ لا مصادفة.
    expect((await ownerInvoice(paidSouthAllocate.invoiceId))?.status).toBe('PAID');
    expect((await ownerInvoice(paidSouthReverse.invoiceId))?.status).toBe('PAID');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  // ─────────────────────────────── المقبوضات ───────────────────────────────

  // #10
  it('[SPEC 2.7] 🔴 قراءةُ سندِ قبضِ فرعٍ آخر بمعرّفه — 404 برسالة السند المفقود، ولا يُسرَّب رقمُه `GET /payments/:id`', async () => {
    const missing = await asRestricted(http().get(`/payments/${randomUUID()}`)).expect(404);
    const res = await asRestricted(http().get(`/payments/${paidSouthRead.paymentId}`));
    expect({ httpStatus: res.status, message: messageOf(res), leakedNo: leakedNoOf(res) }).toEqual({
      httpStatus: 404,
      message: messageOf(missing),
      leakedNo: null,
    });
  });

  // #11
  it('[SPEC 2.7] 🔴 إعادةُ توزيعِ سندِ قبضِ فرعٍ آخر بمعرّفه — 404، وتخصيصُه وحالةُ فاتورته كما هما `POST /payments/:id/allocate`', async () => {
    // `{ allocations: [] }` = الاستغلالُ بنصّ المسح: يفكّ التخصيصَ فتعود فاتورةُ الجنوب المسدَّدة مستحقّة.
    const res = await asRestricted(http().post(`/payments/${paidSouthAllocate.paymentId}/allocate`)).send({ allocations: [] });
    const payment = await ownerPayment(paidSouthAllocate.paymentId);
    expect({
      httpStatus: res.status,
      invoiceStatus: (await ownerInvoice(paidSouthAllocate.invoiceId))?.status,
      allocations: payment.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) })),
    }).toEqual({
      httpStatus: 404,
      invoiceStatus: 'PAID',
      allocations: [{ invoiceId: paidSouthAllocate.invoiceId, amount: LINE_PRICE }],
    });
  });

  // #12
  it('[SPEC 2.7] 🔴 عكسُ سندِ قبضِ فرعٍ آخر بمعرّفه — 404، ولا سندَ عكسٍ يُنشأ ولا تُفتح فاتورتُه `POST /payments/:id/reverse`', async () => {
    const res = await asRestricted(http().post(`/payments/${paidSouthReverse.paymentId}/reverse`)).send({ reason: 'عكسٌ من فرعٍ آخر', date: today() });
    const reversals = ((await asOwner(http().get('/payments')).expect(200)).body as PaymentView[]).filter((p) => p.reversesId === paidSouthReverse.paymentId);
    expect({
      httpStatus: res.status,
      invoiceStatus: (await ownerInvoice(paidSouthReverse.invoiceId))?.status,
      reversals: reversals.map((p) => p.no),
    }).toEqual({
      httpStatus: 404,
      invoiceStatus: 'PAID',
      reversals: [],
    });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: سندُ قبضِ فرع الفاعل يُقرأ ويُعاد توزيعُه ويُعكس — فالرفضُ للفرع لا للفعل', async () => {
    const read = await asRestricted(http().get(`/payments/${paidNorth.paymentId}`)).expect(200);
    expect((read.body as PaymentView).id).toBe(paidNorth.paymentId);
    await asRestricted(http().post(`/payments/${paidNorth.paymentId}/allocate`))
      .send({ allocations: [{ invoiceId: paidNorth.invoiceId, amount: LINE_PRICE }] })
      .expect(201);
    const reversal = await asRestricted(http().post(`/payments/${paidNorth.paymentId}/reverse`)).send({ reason: `تصحيح ${suffix}`, date: today() }).expect(201);
    expect((reversal.body as PaymentView).reversesId).toBe(paidNorth.paymentId);
  });

  // ─────────────────────────────── الفواتير ───────────────────────────────

  // #13
  it('[SPEC 2.7] 🔴 تعديلُ فاتورةِ فرعٍ آخر بمعرّفها — 404 للقراءة والكتابة، وملاحظتُها كما هي `PATCH /invoices/:id`', async () => {
    // `{}` تحديثٌ فارغ يردّ الصفَّ كاملاً (قراءةٌ لما تُخفيه القائمة)، و`notes` هو الحقلُ الذي يُكتب فعلاً على الصادر.
    const read = await asRestricted(http().patch(`/invoices/${invoiceSouth}`)).send({});
    const write = await asRestricted(http().patch(`/invoices/${invoiceSouth}`)).send({ notes: 'ملاحظةٌ من فرعٍ آخر' });
    expect({
      readStatus: read.status,
      leakedNo: leakedNoOf(read),
      writeStatus: write.status,
      notes: (await ownerInvoice(invoiceSouth))?.notes,
    }).toEqual({
      readStatus: 404,
      leakedNo: null,
      writeStatus: 404,
      notes: SOUTH_INVOICE_NOTES,
    });
  });

  // #14
  it('[SPEC 2.7] 🔴 حذفُ فاتورةِ فرعٍ آخر بمعرّفها — 404 برسالة الفاتورة المفقودة لا 409 القفل الذي يكشف وجودَها ونوعَها `DELETE /invoices/:id`', async () => {
    const missing = await asRestricted(http().delete(`/invoices/${randomUUID()}`)).expect(404);
    const res = await asRestricted(http().delete(`/invoices/${invoiceSouth}`));
    expect({
      httpStatus: res.status,
      message: messageOf(res),
      ownerStillLists: (await ownerInvoice(invoiceSouth)) !== undefined,
    }).toEqual({
      httpStatus: 404,
      message: messageOf(missing),
      ownerStillLists: true,
    });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: فاتورةُ فرع الفاعل تُعدَّل ملاحظتُها، وحذفُها يُردّ بقفل الصادر لا بالفرع — فالرفضُ للفرع لا للفعل', async () => {
    const notes = `ملاحظةُ الشمال ${suffix}`;
    const edited = await asRestricted(http().patch(`/invoices/${invoiceNorth}`)).send({ notes }).expect(200);
    expect((edited.body as InvoiceRow).notes).toBe(notes);
    // لا رمزَ نجاحٍ للحذف أصلاً (`ق-٩٤٣`: الصادرُ لا يُزال) — والموجبُ هنا أن المسارَ **بلغ الصفَّ** فردّ بقفله ومخرجِه.
    const del = await asRestricted(http().delete(`/invoices/${invoiceNorth}`)).expect(409);
    expect((del.body as ErrorBody).message).toContain('إشعار دائن');
  });

  // ─────────────────────────────── عروضُ الأسعار ───────────────────────────────

  // #15
  it('[SPEC 2.7] 🔴 قراءةُ عرضِ سعرِ فرعٍ آخر بمعرّفه — 404 برسالة العرض المفقود، ولا يُسرَّب رقمُه `GET /quotes/:id`', async () => {
    const missing = await asRestricted(http().get(`/quotes/${randomUUID()}`)).expect(404);
    const res = await asRestricted(http().get(`/quotes/${quoteSouthRead.id}`));
    expect({ httpStatus: res.status, message: messageOf(res), leakedNo: leakedNoOf(res) }).toEqual({
      httpStatus: 404,
      message: messageOf(missing),
      leakedNo: null,
    });
  });

  // #16
  it('[SPEC 2.7] 🔴 تعديلُ عرضِ سعرِ فرعٍ آخر بمعرّفه — 404، وملاحظتُه وحالتُه وإجماليُّه كما هي `PATCH /quotes/:id`', async () => {
    const res = await asRestricted(http().patch(`/quotes/${quoteSouthEdit.id}`)).send({
      notes: 'من فرعٍ آخر',
      status: 'SENT',
      validUntil: plusDays(90),
      lines: [exemptLine(`بندٌ من فرعٍ آخر ${suffix}`, 1)],
    });
    const after = (await ownerQuote(quoteSouthEdit.id).expect(200)).body as QuoteView;
    expect({
      httpStatus: res.status,
      notes: after.notes,
      status: after.status,
      total: Number(after.total),
    }).toEqual({
      httpStatus: 404,
      notes: SOUTH_QUOTE_NOTES,
      status: 'DRAFT',
      total: LINE_PRICE,
    });
  });

  // #17
  it('[SPEC 2.7] 🔴 حذفُ عرضِ سعرِ فرعٍ آخر بمعرّفه — 404، والعرضُ باقٍ يقرؤه المالك `DELETE /quotes/:id`', async () => {
    const res = await asRestricted(http().delete(`/quotes/${quoteSouthDelete.id}`));
    const owner = await ownerQuote(quoteSouthDelete.id);
    expect({ httpStatus: res.status, ownerReadStatus: owner.status }).toEqual({ httpStatus: 404, ownerReadStatus: 200 });
  });

  // #18
  it('[SPEC 2.7] 🔴 تحويلُ عرضِ سعرِ فرعٍ آخر بمعرّفه — 404 برسالة العرض المفقود لا 403/409 التي تكشف وجودَه ورقمَ فاتورته وتاريخَ انقضائه `POST /quotes/:id/convert`', async () => {
    const missing = await asRestricted(http().post(`/quotes/${randomUUID()}/convert`)).send({}).expect(404);
    // ثلاثُ حالاتٍ لعرض الجنوب بما يسرّبه كلٌّ منها اليوم: قائمٌ (`403` من الفرع) · محوَّلٌ (`409` برقم الفاتورة) · منقضٍ (`409` بتاريخه).
    const plain = await asRestricted(http().post(`/quotes/${quoteSouthConvert.id}/convert`)).send({});
    const converted = await asRestricted(http().post(`/quotes/${quoteSouthConverted.id}/convert`)).send({});
    const expired = await asRestricted(http().post(`/quotes/${quoteSouthExpired.id}/convert`)).send({});
    const after = (await ownerQuote(quoteSouthConvert.id).expect(200)).body as QuoteView;
    const notFound = messageOf(missing);
    expect({
      statuses: { plain: plain.status, converted: converted.status, expired: expired.status },
      messages: { plain: messageOf(plain), converted: messageOf(converted), expired: messageOf(expired) },
      plainQuote: { status: after.status, convertedInvoice: after.convertedInvoice },
    }).toEqual({
      statuses: { plain: 404, converted: 404, expired: 404 },
      messages: { plain: notFound, converted: notFound, expired: notFound },
      plainQuote: { status: 'DRAFT', convertedInvoice: null },
    });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: عرضُ فرع الفاعل يُقرأ ويُعدَّل ويُحذف ويُحوَّل فاتورةً — فالرفضُ للفرع لا للفعل', async () => {
    const read = await asRestricted(http().get(`/quotes/${quoteNorth.id}`)).expect(200);
    expect((read.body as QuoteView).id).toBe(quoteNorth.id);
    const edited = await asRestricted(http().patch(`/quotes/${quoteNorth.id}`)).send({ notes: `عرضُ الشمال المعدَّل ${suffix}`, status: 'SENT' }).expect(200);
    expect((edited.body as QuoteView).status).toBe('SENT');
    await asRestricted(http().delete(`/quotes/${quoteNorthDelete.id}`)).expect(204);
    const conversion = await asRestricted(http().post(`/quotes/${quoteNorth.id}/convert`)).send({}).expect(201);
    expect((conversion.body as { quote: QuoteView }).quote.status).toBe('CONVERTED');
  });
});
