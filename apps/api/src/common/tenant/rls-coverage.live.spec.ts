import { Prisma, PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../../test/live-spec-timeout';
import { tenantOwnedModels } from '../../export/export-scope';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * تغطية RLS — **مشتقّة من نماذج المستأجر، ومقروءة من كتالوج القاعدة الحيّ**.
 *
 * ## العطل الذي يعالجه — مقيسٌ لا مفترَض
 *
 * كان في المستودع حارسان لـRLS، **وكلاهما يترك الحالة الأخطر تمرّ**:
 *
 * ① `activities/rls-context.spec.ts` يقرأ **نصّ الترحيلات** ويسقط على
 *    «`ENABLE` بلا `FORCE`». وهو يفحص **من ظهر في `ENABLE` أصلاً** — فجدولٌ
 *    جديد **بلا أيٍّ منهما لا يراه**. أُثبت بالقياس: حُذف سطرا RLS من ترحيل
 *    `purchase_lines` فمرّ الحارس **٦/٦**.
 * ② `activities/rls-probe.live.spec.ts` يقرأ الكتالوج الحيّ — لكن على
 *    **قائمة أربعة جداول مكتوبة بيد**، فهو تشخيصٌ لها لا تغطية للمنصّة.
 *
 * ⟵ فحمايةُ أي جدولٍ جديد كانت تعتمد على **أن كاتبه تذكّر**. وهي العلّة نفسها
 * التي عولجت في التصدير (#59 · #61): **يُشتقّ من المخطَّط، ولا يُكتب بيد**.
 *
 * ## ولماذا الكتالوج لا نصّ الترحيل
 *
 * نصّ الترحيل **وكيلٌ عن الحقيقة لا الحقيقة**: مسافةٌ زائدة تُعميه (وقعت في
 * هذه الموجة نفسها)، وترحيلٌ لاحق قد يُسقط `FORCE` بلا أن يمسّ النصّ الأول.
 * **والآمر هو `pg_class.relforcerowsecurity`** على قاعدةٍ حيّة.
 *
 * ⚠️ **وحدّ هذا الحارس معلَن**: يفحص **الجداول التي يملكها المستأجر** — أي ما
 * يحمل `companyId`. وجدولٌ مرجعيّ على مستوى المنصّة (بلا `companyId`) خارجه
 * بحقّ، لأن RLS عليه لا معنى له.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

/**
 * **استثناءات بيضاء بحجّة مكتوبة — لا تخطٍّ صامت.**
 *
 * الثلاثة مقيسة حيّاً (`relforcerowsecurity = false`)، ومُعلَنة في
 * `rls-context.spec.ts` تحت `KNOWN_WEAK`. وهي **دَينٌ مُعلَن لا قرار**:
 * إضافة `FORCE` إليها ستُعمي قراءاتٍ تعتمد اليوم على تجاوز المالك، فيلزم
 * إصلاح تلك القراءات معها — وهو بندٌ قائم لا يُخلط بهذه الموجة.
 */
const KNOWN_WEAK: Record<string, string> = {
  /**
   * ⚠️ **هذان مختلفان عن الثلاثة أدناه — وليسا قراراً.**
   *
   * الثلاثة الأخرى تحمل `ENABLE` بلا `FORCE`: سياسةٌ مكتوبة تُتجاوَز من المالك.
   * أمّا هذان فبلا **أيٍّ منهما وبصفر سياسة** — أي أن عزلهما **طبقةٌ واحدة**
   * (امتداد المستأجر في التطبيق)، بينما المنصّة تعد بطبقتين.
   *
   * ولم يرهما الحارس النصّي قطّ لأنه يفحص من ظهر في `ENABLE` أصلاً. وهذا
   * الحارس أوّل ما رآهما، **ولذلك يُسجَّلان دَيناً لا يُسكَت عنهما**.
   */
  company_users:
    'بلا RLS إطلاقاً (٠ سياسة · مقيس: ٨ صفوف عبر ٥ منشآت). ليس قراراً ولا يُعرف له مبرّر — بندٌ مفتوح بأولوية عالية، ولا يُصلَح داخل موجةٍ لا تخصّه.',
  permission_templates:
    'بلا RLS إطلاقاً (٠ سياسة · مقيس: ٢٥ صفاً). ويشارك القوالبَ العامةَ صفوفٌ بلا منشأة، فإضافة السياسة تحتاج صياغةً تسمح بالقالب العام وتمنع قالب الغير — وهو ما يجعله بنداً لا سطراً.',
  account_deletion_requests:
    'يُقرأ من لوحة مدير المنصّة عبر المنشآت — أي خارج سياق مستأجر بطبيعته. و`FORCE` يُعمي تلك القراءة، فيلزم نقلها إلى مسارٍ يقيم السياق أولاً.',
  support_access_grants:
    'نظيره: منح وصول الدعم تُدار من جانب المنصّة لا من داخل المنشأة، فقراءتها عابرة للمستأجرين بحكم وظيفتها.',
  support_access_logs:
    'سجلّ ما فعله الدعم — يُقرأ من الجانبين: المنشأة ترى ما مُسّ لديها، والمنصّة ترى الكل. والثاني يسقط بـ`FORCE` قبل إصلاح مساره.',
};

d('تغطية RLS — كل جدول يملكه المستأجر مُلزَم بـ`FORCE`', () => {
  const prisma = new PrismaClient();

  /** اسم الجدول لكل نموذج مستأجر — من `@@map` وقت التشغيل لا من قائمة. */
  const tenantTables = (): Map<string, string> => {
    const owned = new Set(tenantOwnedModels());
    const out = new Map<string, string>();
    for (const model of Prisma.dmmf.datamodel.models) {
      if (!owned.has(model.name)) continue;
      out.set(model.dbName ?? model.name, model.name);
    }
    return out;
  };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('⓪ حارسٌ على المجسّ: الاشتقاق أعطى نماذج فعلاً', () => {
    // خريطةٌ فارغة تجعل كل ما تحتها يمرّ بنجاحٍ تامّ وهو لم يفحص شيئاً —
    // وهو الفخّ الذي وقع مرّتين في هذا المستودع.
    const tables = tenantTables();
    expect(tables.size).toBeGreaterThan(20);
    expect(tables.has('purchase_lines')).toBe(true);
    expect(tables.has('invoice_lines')).toBe(true);
  });

  it('⭐ كل جدول مستأجر يحمل `ENABLE` و`FORCE` — من كتالوج القاعدة', async () => {
    const tables = tenantTables();
    const names = [...tables.keys()];

    const rows = await prisma.$queryRaw<{ relname: string; enabled: boolean; forced: boolean }[]>`
      SELECT c.relname,
             c.relrowsecurity      AS enabled,
             c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${names})`;

    // ⚠️ الاتجاه الأول: جدولٌ مشتقّ لا وجود له في القاعدة يعني ترحيلاً ناقصاً
    // — ولو سُكت عنه لمرّ الفحص على جدولٍ **غير موجود** فبدا سليماً.
    const missing = names.filter((t) => !rows.some((r) => r.relname === t)).sort();
    expect(missing).toEqual([]);

    const weak = rows
      .filter((r) => !(r.relname in KNOWN_WEAK))
      .filter((r) => !r.enabled || !r.forced)
      .map((r) => `${r.relname} (enabled=${r.enabled} forced=${r.forced})`)
      .sort();

    expect(weak).toEqual([]);
  });

  it('⭐ وكل استثناء يسمّي جدولاً مشتقّاً فعلاً — ولا يزال ضعيفاً', async () => {
    /**
     * الاتجاه المعاكس، ووجهان له:
     *   · استثناءٌ لجدولٍ ليس من نماذج المستأجر = إعفاءٌ من لا شيء.
     *   · واستثناءٌ لجدولٍ **صار قويّاً** = سطرٌ ميت يُقرأ بعد سنة على أنه
     *     قرار، ويُغري بإضافة أمثاله.
     */
    const tables = tenantTables();
    const notDerived = Object.keys(KNOWN_WEAK).filter((t) => !tables.has(t)).sort();
    expect(notDerived).toEqual([]);

    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${Object.keys(KNOWN_WEAK)})`;

    const alreadyFixed = rows.filter((r) => r.forced).map((r) => r.relname).sort();
    expect(alreadyFixed).toEqual([]);
  });

  it('⭐ ولكل استثناء حجّةٌ مكتوبة لا فراغ', () => {
    for (const [table, reason] of Object.entries(KNOWN_WEAK)) {
      expect({ table, hasReason: reason.trim().length > 40 }).toEqual({ table, hasReason: true });
    }
  });
});
