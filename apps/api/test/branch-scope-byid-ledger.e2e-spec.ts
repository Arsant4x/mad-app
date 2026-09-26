import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — الحزمةُ كلُّها 18.8 ث على `mad_app_clean` (فأطولُ اختبارٍ دونها)، مقيسةٌ لا مفترَضة.
jest.setTimeout(240000);

/** سطرُ حركةٍ بنكيّة كما يردّه `GET /transactions` (المبلغُ `Decimal` يصل نصّاً). */
interface BankTxRow {
  id: string;
  bankId: string;
  description: string;
  amount: string | number;
  date: string;
  source: string | null;
}

/** ما يردّه `GET /transactions` — صفحةٌ لا مصفوفة. */
interface BankTxPage {
  items: BankTxRow[];
  total: number;
}

/** ما يردّه `GET /trash` — مجموعاتٌ بالكيان، وفي كلٍّ صفوفُه بمعرّفاتها. */
interface TrashListing {
  retentionDays: number;
  groups: { entity: string; items: { id: string; name: string }[] }[];
}

/** قيدٌ كما يردّه `POST /journal`. */
interface JournalEntryRow {
  id: string;
  no: string;
}

/**
 * 🔴 **قياسٌ لا إصلاح — مسحُ مسارات المعرّف (review-264) #26–#30، مجالُ الدفتر.**
 *
 * **ما يُقاس**: موظّفٌ مقيَّدٌ بفرع الشمال (`branchIds: [الشمال]`) وقالبُه يمنح شاشاتِ الحركات البنكية والقيود والسلّة
 * **بأفعالها كلِّها** (بلا `screenActions`) — يطلب بالمعرّف صفّاً **من فرع الجنوب** لا يراه في قوائمه:
 * - `#26` `PATCH /transactions/:id` — يعدّل سطرَ حركةِ بنكِ الجنوب (المبلغ والبيان والتاريخ، بل **ويعيد نسبتَه إلى بنكٍ آخر**).
 * - `#27` `DELETE /transactions/:id` — **يحذفه حذفاً صلباً** (لا سلّةَ له).
 * - `#28` `DELETE /journal/:id` — المسارُ لا يحذف أبداً (يُرفض دائماً `409`)، **لكن رفضَه يسمّي رقمَ قيدِ الجنوب أو نوعَه**
 *   (يدويٌّ برقمه · آليٌّ برسالته) — فيُثبت وجودَ صفٍّ مخفيٍّ ويكشف رقمَه؛ والمقصودُ أن يُجاب كالمعرّف الذي لا وجودَ له.
 * - `#29` `POST /trash/:entity/:id/restore` — يستعيد موظّفَ الجنوب وصندوقَه بعد أن حذفهما المالك.
 * - `#30` `DELETE /trash/:entity/:id` — **يمحوهما نهائياً** متخطّياً نافذةَ الاسترداد.
 *
 * ⚠️ **على شيفرة اليوم يُتوقَّع أن تسقط الحالاتُ الخمس المعلَّمة 🔴** — فالخدماتُ تقرأ الصفَّ بمعرّفه وحدَه ولا تمرّر
 * فروعَ الفاعل؛ وسقوطُها هو القياس. **والحالاتُ الموجبة تمرّ اليوم وبعد الإصلاح**: الفاعلُ نفسُه يبلغ صفوفَ فرعه بالمسار
 * نفسِه — فالرفضُ المطلوب للفرع لا للفعل ولا للقالب.
 *
 * **الحكم** (كما في `ق-١٤١١` و`branch-scope-by-id.e2e-spec.ts`): **الصفُّ خارجَ فروعِ الفاعلِ غيرُ موجودٍ له — 404 لا 403**،
 * فلا يُسرَّب وجودُ مستندِ فرعٍ آخر. وحيث يكتب المسار، **يعيد المالكُ قراءةَ صفِّ الجنوب** ويوكّد أن الحقلَ الذي كان
 * الاستغلالُ سيغيّره لم يتغيّر.
 *
 * **وكلُّ حالةٍ على صفٍّ خاصٍّ بها** (سطرٌ للتعديل وآخرُ للحذف، وموظّفٌ وصندوقٌ للاستعادة وآخران للمحو): فلو حذف مسارُ
 * `#27` اليومَ صفّاً يشاركه `#26` لأجاب `#26` بـ`404` **لأن الصفَّ زال لا لأن الفرعَ حُرس** — وقياسٌ يمرّ بسقوط جاره
 * ليس قياساً.
 */
