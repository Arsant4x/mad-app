import { PrismaClient, Prisma } from '@prisma/client';
import { assertPeriodOpen } from './period-lock.util';
import { createJournalEntry } from '../journal/journal-posting.util';
import { postInvoiceEntry, postPurchaseEntry, postCustomerPaymentEntry, purchaseExpenseAccountCode } from '../journal/auto-posting.util';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — `beforeAll` هنا يُنشئ ١٢ فترة و٧ حسابات (1606 ms).
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * قفل الفترة تحت انزياح المنطقة الزمنية — **إثباتٌ على أربعة مسارات لا على واحد**.
 *
 * ## العطل
 *
 * `assertPeriodOpen` كانت تقرأ `date.getMonth()` و`getFullYear()` — **محليّتين**.
 * وتواريخ المستندات تصل مُحلَّلةً من `YYYY-MM-DD`، وهي **UTC حصراً** بالمواصفة.
 * فالتاريخ `2027-03-01T00:00:00Z` يُقرأ:
 *
 *     UTC · Asia/Riyadh      ⇒ month = 3   (صحيح)
 *     America/New_York       ⇒ month = 2   ⟵ يبحث عن فترةٍ أخرى
 *
 * فإن كانت `03/2027` **مقفلة** و`02/2027` مفتوحة، **مرّ القيد إلى فترةٍ مقفلة**.
 * وهذا ليس عرضاً خاطئاً بل **بوابةً تُفتح**.
 *
 * ## لماذا أربعة مسارات
 *
 * `assertPeriodOpen` **بوابة كل ترحيل**، ولا تُنادى من الخدمات مباشرةً بل من
 * `createJournalEntry` وحدها. فنجاحُها على مسارٍ واحد **لا يقول شيئاً عن
 * البقية**: المطلوب إثبات أن كلاً من اليدوي والفاتورة والمشترى وسند القبض
 * **يصل البوابة فعلاً**، لا أن البوابة تعمل حين تُنادى مباشرةً (وذاك الاختبار ⑤).
 *
 * ## لماذا لا تُضبط المنطقة داخل الاختبار — قياسٌ لا افتراض
 *
 * أول صياغة كانت تُسنِد `process.env.TZ` داخل الاختبار. وهي **لا تفعل شيئاً
 * تحت jest**، والقياس (2026-08-15، هذه الآلة):
 *
 *     PROBE={"zone":"Asia/Riyadh","before":3,"afterAssign_newDate":3,
 *            "zoneAfter":"Asia/Riyadh","offsetAfter":-180,"envTz":"America/New_York"}
 *
 * أي أن المتغيّر **يُضبط** ولا تتغيّر المنطقة: بيئة `node` في jest تُركّب نسخةً
 * من `process.env` داخل سياق `vm`، فلا يُستدعى ضابط Node الأصلي الذي يُخطر V8
 * بتغيّر المنطقة. ولو بقي الاختبار على تلك الصياغة **لأعطى «لا انزياح» كذباً**.
 *
 * و`TZ=… npx jest` قبل الإقلاع **لا يعمل على ويندوز** أيضاً (قياسٌ في نفس
 * الجلسة: `TZ=America/New_York` و`TZ=UTC` أعطتا الشهر `3` كلتاهما). فالآليتان
 * المتاحتان تفشل كلٌّ منهما في بيئة — §8.13 بعينه.
 *
 * **فالمنطقة تُؤخَذ كما هي، ويُختار التاريخ الذي ينزاح فيها.** الزمنُ الذي
 * ينزاح غرب غرينتش هو أول لحظة من الشهر، والذي ينزاح شرقه آخر لحظة منه —
 * فيُجرَّب الاثنان ويُؤخذ ما ينزاح **فعلاً** في منطقة العملية.
 *
 * ## ⚠️ حدُّ هذا الحارس — ولا يُقرأ على غير وجهه
 *
 * **`America/New_York` في السير ليست تمثيلاً لحالتنا — بل نقيضَها.**
 *
 * الرياض **شرق** غرينتش (`+03`)، وتاريخُ المستند يصل منتصفَ ليل UTC. فـ
 * `2027-03-01T00:00:00Z` يُقرأ في الرياض `2027-03-01` الساعة `03:00` —
 * **اليوم نفسه والشهر نفسه**. أي أن مستأجراً في الرياض **لم يكن معرَّضاً
 * لهذا العطل أصلاً**، ولا في أي منطقةٍ شرق غرينتش.
 *
 * فالمعرَّض هو مستأجرٌ **غرب** غرينتش وحده (`America/*` · `Europe/London`
 * في الشتاء عند `+00` لا تنزاح · إلخ) — ولذلك تُضبط منطقة السير على واحدةٍ
 * غربية: **لتوجد الحالة المعرَّضة أصلاً**، لا لأنها حالتنا.
 *
 * 📌 ومن هنا **لا يجوز أن يُقرأ خضرةُ هذا الملف تغطيةً لتشغيلنا في الرياض**:
 *    ما يغطّيه هو الطرف الآخر من الخريطة. والقيمة أن المنصّة متعددة
 *    المستأجرين، ومنطقةُ الخادم قرارُ نشرٍ يتغيّر — فالبوابة يجب ألّا تعتمد
 *    على أيٍّ منهما، وهذا ما يُثبته.
 *
 * 📌 ولذلك أيضاً يجري التشغيل المحلي في الرياض على **آخر لحظة من الشهر**
 *    (`23:59Z`) لا على تاريخ مستندٍ واقعي: هي اللحظة الوحيدة التي تنزاح شرق
 *    غرينتش، فتُبقي الملف قادراً على الإثبات هنا. **والحالة الواقعية —
 *    منتصفُ ليل UTC — تُختبَر في السير وحده.**
 */

