import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): مقروءُه **ملفّاتُ هجرةٍ بـ`SQL`**
// يستخرج منها أسماءَ جداولٍ من `ALTER TABLE "…"` — **لا شيفرةَ `TypeScript`**،
// **والاقتباسُ جزءُ ما يبحث عنه**.
readsDeclaredStrings();

const SRC = join(__dirname, '..');
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');

/**
 * حارس: **جدولٌ محميّ بـRLS لا يُقرأ خارج سياق المستأجر**.
 *
 * ## الحادثة التي ولّدته (2026-08-13)
 *
 * قرأتُ `business_activities` بـ`this.prisma` — خارج السياق — في **ثلاثة
 * مواضع**: `TenantGuard` و`PermissionsService` و`PrimaryActivityService`.
 * والجدول عليه `RLS ENABLE + FORCE`، فعادت القراءة **فارغةً بنجاح**: لا
 * خطأ ولا تحذير ولا صفٌّ واحد.
 *
 * والأثر أن `sectors` صارت خاوية، و`screensFor([])` تُرجع **الكل** —
 * **فتعطّل الترشيح كلّه بصمت**. أي أن الميزة كانت مبنيّةً ومحروسةً
 * بـ220 اختباراً، **ولا تعمل**.
 *
 * ⚠️ ولم يمسكها شيءٌ من الـ220: كلها نصّية أو نقيّة، ولا واحدة تلمس
 * قاعدة. **الاختبار الحيّ وحده كشفها** — وهو الدليل العملي على أن الحارس
 * النصّي يقول «مكتوبةٌ كذلك» لا «تعمل كذلك».
 *
 * ## ما يفعله
 *
 * يقرأ **الترحيلات** ليعرف أي الجداول محميّة (لا قائمةً مكتوبة يدوياً)،
 * ثم يفحص كل موضعٍ يقرأ أياً منها عبر `this.prisma` مباشرةً.
 */

/**
 * جداول RLS — **مقروءةً من الترحيلات**، و`ENABLE` و`FORCE` **كلٌّ على حدة**.
 *
 * ## ⚠️ ولماذا الشرطان لا واحد
 *
 * صياغةٌ أولى قرأت `ENABLE` وحدها. و`ENABLE` بلا `FORCE` **لا يمنع مالك
 * الجدول** — وفي هذا المشروع `app_user` هو مالك المخطط
 * (`ALTER SCHEMA public OWNER TO app_user`)، أي أن السياسة **لا تسري
 * عليه أصلاً**.
 *
 * فجدولٌ بـ`ENABLE` وحدها كان يُعدّ «محميّاً» في الحارس، وهو ليس كذلك —
 * **فيُقرأ نصف الشرط ويُبنى عليه حكم**. وهو الوجه الثالث من النمط الرباعي
 * للمرة الرابعة اليوم.
 *
 * وكشفه القياس الحيّ لا القراءة: `pg_class.relforcerowsecurity` أعطى
 * `false` لثلاثة جداول تحمل `ENABLE` — والحارس كان يمرّ عليها.
 */
function rlsTables(): { enabled: Set<string>; forced: Set<string> } {
  const enabled = new Set<string>();
  const forced = new Set<string>();
  for (const dir of readdirSync(MIGRATIONS)) {
    const file = join(MIGRATIONS, dir, 'migration.sql');
    let sql: string;
    try {
      sql = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)) enabled.add(m[1]);
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)" FORCE ROW LEVEL SECURITY/g)) forced.add(m[1]);
  }
  return { enabled, forced };
}

/**
 * `business_activities` ⇒ `businessActivity` — اسم النموذج في Prisma.
 *
 * ⚠️ **و`ies` ⇒ `y` قبل حذف الجمع.** صياغةٌ أولى حذفت `s` وحدها فأعطت
 * `businessActivitie` — اسمٌ لا يطابق شيئاً أبداً، **فكان الحارس سيفوّت
 * المخالفة التي بُني لها بعينها**. أمسكه فحص الاشتقاق أسفله وحده.
 */
const toModel = (table: string) =>
  table
    .replace(/ies$/, 'y')
    .replace(/s$/, '')
    .replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