describe('فروعُ الفاعل عند المسارات بالمعرّف — الحركاتُ البنكية والقيودُ والسلّة (مسحُ ٢٦٤ · #26–#30)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);
  // يومُ الطلب بـUTC (`toISOString`) كما في `journal-reversal.e2e-spec.ts` — لا بمنطقة العملية.
  const today = () => new Date().toISOString().slice(0, 10);
  // معرّفٌ لا صفَّ له — جوابُ المسار عليه هو ما يجب أن يُجاب به صفُّ الفرع الآخر حرفاً.
  const GHOST_ID = '00000000-0000-4000-8000-000000000000';

  let northId: string;
  let southId: string;

  // الحركاتُ البنكية (#26 · #27): بنكٌ لكلِّ فرع، وسطران في الجنوب (تعديلٌ · حذف) وسطرٌ في الشمال للموجبة.
  let bankNorthTx: string;
  let bankSouthTx: string;
  let txSouthForEdit: string;
  let txSouthForDelete: string;
  let txNorth: string;

  // القيود (#28): قيدٌ يدويٌّ في كلِّ فرع — وحساباه من الدليل الافتراضيّ للمنشأة المعزولة.
  let cashAccountId: string;
  let revenueAccountId: string;
  let journalSouth: JournalEntryRow;
  let journalNorth: JournalEntryRow;

  // السلّة (#29 · #30): موظّفٌ وصندوقٌ في الجنوب لكلِّ مسار، ومثلُها في الشمال للموجبة — كلُّها حذفها المالكُ حذفاً ناعماً.
  let employeeSouthForRestore: string;
  let bankSouthForRestore: string;
  let employeeSouthForPurge: string;
  let bankSouthForPurge: string;
  let employeeNorthForRestore: string;
  let bankNorthForRestore: string;
  let employeeNorthForPurge: string;
  let bankNorthForPurge: string;

  /** صفُّ الحركة كما يراه المالك — والمنشأةُ معزولةٌ فالصفحةُ الواحدة تحمل كلَّ سطورها. */
  const ownerTx = async (id: string): Promise<BankTxRow | undefined> => {
    const page = (await asOwner(http().get('/transactions').query({ pageSize: 100 })).expect(200)).body as BankTxPage;
    return page.items.find((t) => t.id === id);
  };

  /** أفي سلّة المالك هذا الصفُّ من هذا الكيان؟ */
  const inOwnerTrash = async (entity: 'employees' | 'banks', id: string): Promise<boolean> => {
    const listing = (await asOwner(http().get('/trash')).expect(200)).body as TrashListing;
    return (listing.groups.find((g) => g.entity === entity)?.items ?? []).some((i) => i.id === id);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'scope-byid-ledger');
    northId = ((await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body as { id: string }).id;
    southId = ((await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body as { id: string }).id;

    // قالبٌ تملكه المنشأة بالشاشات الثلاث وأفعالها كلِّها (بلا تفصيل = كلُّ الأفعال) — فالرفضُ لا يأتي من القالب.
    const template = (await asOwner(http().post('/templates'))
      .send({ name: `الدفتر والسلّة ${suffix}`, allowedScreens: ['dashboard', 'transactions', 'journal', 'audit'] })
      .expect(201)).body as { id: string };
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف الشمال', username: `north-ledger-${suffix}`, password: 'ScopePass123!', permissionTemplateId: template.id, branchIds: [northId] })
      .expect(201);
    // الدخولُ يردّ `200` لا `201` (`@HttpCode` على المسار — كما في `branch-scope-by-id.e2e-spec.ts`).
    restrictedToken = ((await http().post('/auth/login').send({ username: `north-ledger-${suffix}`, password: 'ScopePass123!' }).expect(200)).body as { accessToken: string }).accessToken;

    // ⚠️ `POST /banks` يوجب نوعَ الصفّ منذ `ق-١٤٣١` (`CASH_BOX` هنا) — والرصيدُ الافتتاحيّ محذوفٌ عمداً (صفر): فلا قيدَ
    //    افتتاحيّاً ولا صفَّ يشير إلى البنك، فيبقى المحوُ النهائيّ (#30) ممكناً لا محبوساً بالحفظ النظاميّ (`409`).
    const bank = async (name: string, branchId: string): Promise<string> =>
      ((await asOwner(http().post('/banks')).send({ name, kind: 'CASH_BOX', openingDate: '2026-01-01', branchId }).expect(201)).body as { id: string }).id;
    const employee = async (fullName: string, branchId: string): Promise<string> =>
      ((await asOwner(http().post('/employees')).send({ fullName, hireDate: '2026-01-01', branchId }).expect(201)).body as { id: string }).id;
    const transaction = async (bankId: string, description: string, branchId: string): Promise<string> =>
      ((await asOwner(http().post('/transactions')).send({ bankId, date: '2026-01-01', description, amount: 50, branchId }).expect(201)).body as { id: string }).id;

    // ── الحركاتُ البنكية ──
    bankNorthTx = await bank(`بنك الشمال ${suffix}`, northId);
    bankSouthTx = await bank(`بنك الجنوب ${suffix}`, southId);
    txSouthForEdit = await transaction(bankSouthTx, `حركة الجنوب للتعديل ${suffix}`, southId);
    txSouthForDelete = await transaction(bankSouthTx, `حركة الجنوب للحذف ${suffix}`, southId);
    txNorth = await transaction(bankNorthTx, `حركة الشمال ${suffix}`, northId);

    // ── القيود ──
    const accounts = (await asOwner(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    cashAccountId = accounts.find((a) => a.code === '1000')!.id;
    revenueAccountId = accounts.find((a) => a.code === '4100')!.id;
    const manualEntry = async (memo: string, branchId: string): Promise<JournalEntryRow> =>
      (await asOwner(http().post('/journal'))
        .send({
          date: today(),
          memo: `${memo} ${suffix}`,
          branchId,
          lines: [
            { accountId: cashAccountId, debit: 100, credit: 0 },
            { accountId: revenueAccountId, debit: 0, credit: 100 },
          ],
        })
        .expect(201)).body as JournalEntryRow;
    journalSouth = await manualEntry('قيد الجنوب', southId);
    journalNorth = await manualEntry('قيد الشمال', northId);

    // ── السلّة ──
    employeeSouthForRestore = await employee(`موظّف الجنوب للاستعادة ${suffix}`, southId);
    bankSouthForRestore = await bank(`صندوق الجنوب للاستعادة ${suffix}`, southId);
    employeeSouthForPurge = await employee(`موظّف الجنوب للمحو ${suffix}`, southId);
    bankSouthForPurge = await bank(`صندوق الجنوب للمحو ${suffix}`, southId);
    employeeNorthForRestore = await employee(`موظّف الشمال للاستعادة ${suffix}`, northId);
    bankNorthForRestore = await bank(`صندوق الشمال للاستعادة ${suffix}`, northId);
    employeeNorthForPurge = await employee(`موظّف الشمال للمحو ${suffix}`, northId);
    bankNorthForPurge = await bank(`صندوق الشمال للمحو ${suffix}`, northId);
    // المالكُ يحذفها حذفاً ناعماً فتدخل السلّة — والمستغِلُّ يقرأ معرّفاتها من `GET /trash` (خارجَ هذا القياس).
    for (const id of [employeeSouthForRestore, employeeSouthForPurge, employeeNorthForRestore, employeeNorthForPurge]) {
      await asOwner(http().delete(`/employees/${id}`)).expect(204);
    }
    for (const id of [bankSouthForRestore, bankSouthForPurge, bankNorthForRestore, bankNorthForPurge]) {
      await asOwner(http().delete(`/banks/${id}`)).expect(204);
    }
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  // ─────────────────────────────── الحركاتُ البنكية ───────────────────────────────

  // #26
  it('[SPEC 2.7] 🔴 تعديلُ حركةِ بنكِ فرعٍ آخر بالمعرّف — 404، ولا يتغيّر بيانُها ولا مبلغُها ولا تاريخُها ولا بنكُها `PATCH /transactions/:id`', async () => {
    await asRestricted(http().patch(`/transactions/${txSouthForEdit}`))
      .send({ description: 'عُدِّل من فرع الشمال', amount: 1, date: '2026-01-02', source: 'x' })
      .expect(404);
    // وإعادةُ نسبة السطر إلى بنكِ فرع الفاعل — الوجهُ الثاني من الاستغلال.
    await asRestricted(http().patch(`/transactions/${txSouthForEdit}`)).send({ bankId: bankNorthTx }).expect(404);

    const south = await ownerTx(txSouthForEdit);
    expect(south).toBeDefined();
    expect(south!.description).toBe(`حركة الجنوب للتعديل ${suffix}`);
    expect(Number(south!.amount)).toBe(50);
    expect(String(south!.date).slice(0, 10)).toBe('2026-01-01');
    expect(south!.source).toBeNull();
    expect(south!.bankId).toBe(bankSouthTx);
  });

  // #27
  it('[SPEC 2.7] 🔴 حذفُ حركةِ بنكِ فرعٍ آخر بالمعرّف — 404، والسطرُ باقٍ عند المالك `DELETE /transactions/:id`', async () => {
    await asRestricted(http().delete(`/transactions/${txSouthForDelete}`)).expect(404);

    const south = await ownerTx(txSouthForDelete);
    expect(south?.id).toBe(txSouthForDelete);
    expect(south?.description).toBe(`حركة الجنوب للحذف ${suffix}`);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يعدّل حركةَ بنكِ فرعه ثم يحذفها — فالرفضُ للفرع لا للفعل `PATCH · DELETE /transactions/:id`', async () => {
    const edited = (await asRestricted(http().patch(`/transactions/${txNorth}`)).send({ description: `حركة الشمال المعدَّلة ${suffix}` }).expect(200)).body as BankTxRow;
    expect(edited.description).toBe(`حركة الشمال المعدَّلة ${suffix}`);
    await asRestricted(http().delete(`/transactions/${txNorth}`)).expect(204);
    expect(await ownerTx(txNorth)).toBeUndefined();
  });

  // ─────────────────────────────── القيود ───────────────────────────────

  // #28 — المسارُ لا يكتب أبداً؛ فالقياسُ على الجواب وحده: أن يطابق جوابَ المعرّف الذي لا وجودَ له.
  it('[SPEC 2.7] 🔴 حذفُ قيدِ فرعٍ آخر بالمعرّف يُجاب كالقيد الذي لا وجودَ له — 404 لا 409 يسمّي رقمَه أو نوعَه `DELETE /journal/:id`', async () => {
    const ghost = await asRestricted(http().delete(`/journal/${GHOST_ID}`));
    expect(ghost.status).toBe(404);
    const ghostMessage = String((ghost.body as { message?: unknown }).message);

    // ① القيدُ اليدويّ: رفضُ اليوم `409` برسالةٍ تحمل رقمَه (`JE-…`).
    const manual = await asRestricted(http().delete(`/journal/${journalSouth.id}`));
    const manualMessage = String((manual.body as { message?: unknown }).message);
    expect({ status: manual.status, message: manualMessage, leaksNo: manualMessage.includes(journalSouth.no) }).toEqual({
      status: 404,
      message: ghostMessage,
      leaksNo: false,
    });

    // ② القيدُ الآليّ: رفضُ اليوم `409` برسالةٍ مميَّزة تكشف أنه من فاتورةٍ أو مشتريات. يُهيَّأ هنا لا في `beforeAll`
    //    كي لا يُسقط تعذّرُ الفوترة — إن وقع — القياساتِ الأخرى؛ وسقوطُه يسمّي نفسَه (`expected 201`).
    const customer = (await asOwner(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الجنوب ${suffix}` }).expect(201)).body as { id: string };
    const invoice = (await asOwner(http().post('/invoices'))
      .send({
        customerId: customer.id,
        issueDate: today(),
        dueDate: today(),
        branchId: southId,
        lines: [{ description: 'خدمة في الجنوب', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201)).body as { branchId: string | null; journalEntryId: string | null };
    expect(invoice.branchId).toBe(southId);
    expect(invoice.journalEntryId).toBeTruthy();
    const auto = await asRestricted(http().delete(`/journal/${invoice.journalEntryId!}`));
    expect({ status: auto.status, message: String((auto.body as { message?: unknown }).message) }).toEqual({
      status: 404,
      message: ghostMessage,
    });
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يبلغ قيدَ فرعه فيُرفض بمسمّاه (409 برقمه — المسارُ لا يحذف أبداً) — فالـ404 للفرع لا للفعل `DELETE /journal/:id`', async () => {
    const res = await asRestricted(http().delete(`/journal/${journalNorth.id}`)).expect(409);
    expect(String((res.body as { message?: unknown }).message)).toContain(journalNorth.no);
  });

  // ─────────────────────────────── السلّة ───────────────────────────────

  // #29
  it('[SPEC 2.7] 🔴 استعادةُ موظّفِ فرعٍ آخر وصندوقِه من السلّة بالمعرّف — 404، ويبقيان في سلّة المالك `POST /trash/:entity/:id/restore`', async () => {
    await asRestricted(http().post(`/trash/employees/${employeeSouthForRestore}/restore`)).expect(404);
    await asRestricted(http().post(`/trash/banks/${bankSouthForRestore}/restore`)).expect(404);

    expect(await inOwnerTrash('employees', employeeSouthForRestore)).toBe(true);
    expect(await inOwnerTrash('banks', bankSouthForRestore)).toBe(true);
  });

  // #30
  it('[SPEC 2.7] 🔴 محوُ موظّفِ فرعٍ آخر وصندوقِه من السلّة نهائياً بالمعرّف — 404، ويبقيان في سلّة المالك `DELETE /trash/:entity/:id`', async () => {
    await asRestricted(http().delete(`/trash/employees/${employeeSouthForPurge}`)).expect(404);
    await asRestricted(http().delete(`/trash/banks/${bankSouthForPurge}`)).expect(404);

    expect(await inOwnerTrash('employees', employeeSouthForPurge)).toBe(true);
    expect(await inOwnerTrash('banks', bankSouthForPurge)).toBe(true);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: الفاعلُ نفسُه يستعيد موظّفَ فرعه وصندوقَه ويمحو غيرَهما — فالرفضُ للفرع لا للفعل `POST /trash/:entity/:id/restore · DELETE /trash/:entity/:id`', async () => {
    const restoredEmployee = (await asRestricted(http().post(`/trash/employees/${employeeNorthForRestore}/restore`)).expect(201)).body as { restored: boolean; entity: string; id: string };
    expect(restoredEmployee).toEqual({ restored: true, entity: 'employees', id: employeeNorthForRestore });
    const restoredBank = (await asRestricted(http().post(`/trash/banks/${bankNorthForRestore}/restore`)).expect(201)).body as { restored: boolean; entity: string; id: string };
    expect(restoredBank).toEqual({ restored: true, entity: 'banks', id: bankNorthForRestore });
    // المستعادُ عاد إلى القوائم الحيّة: المالكُ يقرأ الموظّفَ بمعرّفه.
    await asOwner(http().get(`/employees/${employeeNorthForRestore}`)).expect(200);

    await asRestricted(http().delete(`/trash/employees/${employeeNorthForPurge}`)).expect(204);
    await asRestricted(http().delete(`/trash/banks/${bankNorthForPurge}`)).expect(204);

    expect(await inOwnerTrash('employees', employeeNorthForRestore)).toBe(false);
    expect(await inOwnerTrash('banks', bankNorthForRestore)).toBe(false);
    expect(await inOwnerTrash('employees', employeeNorthForPurge)).toBe(false);
    expect(await inOwnerTrash('banks', bankNorthForPurge)).toBe(false);
  });
});