const CLOSED_YEAR = 2027;
const CLOSED_MONTH = 3;
const CLOSED_LABEL = '03/2027';

/**
 * أول لحظة من الشهر تنزاح غرب غرينتش (إلى 02)، وآخر لحظة تنزاح شرقه (إلى 04).
 * ويُنتقى ما ينزاح فعلاً — فلا يُفترض اتجاهٌ ولا تُحسب إزاحة.
 */
const DRIFTING_DATE = [
  new Date(Date.UTC(CLOSED_YEAR, CLOSED_MONTH - 1, 1, 0, 0, 0)),
  new Date(Date.UTC(CLOSED_YEAR, CLOSED_MONTH - 1, 31, 23, 59, 0)),
].find((d) => d.getMonth() + 1 !== CLOSED_MONTH);

const HAS_DB = Boolean(process.env.DATABASE_URL);

/**
 * تخطٍّ **معلَّل لا صامت**، ولحالة واحدة: منطقةٌ إزاحتها صفر (UTC) لا ينزاح
 * فيها أي تاريخ، فلا يستطيع هذا الملف إثبات شيء — وسقوطه حينها إزعاجٌ كاذب،
 * والحارس المُزعج يُعطَّل. ولذلك **يُلزَم السير بضبط `TZ`** فلا يقع التخطّي فيه.
 */
const SKIP_REASON = !HAS_DB
  ? 'لا DATABASE_URL'
  : !DRIFTING_DATE
    ? `منطقة العملية ${Intl.DateTimeFormat().resolvedOptions().timeZone} إزاحتها صفر — لا انزياح يُقاس. اضبط TZ=America/New_York`
    : null;

if (SKIP_REASON) {
  // eslint-disable-next-line no-console
  console.warn(`⚠️  period-lock-tz.live.spec: تُخطّى — ${SKIP_REASON}`);
}

const d = SKIP_REASON ? describe.skip : describe;

