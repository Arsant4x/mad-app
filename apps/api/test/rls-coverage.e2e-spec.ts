// هذا الاختبار لا يُقلع AppModule (لا يحتاج HTTP) — فيلزمه تحميل .env بنفسه،
// إذ إن بقية اختبارات e2e تحصل على DATABASE_URL ضمناً عبر ConfigModule.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { TENANT_SCOPED_MODELS } from '../src/common/tenant/tenant-scope.extension';

/**
 * حارس تغطية RLS — يقيس **حالة قاعدة البيانات نفسها**، لا نصّ الهجرات.
 *
 * الطبقة الثانية من عزل المستأجرين هي RLS، وهي تسقط بصمت في حالتين:
 *   ① جدول مستأجَر بلا `ENABLE ROW LEVEL SECURITY` — لا سياسة أصلاً.
 *   ② جدول عليه ENABLE بلا `FORCE` — **وهذه هي الخبيثة**: السياسة موجودة
 *      وتبدو سليمة في الهجرة، لكن Postgres يعفي **مالك الجدول** منها،
 *      والتطبيق يتصل بـapp_user وهو المالك (ALTER SCHEMA public OWNER TO
 *      app_user). فالجدول «محميّ» في القراءة وغير محميّ في الواقع.
 *
 * الحالة ② هي ما وقع فعلاً في `account_deletion_requests` و
 * `support_access_grants` و`support_access_logs`: نُسخ سطر ENABLE ونُسي FORCE،
 * ولم يكشفه شيء لأن **لا اختبار كان يعدّ الجداول**. التعليق «كرّر هذا يدوياً
 * لكل جدول جديد» كان الحارس الوحيد، وقد نُسي ثلاث مرات.
 *
 * فالاختبار يشتقّ القائمة من `TENANT_SCOPED_MODELS` — نفس المجموعة التي
 * يستعملها امتداد المستأجر — فأي نموذج يُضاف إليها يُطالَب بحمايته فوراً.
 */
/**
 * استثناءان مقصودان — يُسمَّيان هنا صراحةً لا يُسكت عنهما، فأي جدول آخر بلا
 * حماية يُسقط الاختبار. وكلاهما **خارج `TENANT_SCOPED_MODELS`** أصلاً، أي أن
 * امتداد المستأجر لا يحقنهما بـcompanyId كذلك — فالاستثناء متسق بين الطبقتين
 * لا ثغرة في إحداهما.
 */
const DELIBERATE_EXCEPTIONS: Record<string, string> = {
  // `permission_templates` خرج من الاستثناءات في المرحلة ③ (`ق-٦٧٥`): صار تحت FORCE
  // بسياسةٍ فريدة تسمح بالعامّ (companyId = NULL) من كلّ سياق وتحصر الخاصَّ في صاحبه —
  // فلم يعد تفعيلُ RLS يُخفي القوالبَ العامّة ولا يكسر التسجيل.
  // يُقرأ **قبل** وجود سياق مستأجر: المصادقة تجد المستخدم أولاً ثم تشتقّ
  // شركته منه. سياسة تعتمد على app.company_id تمنع الدخول نفسه.
  //
  // ⚠️ **والحجّة صحيحة والاستثناء ناقص — تصحيح 2026-08-15.** هذا استثناءٌ من
  // طبقة القاعدة، و`CompanyUser` **ليس في `TENANT_SCOPED_MODELS`** كذلك — أي
  // أن **الطبقتين ساقطتان معاً**، ولا ضابط تعويضي البتّة. وأُثبت العبور فعلياً:
  // `app_user` بسياق المنشأة أ قرأ صفّ المنشأة ب (2026-08-15).
  //
  // ⬅️ فما هو مسجَّل هنا **ليس استثناءً بل ثغرةٌ موثَّقة** (CLAUDE.md §8.9).
  //
  // ⭐ **وآليةُ التصريح حُسمت 2026-09-12 (`ق-٦٦٦`) — لا بدورٍ ثانٍ**: الهويّةُ تحمل
  // منشأتَها (`login_identities.companyId`، تملؤها القاعدةُ بمشغِّل) فتُقرأ بلا سياق
  // ثم يُقرأ ملفُّها تحت `runInTenantContext` — **فالدخولُ لم يعد يقرأ هذا الجدولَ بلا
  // سياق**. ويُرفع هذا السطر في المرحلة ④ حين يُغلق مع `company_user_branches` معاً.
  company_users: 'ثغرة موثَّقة لا استثناء — الطبقتان ساقطتان؛ مسارُ الدخول حُسم (ق-٦٦٦) ويُغلق في ④',
  // 🔴 **مصدرُ السياق نفسُه** (`ق-٦٦٦`): يُقرأ **قبل** أن يُعرف أيُّ سياق — وهو الذي
  // يعطيه (`companyId` على الهويّة). لا يُعزل بالسياسة لأن كلَّ عزلٍ يبدأ منه؛
  // وعزلُه ألّا يُقرأ منه إلا اسمُ الدخول وهاشُه ومنشأتُه، ثم الملفُّ تحت سياقها.
  // مُعلَنٌ أيضاً في `TENANT_SCOPE_EXCEPTIONS` بالطبقة `none`.
  login_identities: 'مصدرُ السياق — يُقرأ قبل أن يُعرف السياق ويعطيه (ق-٦٦٦)',
};

