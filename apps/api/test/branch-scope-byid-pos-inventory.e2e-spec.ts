import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { MockTerminalAdapter, TERMINAL_ADAPTERS } from '../src/integrations/payment-terminal.adapter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — الحزمةُ كلُّها 103.2 ث أوّلَ تشغيلٍ بترجمتها على `mad_app_clean` (فأطولُ اختبارٍ دونها)، مقيسةٌ لا مفترَضة.
jest.setTimeout(320000);

type As = (r: request.Test) => request.Test;
interface Created {
  id: string;
}
interface ShiftRow {
  id: string;
  status: string;
}
interface AttemptView {
  id: string;
  status: string;
}
interface AttachmentRow {
  id: string;
  writeOffId: string;
  filename: string;
}

/** صفوفُ قائمةٍ بشكلها — مصفوفةً (بلا `page`) أو مغلَّفةً (`items`). */
const rowsOf = <T>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (body as { items: T[] }).items);

/**
 * قياسٌ بأسماءٍ تقول السبب: كلُّ صفٍّ `[الواقعة، المقيس، المقصود]` — والمقارنةُ واحدةٌ على الكلّ، فتُقرأ الحالاتُ معاً
 * ولا يُخفي سقوطُ الأولى ما بعدها (القياسُ غرضُ هذه الحزمة، لا الحكمُ عند أوّل مخالفة).
 */
function measure(rows: ReadonlyArray<readonly [string, unknown, unknown]>): void {
  expect(Object.fromEntries(rows.map(([cause, got]) => [cause, got]))).toEqual(Object.fromEntries(rows.map(([cause, , want]) => [cause, want])));
}

/**
 * 🔴 **قياسٌ لا إصلاح — نقطةُ البيع ومرفقاتُ الشطب بالمعرّف** (تدقيقُ المسارات بالمعرّف، البنود `#19`–`#25`).
 *
 * موظّفٌ مقيَّدٌ بفرع الشمال يفعل **بمعرّفِ صفٍّ في الجنوب**: يُقفل مناوبةً (`#19`) · يشحن محاولةَ دفعٍ أو يلغيها
 * (`#20` · `#21`) · يطلب رابطَ مرفقِ شطبٍ أو يحذفه أو يسرد مرفقاتِ الواقعة أو يُضيف إليها (`#22`–`#25`) — والخدمةُ
 * تقرأ الصفَّ بمعرّفه وحدَه، وقائمةُ المسار نفسِه تحجبه عنه (المقدّمةُ مُصادَقةٌ في `beforeAll`).
 * **فالاختباراتُ توكّد المقصودَ لا الواقع: على شيفرة اليوم يُتوقَّع أن تسقط المساراتُ المكسورة — وسقوطُها هو القياس.**
 *
 * **الحكم**: الصفُّ خارج فروع الفاعل غيرُ موجودٍ له — 404 لا 403، فلا يُسرَّب وجودُ صفِّ فرعٍ آخر ولا حالُه.
 *
 * **ولنقطة البيع حالتان في كلِّ مسار — والمقيسُ هنا الأولى وحدَها:**
 *  ① **صفُّ غيره** في الجنوب — ترفضه الملكيّةُ اليوم بـ`403` (`openedById` في الإقفال · `readOwn` في المحاولة: صاحبُها أو
 *     المالك). **فـ`403` هنا ملكيّةٌ تمنع الكتابة، لا ثقبُ فرع** — لكنها تكشف وجودَ صفٍّ تحجبه القائمة (والإقفالُ يكشف
 *     حالَه أيضاً: `409` على المقفلة قبل فحص الفاعل)، وقاعدةُ البيت `404`.
 *  ② **صفُّه هو** — فتحه في الجنوب ثم نقله المالكُ إلى الشمال والمناوبةُ مفتوحة (تبقى مفتوحةً بالتصميم —
 *     `pos.service.ts` `openShift`): **هنا تقع الكتابة**، والملكيّةُ لا تحميه لأنه صاحبُها. **وهي قرارُ تصميمٍ معلَّق للمالك**
 *     (`ق-١٤٤٠`): `openShift` يجد مناوبتَه المفتوحة بهويّته فيمنع ثانيةً، و`404` عليها يحبس الكاشير — فأُخرجت من الحزمة
 *     بعد قياسها (تُقفل وتُشحن وتُلغى).
 *
 * ⚠️ **والحكمُ بحال الصفّ عند المالك لا برمز الردّ وحدَه**: إلغاءُ ② كان يُلتزم ثم يردّ `404` (`view` تقرأ بفروع الفاعل بعد
 * الكتابة) — رمزٌ صحيحٌ على صفٍّ تغيّر («معنونةٌ» ليست «مؤكَّدة» — `§8.14`). ولكلِّ مسارٍ يكتب يُعاد قراءةُ الصفّ بيد المالك.
 *
 * **ومالكُ المنشأة يرى الفروعَ كلَّها** فيُنشئ الصفوفَ ويقرؤها؛ وحالةٌ موجبةٌ لكلِّ خدمة (المناوبة · محاولةُ الدفع ·
 * مرفقاتُ الشطب) يفعل فيها موظّفُ الشمال الفعلَ نفسَه على صفٍّ في الشمال — فالرفضُ للفرع لا للفعل.
 */