/**
 * ⚠️ **السياق يُقام بطريقين لا بواحد** — وإغفال الثاني يُنتج إنذاراً كاذباً.
 *
 * `runInTenantContext` هو الطريق المعتاد. والثاني معاملةٌ يدوية تضع
 * `set_config('app.company_id', …)` كأول عبارة فيها:
 *
 *     await this.prisma.$transaction([
 *       this.prisma.$executeRaw`SELECT set_config('app.company_id', …, true)`,
 *       this.prisma.auditLog.create({ … }),
 *     ]);
 *
 * وهذا **سليم**: `set_config(…, true)` محلّيٌّ بالمعاملة، فالإنشاء بعده
 * داخل السياق. واستعمله `audit.service.ts` عمداً — وتعليقه يشرح أنه فرّ
 * من استنزاف مجمع الاتصالات الذي **أضاع قيوداً فعلاً** من قبل.
 *
 * وصياغةٌ أولى لهذا الحارس طابقت الرمز وحده، فأدانت `audit_logs` ظلماً —
 * **وأبلغتُ المالك حكماً خاطئاً بناءً عليها**. والدرس: الحارس يفحص ما
 * تفعله الشيفرة، لا ما تُسمّيه.
 *
 * @param before حجم النافذة قبل الاستعمال. محدودٌ عمداً: أوسعُ منها يبتلع
 *   دالةً مجاورة تُقيم السياق فيمرّ ما لا يجب.
 */