/**
 * ثلاثة جداول **ثنائية الوصول عمداً**: عليها سياسة عزل تسري على التاجر، وتُقرأ
 * عبر مسار ثانٍ لمدير المنصة يتجاوزها قصداً.
 *
 * انظر `deletion-requests.service.ts`: الأسطر 37-62 تمرّ بـ
 * `tenantPrisma.runInTenantContext` (التاجر يرى طلبه وحده)، والأسطر 70+ تستعمل
 * `this.prisma` الخام (مدير المنصة يرى طلبات كل المنشآت — وهي وظيفته).
 *
 * ولذلك **لا يجوز إضافة `FORCE` هنا**: جُرِّبت فأسقطت 7 اختبارات — قائمة طلبات
 * الحذف تعود فارغة للمدير، ووضع الدعم ينهار بالكامل. الآلية التي تُشغِّل مسار
 * المدير اليوم هي بالضبط «مالك الجدول يتجاوز RLS ما لم يُضبط FORCE».
 *
 * ⚠️ **دَين معماري مسجَّل، لا ثغرة:** الاعتماد على إعفاء المالك آليةٌ **ضمنية**
 * — تعمل بالمصادفة لا بالتصريح، وأي `FORCE` يُضاف لاحقاً بحسن نية يكسر لوحة
 * المدير صامتاً. البديل الصريح (دور قاعدة بيانات ثانٍ للمدير، أو شرط
 * `app.is_platform_admin` داخل السياسة) قرارٌ معماري مستقل لصاحب المشروع.
 */
const PLATFORM_ADMIN_DUAL_ACCESS: Record<string, string> = {
  account_deletion_requests: 'مدير المنصة يراجع طلبات كل المنشآت (deletion-requests.service.ts:70+)',
  support_access_grants: 'وضع الدعم — المدير يطلب والمالك يوافق عبر المنشآت',
  support_access_logs: 'سجلّ الدعم — يُقرأ من الطرفين',
};

describe('RLS coverage over every tenant-scoped table', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });
  afterAll(async () => prisma.$disconnect());

  it('every tenant model has both ENABLE and FORCE row level security', async () => {
    // من اسم النموذج إلى اسم الجدول: المشروع يستعمل @@map بصيغة snake_case
    // الجمع. نقرأ التطابق من القاعدة بدل تخمينه، فنطابق على companyId.
    const tables = await prisma.$queryRaw<{ tablename: string; enabled: boolean; forced: boolean }[]>`
      SELECT c.relname AS tablename, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND EXISTS (
          SELECT 1 FROM pg_attribute a
          WHERE a.attrelid = c.oid AND a.attname = 'companyId' AND NOT a.attisdropped
        )
      ORDER BY c.relname
    `;

    // توكيد سلامة: قراءة فاشلة يجب أن تُسقط الاختبار لا أن تمرّ بقائمة فارغة.
    expect(tables.length).toBeGreaterThanOrEqual(TENANT_SCOPED_MODELS.size);

    const unprotected = tables
      .filter((t) => !t.enabled || !t.forced)
      .filter((t) => !(t.tablename in DELIBERATE_EXCEPTIONS))
      // ثنائية الوصول تُعفى من FORCE وحده — ويبقى ENABLE مطلوباً منها،
      // فالتاجر يجب أن يظل محكوماً بالسياسة وإن تجاوزها مسار المدير.
      .filter((t) => !(t.tablename in PLATFORM_ADMIN_DUAL_ACCESS) || !t.enabled)
      .map((t) => `${t.tablename} (enabled=${t.enabled}, forced=${t.forced})`);

    expect({ unprotected, checked: tables.length }).toEqual({ unprotected: [], checked: tables.length });
  }, 60000);

  it('every tenant-scoped table carries an isolation policy', async () => {
    const policies = await prisma.$queryRaw<{ tablename: string; policies: bigint }[]>`
      SELECT c.relname AS tablename, COUNT(p.polname) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity
      GROUP BY c.relname
      ORDER BY c.relname
    `;

    expect(policies.length).toBeGreaterThan(0);
    const policyless = policies.filter((p) => Number(p.policies) === 0).map((p) => p.tablename);
    expect(policyless).toEqual([]);
  }, 60000);

  /** ثنائية الوصول ليست إعفاءً من العزل: التاجر يجب أن يبقى محكوماً بالسياسة
   *  (ENABLE + سياسة قائمة)، والمتجاوَز هو مسار المدير وحده عبر إعفاء المالك. */
  it('the platform-admin dual-access tables still isolate the merchant side', async () => {
    const names = Object.keys(PLATFORM_ADMIN_DUAL_ACCESS);
    const rows = await prisma.$queryRaw<{ tablename: string; enabled: boolean; policies: bigint }[]>`
      SELECT c.relname AS tablename, c.relrowsecurity AS enabled, COUNT(p.polname) AS policies
      FROM pg_class c
      LEFT JOIN pg_policy p ON p.polrelid = c.oid
      WHERE c.relname = ANY(${names}::text[])
      GROUP BY c.relname, c.relrowsecurity
    `;
    expect(rows.length).toBe(names.length);
    const weak = rows.filter((r) => !r.enabled || Number(r.policies) === 0).map((r) => r.tablename);
    expect({ withoutTenantPolicy: weak }).toEqual({ withoutTenantPolicy: [] });
  }, 60000);

  /** الاستثناءان يبقيان استثناءين: لو حُمِي أحدهما لاحقاً، يُشطب من القائمة
   *  لا يُترك فيها — قائمة استثناءات لا تُراجَع تصير غطاءً للثغرة التالية. */
  it('the deliberate exceptions are still genuinely unprotected (list stays honest)', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string; enabled: boolean }[]>`
      SELECT relname AS tablename, relrowsecurity AS enabled FROM pg_class
      WHERE relname = ANY(${Object.keys(DELIBERATE_EXCEPTIONS)}::text[])
    `;
    const nowProtected = rows.filter((r) => r.enabled).map((r) => r.tablename);
    expect({ staleExceptions: nowProtected }).toEqual({ staleExceptions: [] });
  }, 60000);
});