describe('فروعُ الفاعل عند الفعل بالمعرّف — نقطةُ البيع ومرفقاتُ الشطب (قياس #19–#25)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'ScopePass123!';
  const http = () => request(app.getHttpServer());
  const bearer =
    (token: string): As =>
    (r) =>
      r.set('Authorization', `Bearer ${token}`);
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);

  const mock = TERMINAL_ADAPTERS.MOCK as MockTerminalAdapter;
  /** رمزُ السبب **يُقرأ من مصدره** — التوريدُ الاعتباريّ يُردّ عند الباب، فيُؤخذ ما لا تعديلَ فيه. */
  const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;
  // يومُ `UTC` لا يسبق يومَ الرياض أبداً — فلا يقع تاريخُ الواقعة في المستقبل.
  const today = () => new Date().toISOString().slice(0, 10);
  const CLOSE_BODY = { declaredClosing: 0, closedOffsetMin: 180 };

  let templateId: string;
  let northId: string;
  let southId: string;
  let productId: string;
  // نقطةُ البيع — ① صفوفُ غيره في الجنوب (② صفوفُه هو بعد نقله قرارٌ معلَّق للمالك — لا تُقاس هنا).
  let ownerSouthShift: string; // #19 ①
  let southAttemptToCharge: string; // #20 ①
  let southAttemptToCancel: string; // #21 ①
  // الشطب — واقعةٌ في كلِّ فرع، ومرفقان على واقعة الجنوب (لكلِّ مسارٍ مرفقُه فلا يتعلّق أحدُهما بترتيب الآخر).
  let writeOffSouth: string;
  let writeOffNorth: string;
  let attachmentSouthRead: string; // #22 · #24
  let attachmentSouthDelete: string; // #23

  const createUser = async (name: string, tag: string, branchIds: string[]): Promise<{ id: string; token: string }> => {
    const username = `${tag}-byid-pos-${suffix}`;
    const created = await asOwner(http().post('/company-users')).send({ name, username, password: PASSWORD, permissionTemplateId: templateId, branchIds }).expect(201);
    // الدخولُ يردّ `200` لا `201` (`@HttpCode` على المسار).
    const login = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    return { id: (created.body as Created).id, token: (login.body as { accessToken: string }).accessToken };
  };
  const openShift = async (as: As, branchId: string): Promise<string> =>
    ((await as(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body as Created).id;
  /** مناوبةُ موظّف الشمال المفتوحة — أو تُفتح في الشمال (مناوبةٌ مفتوحةٌ واحدة لكلِّ كاشير). */
  const openNorthShift = async (): Promise<string> => {
    const current = (await asRestricted(http().get('/pos/shifts/current')).expect(200)).body.shift as Partial<ShiftRow> | null;
    if (current?.id) return current.id;
    return openShift(asRestricted, northId);
  };
  const ringing = () => ({ clientSaleId: randomUUID(), ringAt: new Date().toISOString(), ringOffsetMin: 180, lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD' });
  const createAttempt = async (as: As): Promise<string> => {
    const body = (await as(http().post('/pos/payment-attempts')).send(ringing()).expect(201)).body as AttemptView;
    expect(body.status).toBe('CREATED');
    return body.id;
  };
  const uploadTo = (as: As, writeOffId: string, text: string, filename: string) =>
    as(http().post(`/inventory/write-offs/${writeOffId}/attachments`)).attach('file', Buffer.from(`%PDF-1.4 ${text}`), { filename, contentType: 'application/pdf' });

  // ما يقرؤه المالكُ (يرى الفروعَ كلَّها) — هو الحكمُ على ما تغيّر.
  const shiftStatus = async (id: string): Promise<string | null> =>
    rowsOf<ShiftRow>((await asOwner(http().get('/pos/shifts')).expect(200)).body).find((s) => s.id === id)?.status ?? null;
  const attemptStatus = async (id: string): Promise<string> => ((await asOwner(http().get(`/pos/payment-attempts/${id}`)).expect(200)).body as AttemptView).status;
  const attachmentIds = async (writeOffId: string): Promise<string[]> =>
    ((await asOwner(http().get(`/inventory/write-offs/${writeOffId}/attachments`)).expect(200)).body as AttachmentRow[]).map((a) => a.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'scope-byid-pos');
    northId = ((await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body as Created).id;
    southId = ((await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body as Created).id;

    // قالبٌ تملكه المنشأة بالشاشتين وأفعالهما كلِّها (بلا تفصيل = كلُّ الأفعال) — فالرفضُ لا يأتي من القالب.
    templateId = ((await asOwner(http().post('/templates')).send({ name: `نقطة البيع والمخزون ${suffix}`, allowedScreens: ['dashboard', 'pos', 'inventory'] }).expect(201)).body as Created).id;
    restrictedToken = (await createUser('موظّف الشمال', 'north', [northId])).token;
    const southCashier = await createUser('كاشير الجنوب', 'south', [southId]);

    productId = ((await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف القياس ${suffix}`, price: 100 }).expect(201)).body as Created).id;
    // بوابةُ دفعٍ فعّالة — شرطُ إنشاء المحاولة وشحنها (المحوّلُ التجريبيّ: يقبل كلَّ مبلغٍ لا تنتهي هللاتُه بـ13).
    await asOwner(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `byid-pos-${suffix}` } }).expect(201);

    // ① صفوفُ غيره في الجنوب: مناوبةُ المالك، ومحاولتا كاشير الجنوب على مناوبته.
    ownerSouthShift = await openShift(asOwner, southId);
    const asSouthCashier = bearer(southCashier.token);
    await openShift(asSouthCashier, southId);
    southAttemptToCharge = await createAttempt(asSouthCashier);
    southAttemptToCancel = await createAttempt(asSouthCashier);

    // الشطب — والمرفقُ يرفعه المالك (يرى الفروعَ كلَّها).
    const warehouseId = ((await asOwner(http().post('/warehouses')).send({ name: `مستودع القياس ${suffix}` }).expect(201)).body as Created).id;
    const recordWriteOff = async (branchId: string, note: string): Promise<string> =>
      ((await asOwner(http().post('/inventory/write-offs')).send({ productId, warehouseId, branchId, qty: 1, reasonCode: NO_ADJUSTMENT.code, occurredAt: today(), note }).expect(201)).body as Created).id;
    writeOffSouth = await recordWriteOff(southId, 'تلفٌ في الجنوب');
    writeOffNorth = await recordWriteOff(northId, 'تلفٌ في الشمال');
    attachmentSouthRead = ((await uploadTo(asOwner, writeOffSouth, 'محضر إتلاف الجنوب', 'محضر-الجنوب.pdf').expect(201)).body as AttachmentRow).id;
    attachmentSouthDelete = ((await uploadTo(asOwner, writeOffSouth, 'صورة التلف في الجنوب', 'صورة-الجنوب.pdf').expect(201)).body as AttachmentRow).id;

    // المقدّمةُ مُصادَقةٌ قبل القياس: صفوفُ الجنوب قائمةٌ عند المالك، والقوائمُ نفسُها تحجبها عن موظّف الشمال —
    // فما يُقاس بعدها ثقبُ المعرّف وحدَه لا غيابُ الصفّ.
    expect(await shiftStatus(ownerSouthShift)).toBe('OPEN');
    expect(await attachmentIds(writeOffSouth)).toEqual(expect.arrayContaining([attachmentSouthRead, attachmentSouthDelete]));
    const hiddenShifts = rowsOf<ShiftRow>((await asRestricted(http().get('/pos/shifts')).expect(200)).body);
    const hiddenAttempts = rowsOf<AttemptView>((await asRestricted(http().get('/pos/payment-attempts')).expect(200)).body);
    const visibleWriteOffs = rowsOf<Created>((await asRestricted(http().get('/inventory/write-offs')).expect(200)).body);
    measure([
      ['قائمةُ المناوبات تُري موظّفَ الشمال مناوبةَ المالك في الجنوب', hiddenShifts.some((s) => s.id === ownerSouthShift), false],
      ['قائمةُ المحاولات تُريه محاولةَ كاشير الجنوب', hiddenAttempts.some((a) => a.id === southAttemptToCharge), false],
      ['قائمةُ الشطب تُريه واقعةَ الجنوب', visibleWriteOffs.some((w) => w.id === writeOffSouth), false],
      ['قائمةُ الشطب تُريه واقعةَ الشمال', visibleWriteOffs.some((w) => w.id === writeOffNorth), true],
    ]);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  // ───────── المناوبة — `PosService.closeShift` ─────────

  // #19 — POST /pos/shifts/:id/close [pos:review]
  it('[SPEC 2.7] 🔴 إقفالُ مناوبةِ غيره في فرعٍ آخر بالمعرّف — 404 ولا تُقفل `POST /pos/shifts/:id/close`', async () => {
    // الحالةُ ② (مناوبتُه هو بعد نقله) قرارُ تصميمٍ معلَّق للمالك — لحكمك في ق-١٤٤٠؛ قِيست: تُقفل وتُشحن وتُلغى
    const othersShift = await asRestricted(http().post(`/pos/shifts/${ownerSouthShift}/close`)).send(CLOSE_BODY);
    measure([
      // ⚖️ ① يردّ اليوم `403` (`pos_not_your_shift` — المالكُ وحدَه يُقفل مناوبةَ غيره): ملكيّةٌ لا ثقبُ فرع، لكنها تكشف الوجود.
      ['رمزُ ① مناوبةِ المالك في الجنوب', othersShift.status, 404],
      ['حالُ مناوبة المالك بعده', await shiftStatus(ownerSouthShift), 'OPEN'],
    ]);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: موظّفُ الشمال يُقفل مناوبتَه في الشمال — فالرفضُ للفرع لا للفعل', async () => {
    const shiftId = await openNorthShift();
    const closed = await asRestricted(http().post(`/pos/shifts/${shiftId}/close`)).send(CLOSE_BODY).expect(201);
    expect((closed.body as ShiftRow).status).toBe('CLOSED');
  });

  // ───────── محاولةُ دفع البطاقة — `PosPaymentAttemptsService.readOwn` ─────────

  // #20 — POST /pos/payment-attempts/:id/charge [pos:record]
  it('[SPEC 2.7] 🔴 شحنُ محاولةِ دفعِ غيره على مناوبةِ فرعٍ آخر بالمعرّف — 404 ولا يُسأل المزوّد `POST /pos/payment-attempts/:id/charge`', async () => {
    // الحالةُ ② (مناوبتُه هو بعد نقله) قرارُ تصميمٍ معلَّق للمالك — لحكمك في ق-١٤٤٠؛ قِيست: تُقفل وتُشحن وتُلغى
    const providerCharges = jest.spyOn(mock, 'charge');
    try {
      const others = await asRestricted(http().post(`/pos/payment-attempts/${southAttemptToCharge}/charge`));
      const references = providerCharges.mock.calls.map(([, charged]) => charged.reference);
      measure([
        // ⚖️ ① يردّ اليوم `403` (`pos_attempt_not_yours` — `readOwn`: صاحبُها أو المالك) قبل أيِّ كتابة: **ملكيّةٌ تمنع الشحن، لا ثقبُ
        //    فرع** — لكنه يُثبت وجودَ محاولةٍ تحجبها القائمة، وقاعدةُ البيت `404`.
        ['رمزُ ① محاولةِ كاشير الجنوب', others.status, 404],
        ['نداءاتُ المزوّد لمحاولة ①', references.filter((ref) => ref === southAttemptToCharge).length, 0],
        ['حالُ محاولة ① بعده', await attemptStatus(southAttemptToCharge), 'CREATED'],
      ]);
    } finally {
      providerCharges.mockRestore();
    }
  });

  // #21 — POST /pos/payment-attempts/:id/cancel [pos:record]
  it('[SPEC 2.7] 🔴 إلغاءُ محاولةِ دفعِ غيره على مناوبةِ فرعٍ آخر بالمعرّف — 404 ولا تُلغى `POST /pos/payment-attempts/:id/cancel`', async () => {
    // الحالةُ ② (مناوبتُه هو بعد نقله) قرارُ تصميمٍ معلَّق للمالك — لحكمك في ق-١٤٤٠؛ قِيست: تُقفل وتُشحن وتُلغى
    const others = await asRestricted(http().post(`/pos/payment-attempts/${southAttemptToCancel}/cancel`));
    measure([
      // ⚖️ ① يردّ اليوم `403` (`readOwn`) قبل الكتابة: ملكيّةٌ لا ثقبُ فرع — والقاعدةُ `404`.
      ['رمزُ ① محاولةِ كاشير الجنوب', others.status, 404],
      ['حالُ محاولة ① بعده', await attemptStatus(southAttemptToCancel), 'CREATED'],
    ]);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: موظّفُ الشمال يلغي محاولتَه على مناوبة الشمال ويشحن أخرى — فالرفضُ للفرع لا للفعل', async () => {
    await openNorthShift();
    const toCancel = await createAttempt(asRestricted);
    const toCharge = await createAttempt(asRestricted);
    const cancelled = await asRestricted(http().post(`/pos/payment-attempts/${toCancel}/cancel`)).expect(201);
    expect((cancelled.body as AttemptView).status).toBe('CANCELLED');
    const charged = await asRestricted(http().post(`/pos/payment-attempts/${toCharge}/charge`)).expect(201);
    expect((charged.body as AttemptView).status).toBe('COMPLETED');
  });

  // ───────── مرفقاتُ الشطب — `WriteOffAttachmentsService` ─────────

  // #22 — GET /inventory/write-offs/attachments/:attachmentId/download-url [inventory:view]
  it('[SPEC 2.7] 🔴 رابطُ تنزيل مرفقٍ على شطبِ فرعٍ آخر بالمعرّف — 404 بلا رابط `GET /inventory/write-offs/attachments/:attachmentId/download-url`', async () => {
    const res = await asRestricted(http().get(`/inventory/write-offs/attachments/${attachmentSouthRead}/download-url`));
    measure([
      ['رمزُ الردّ', res.status, 404],
      // اليوم `200` برابطٍ موقَّت: دليلُ تلفِ الجنوب (صورةٌ · محضرُ إتلاف · تقريرُ شرطة) يُنزَّل من الشمال.
      ['رابطُ التنزيل في الردّ', (res.body as { url?: string }).url ?? null, null],
    ]);
  });

  // #23 — DELETE /inventory/write-offs/attachments/:attachmentId [inventory:record]
  it('[SPEC 2.7] 🔴 حذفُ مرفقٍ على شطبِ فرعٍ آخر بالمعرّف — 404 ويبقى الدليل `DELETE /inventory/write-offs/attachments/:attachmentId`', async () => {
    const res = await asRestricted(http().delete(`/inventory/write-offs/attachments/${attachmentSouthDelete}`));
    measure([
      ['رمزُ الردّ', res.status, 404],
      // اليوم `204`: حذفٌ صلبٌ للصفّ وللكائن في التخزين — بلا سلّةٍ ولا عودة.
      ['المرفقُ باقٍ في مرفقات واقعة الجنوب عند المالك', (await attachmentIds(writeOffSouth)).includes(attachmentSouthDelete), true],
    ]);
  });

  // #24 — GET /inventory/write-offs/:id/attachments [inventory:view]
  it('[SPEC 2.7] 🔴 سردُ مرفقاتِ شطبِ فرعٍ آخر بالمعرّف — 404 بلا معرّفاتها `GET /inventory/write-offs/:id/attachments`', async () => {
    const res = await asRestricted(http().get(`/inventory/write-offs/${writeOffSouth}/attachments`));
    measure([
      ['رمزُ الردّ', res.status, 404],
      // اليوم `200` بالمعرّفات وأسماء الملفات — وهي ما يغذّي مسارَي الرابط والحذف أعلاه.
      ['معرّفُ مرفقِ الجنوب في الردّ', JSON.stringify(res.body).includes(attachmentSouthRead), false],
    ]);
  });

  // #25 — POST /inventory/write-offs/:id/attachments [inventory:record]
  it('[SPEC 2.7] 🔴 رفعُ مرفقٍ على شطبِ فرعٍ آخر بالمعرّف — 404 ولا يُضاف شيء `POST /inventory/write-offs/:id/attachments`', async () => {
    const before = await attachmentIds(writeOffSouth);
    const res = await uploadTo(asRestricted, writeOffSouth, 'دليلٌ من فرعٍ آخر', 'من-فرع-آخر.pdf');
    const after = await attachmentIds(writeOffSouth);
    measure([
      ['رمزُ الردّ', res.status, 404],
      // اليوم `201`: ملفٌّ يُزرع في دليل واقعةٍ لا يراها الرافع.
      ['ما أُضيف إلى مرفقات واقعة الجنوب', after.filter((id) => !before.includes(id)), []],
    ]);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: موظّفُ الشمال يرفع مرفقاً على شطبِ الشمال ويسرده وينزّله ويحذفه — فالرفضُ للفرع لا للفعل', async () => {
    const added = await uploadTo(asRestricted, writeOffNorth, 'محضر إتلاف الشمال', 'محضر-الشمال.pdf').expect(201);
    const attachmentId = (added.body as AttachmentRow).id;
    const listed = await asRestricted(http().get(`/inventory/write-offs/${writeOffNorth}/attachments`)).expect(200);
    expect((listed.body as AttachmentRow[]).map((a) => a.id)).toContain(attachmentId);
    const link = await asRestricted(http().get(`/inventory/write-offs/attachments/${attachmentId}/download-url`)).expect(200);
    expect(typeof (link.body as { url: string }).url).toBe('string');
    await asRestricted(http().delete(`/inventory/write-offs/attachments/${attachmentId}`)).expect(204);
    expect(await attachmentIds(writeOffNorth)).not.toContain(attachmentId);
  });
});