function scanViolations(files: string[], tables: Set<string>, before = 900): string[] {
  const models = [...tables].map(toModel);
  const out: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n');
    for (const model of models) {
      const re = new RegExp(`this\\.prisma\\.${model}\\b`, 'g');
      for (const m of src.matchAll(re)) {
        const window = src.slice(Math.max(0, m.index! - before), m.index!);
        const inContext = window.includes('runInTenantContext') || window.includes("set_config('app.company_id'");
        if (!inContext) out.push(`${file.slice(SRC.length + 1).split('\\').join('/')} ⟵ this.prisma.${model}`);
      }
    }
  }
  return [...new Set(out)];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.spec\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('جدولٌ محميّ بـRLS لا يُقرأ خارج سياق المستأجر', () => {
  const { enabled, forced } = rlsTables();
  // ⚠️ **المُلزِمة وحدها** تُعمي القراءة الخارجية — وهي مناط هذا الحارس.
  const tables = forced;
  const files = walk(SRC);

  it('يقرأ الترحيلات والملفات فعلاً — حارسٌ على قائمةٍ فارغة ليس حارساً', () => {
    // الفخّ الذي أوقعنا مرّتين: مسارٌ خاطئ يعطي صفر مدخلات فيمرّ الفحص
    // بنجاحٍ تامّ وهو لم يفحص شيئاً.
    expect(enabled.size).toBeGreaterThan(5);
    expect(forced.size).toBeGreaterThan(5);
    expect(forced.has('business_activities')).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  /**
   * **فارغةٌ عن قصد — والأربعة التي بدت دَيناً ليست كذلك.**
   *
   * ## كيف تلاشى الدَّين المزعوم
   *
   * وُجدت **أربعة** مواضع تُطابق النمط، وأبلغتُ المالك أنها دَين. ثم
   * أسقطها فحصان متتاليان **كلاهما تصحيحٌ لهذا الحارس لا للشيفرة**:
   *
   * ① **اشتراط `FORCE`** — ثلاثةٌ من الأربعة على جداول بـ`ENABLE` وحدها،
   *    فقراءتها **تعمل**. وعطبُها من نوعٍ آخر: **عزلٌ مثقوب** (أسفل الملف).
   * ② **تمييز طريقَي إقامة السياق** — و`audit_logs` يُقيمه يدوياً داخل
   *    `$transaction([set_config, …])`، فهو **سليم**.
   *
   * ⭐ **والدرس أقسى من الدَّين**: بلّغتُ حكماً بناءً على مطابقة رمزٍ
   * وشكل سياسة، ولو نُفّذ لكان «إصلاحاً» لما ليس معطوباً. والحارس أداةٌ
   * تُفحص — لا حكمٌ يُبلَّغ.
   *
   * ⚠️ **وبند المالك ٢ يغيّر هذا**: إضافة `FORCE` إلى الثلاثة ستجعل
   * قراءاتها **عمياء** — فيصير الدَّين حقيقياً حينها. وهو المتوقَّع:
   * **سقوطُها بعد الإضافة هو المعلومة**، لا مفاجأة.
   *
   * والقائمة **سقّاطة**: تمنع الزيادة، ولا تُسكت ما فيها.
   */
  const KNOWN_DEBT: string[] = [];

  /**
   * **قراءةٌ تُقرّها السياسةُ بنصّها — لا دَينٌ ولا سياق** (المرحلة ③ · `ق-٦٧٥`).
   *
   * `permission_templates` صار تحت `FORCE` بصياغةٍ فريدة: `USING ("companyId" IS NULL OR …)`
   * — **فالقالبُ العامُّ يُرى بلا أيّ سياقٍ بنصّ السياسة**، لا بتسامح. والتسجيلُ الذاتيّ
   * يقرأ قالباً عامّاً **قبل أن توجد منشأةٌ تُعطى سياقاً** — فلا سياقَ يُصطنع له، ولا
   * مسنَدَ إدارةٍ (المسجِّلُ ليس المنصّة). ⚠️ **وحدُّه معلَن**: القراءةُ تُرشِّح `companyId: null`
   * صراحةً، **ويحرسها حيّاً** `permission-templates-rls.live.spec` ② (العامُّ يُرى بلا سياق).
   * موضعٌ واحد بحجّته — وقراءةٌ خامّةٌ أخرى لهذا النموذج **تُدان**.
   */
  const POLICY_ADMITTED: string[] = ['auth/auth.service.ts ⟵ this.prisma.permissionTemplate'];

  it('⭐ لا `this.prisma.<نموذج محميّ>` جديد — والدَّين القائم لا يزيد', () => {
    // `runInTenantContext` يضع `app.company_id` قبل الاستعلام؛ وبدونه
    // تعود السياسة بمجموعةٍ فارغة **بنجاح** — و«لا صفوف» و«لم أرَ شيئاً»
    // يبدوان سواء.
    const found = scanViolations(files, tables);
    // الجديد وحده يُسقط — والدَّين المُعلَن يبقى مرئياً في هذا الملف.
    expect(found.filter((f) => !KNOWN_DEBT.includes(f) && !POLICY_ADMITTED.includes(f))).toEqual([]);
    // ⚠️ والمُعلَنُ مُسنَّن: إعلانٌ لموضعٍ زال يبقى كذباً هنا حتى يُحذف.
    expect(POLICY_ADMITTED.filter((f) => !found.includes(f))).toEqual([]);
  });

  it('⭐ ويفرّق بين طريقَي إقامة السياق — لا يُدين `audit_logs` ظلماً', () => {
    // الكتابة فيه داخل `$transaction([set_config, create])` — سليمة.
    // وصياغةٌ أولى طابقت الرمز وحده فأدانتها، **وأبلغتُ المالك حكماً
    // خاطئاً بناءً عليها**.
    const audit = readFileSync(join(SRC, 'audit', 'audit.service.ts'), 'utf8');
    expect(audit).toContain('this.prisma.auditLog.create');
    expect(scanViolations([join(SRC, 'audit', 'audit.service.ts')], tables)).toEqual([]);
  });


  it('⭐ والاشتقاق يعمل: `business_activities` ⇒ `businessActivity`', () => {
    // حارسٌ للحارس: اشتقاقٌ خاطئ للاسم يجعل النمط لا يطابق شيئاً أبداً،
    // فيمرّ الفحص على كل مخالفة.
    expect(toModel('business_activities')).toBe('businessActivity');
    expect(toModel('delegation_logs')).toBe('delegationLog');
    expect(toModel('invoices')).toBe('invoice');
  });
});

/**
 * `ENABLE` بلا `FORCE` — **عزلٌ مثقوب، لا عزلٌ ضعيف**.
 *
 * السياسة مكتوبة ولا تسري على مالك الجدول، و`app_user` هو المالك. فالحماية
 * تقع على تصفية الشيفرة وحدها — وهي التي تنساها الاستعلامات المباشرة.
 *
 * ⚠️ وخطورتُه **معاكسة** لخطورة القراءة خارج السياق: تلك تُخفي بياناتٍ عن
 * صاحبها، وهذا **قد يكشفها لغيره**.
 *
 * والقائمة سقّاطة: تمنع الزيادة، وتسقط إن أُصلح أحدها فتُحذف عن علم.
 */
describe('`ENABLE` بلا `FORCE` — عزلٌ مثقوب', () => {
  const { enabled, forced } = rlsTables();

  /** مُعلَنٌ لا مُستثنى — قياسٌ حيّ أكّده (`relforcerowsecurity = false`). */
  const KNOWN_WEAK = ['account_deletion_requests', 'support_access_grants', 'support_access_logs'];

  it('⭐ لا جدولٌ جديد بـ`ENABLE` بلا `FORCE`', () => {
    const weak = [...enabled].filter((t) => !forced.has(t)).sort();
    expect(weak.filter((t) => !KNOWN_WEAK.includes(t))).toEqual([]);
  });

  it('⭐ والقائمة تصف الحاضر — تسقط إن أُصلح أحدها', () => {
    const weak = new Set([...enabled].filter((t) => !forced.has(t)));
    expect(KNOWN_WEAK.filter((t) => !weak.has(t))).toEqual([]);
  });
});