d('قفل الفترة تحت انزياح المنطقة — أربعة مسارات', () => {
  const prisma = new PrismaClient();
  const CLOSED_DATE = DRIFTING_DATE as Date;

  let companyId: string;
  let customerId: string;
  let supplierId: string;

  /** كل عملية داخل سياق المستأجر — بدونه تحجب RLS كل شيء. */
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return fn(tx);
    });

  beforeAll(async () => {
    // منشأةٌ خاصة بهذا المجسّ — لا مشاركة، فالتشغيل الثاني أخضر كالأول (§8.13).
    const template = await prisma.permissionTemplate.findFirstOrThrow({
      where: { companyId: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const identity = await prisma.loginIdentity.create({
      data: {
        username: `probe-period-tz-${stamp}`,
        passwordHash: 'probe-not-a-real-hash',
        actorType: 'COMPANY',
        company: { create: { orgName: `probe-period-tz-${stamp}`, permissionTemplateId: template.id } },
      },
      include: { company: { select: { id: true } } },
    });
    companyId = identity.company!.id;

    await inTenant(async (tx) => {
      const year = await tx.fiscalYear.create({
        data: {
          companyId,
          name: String(CLOSED_YEAR),
          start: new Date(Date.UTC(CLOSED_YEAR, 0, 1)),
          end: new Date(Date.UTC(CLOSED_YEAR, 11, 31)),
        },
      });

      /**
       * ⚠️ **الاثنا عشر شهراً كلها مفتوحة إلا `03`.**
       *
       * لأن الشهر الذي ينزاح إليه الخطأ يختلف باتجاه المنطقة (02 غرباً · 04
       * شرقاً). ولو غاب لرُفض القيد بـ«لا فترة لهذا التاريخ» — **فيبدو الحارس
       * عاملاً وهو ليس**، وهو رفضٌ لسببٍ آخر يُقرأ إثباتاً (§8.14).
       */
      for (let m = 1; m <= 12; m += 1) {
        await tx.fiscalPeriod.create({
          data: {
            companyId,
            fiscalYearId: year.id,
            month: m,
            year: CLOSED_YEAR,
            status: m === CLOSED_MONTH ? 'CLOSED' : 'OPEN',
          },
        });
      }

      /**
       * ⚠️ **كل حساب يحتاجه أيٌّ من المسارات الأربعة — وإلا تخطّى بصمت.**
       *
       * `resolveAccountIds` تُعيد `null` إن نقص رمزٌ واحد، فتُعيد دالة الترحيل
       * `null` **بلا استثناء ولا وصول إلى البوابة**. وهو ما وقع في أول تشغيل:
       * سقطت ②③④ بـ«لم يُرفض إطلاقاً» — لا لأن الحارس مكسور بل لأن المجسّ
       * لم يُنشئ 1200 و2100 و2200. والتخطّي الناعم **يشبه النجاح تماماً**.
       */
      const acc = (code: string, name: string, type: string) =>
        tx.account.create({ data: { companyId, code, name, type: type as never } });
      await acc('1000', 'النقدية', 'ASSET');
      await acc('1200', 'ذمم العملاء', 'ASSET');
      await acc('2100', 'ذمم الموردين', 'LIABILITY');
      await acc('2200', 'ضريبة القيمة المضافة', 'LIABILITY');
      await acc('4100', 'المبيعات', 'REVENUE');
      await acc(purchaseExpenseAccountCode(null), 'مصروفات إدارية وعمومية', 'EXPENSE');
      await acc('5600', 'فروق العملة', 'EXPENSE');

      customerId = (await tx.customer.create({ data: { companyId, name: 'عميل فحص' } })).id;
      supplierId = (await tx.supplier.create({ data: { companyId, name: 'مورّد فحص' } })).id;
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⓪ حارسٌ على القياس: التاريخ المختار ينزاح فعلاً في هذه المنطقة', () => {
    // بدونه، ملفٌّ يجري على تاريخٍ لا ينزاح يعطي «لا عطل» **كذباً**.
    expect(CLOSED_DATE.getUTCMonth() + 1).toBe(CLOSED_MONTH);
    expect(CLOSED_DATE.getMonth() + 1).not.toBe(CLOSED_MONTH);
  });

  /**
   * الرفض **برسالة الفترة بعينها** — لا بأي خطأ.
   *
   * توكيدٌ على مجرّد `rejects.toThrow()` يمرّ برفضٍ لسببٍ آخر (حساب ناقص ·
   * قيد غير متزن · فترة غير معرَّفة) فيبدو إثباتاً وهو ليس منه (§8.14).
   */
  const expectPeriodRefusal = async (label: string, run: () => Promise<unknown>) => {
    const err = await run().then((v) => v).catch((e: Error) => e);
    if (!(err instanceof Error)) {
      throw new Error(`${label}: لم يُرفض إطلاقاً — الناتج ${JSON.stringify(err)}`);
    }
    if (!err.message.includes(CLOSED_LABEL)) {
      throw new Error(`${label}: رُفض لسببٍ آخر — ${err.message}`);
    }
    expect(err.message).toContain(CLOSED_LABEL);
  };

  it('[SPEC 3.7] ① المسار اليدوي — createJournalEntry مباشرةً', async () => {
    const [cash, revenue] = await inTenant((tx) =>
      Promise.all([
        tx.account.findFirstOrThrow({ where: { code: '1000' }, select: { id: true } }),
        tx.account.findFirstOrThrow({ where: { code: '4100' }, select: { id: true } }),
      ]),
    );
    await expectPeriodRefusal('يدوي', () =>
      inTenant((tx) =>
        createJournalEntry(tx, {
          companyId,
          date: CLOSED_DATE,
          memo: 'فحص القفل — يدوي',
          lines: [
            { accountId: cash.id, debit: 100, credit: 0 },
            { accountId: revenue.id, debit: 0, credit: 100 },
          ],
        }),
      ),
    );
  });

  it('[SPEC 3.7] ② مسار الفاتورة — postInvoiceEntry', async () =>
    expectPeriodRefusal('فاتورة', () =>
      inTenant((tx) =>
        postInvoiceEntry(tx, companyId, {
          no: 'INV-PROBE-1',
          issueDate: CLOSED_DATE,
          customerName: 'عميل فحص',
          baseSubtotal: 100,
          baseTaxTotal: 15,
          baseTotal: 115,
        }),
      ),
    ));

  it('③ مسار المشتريات — postPurchaseEntry', async () =>
    expectPeriodRefusal('مشترى', () =>
      inTenant((tx) =>
        postPurchaseEntry(tx, companyId, {
          no: 'PUR-PROBE-1',
          date: CLOSED_DATE,
          supplierName: 'مورّد فحص',
          categoryCode: null,
          baseSubtotal: 100,
          baseTaxAmount: 15,
          baseTotal: 115,
        }),
      ),
    ));

  it('④ مسار سند القبض — postCustomerPaymentEntry', async () =>
    expectPeriodRefusal('سند قبض', () =>
      inTenant((tx) =>
        postCustomerPaymentEntry(tx, companyId, {
          paymentNo: 'RCV-PROBE-1',
          date: CLOSED_DATE,
          customerName: 'عميل فحص',
          baseCash: 100,
          baseReceivable: 100,
        }),
      ),
    ));

  it('[SPEC 3.7] ⑤ والبوابة نفسها ترفض التاريخ المنزاح', async () =>
    expectPeriodRefusal('البوابة مباشرةً', () => inTenant((tx) => assertPeriodOpen(tx, CLOSED_DATE))));

  it('⑥ والفترة المفتوحة تُقبل — الرفض ليس شاملاً', async () => {
    // نفس اليوم من الشهر التالي: يُثبت أن الأربعة تُرفض **لأن فترتها مقفلة**
    // لا لأن كل شيء يُرفض تحت هذه المنطقة.
    const open = new Date(CLOSED_DATE.getTime());
    open.setUTCMonth(open.getUTCMonth() + 2);
    const [cash, revenue] = await inTenant((tx) =>
      Promise.all([
        tx.account.findFirstOrThrow({ where: { code: '1000' }, select: { id: true } }),
        tx.account.findFirstOrThrow({ where: { code: '4100' }, select: { id: true } }),
      ]),
    );
    const entry = await inTenant((tx) =>
      createJournalEntry(tx, {
        companyId,
        date: open,
        memo: 'فحص القفل — فترة مفتوحة',
        lines: [
          { accountId: cash.id, debit: 50, credit: 0 },
          { accountId: revenue.id, debit: 0, credit: 50 },
        ],
      }),
    );
    expect(entry).toBeTruthy();
  });
});
