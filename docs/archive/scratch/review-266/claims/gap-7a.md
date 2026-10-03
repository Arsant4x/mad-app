# الفجوة ٧أ — محتوى سياسات العزل لا يُفحص

**قِيس على:** `D:\worktrees\outbox-266` (نسخةٌ نظيفة من `main` + تغييرُ الطابور الصادر، ولا يمسّ الموضوع). **قراءةٌ وبحثٌ فقط**: لم يُشغَّل اختبارٌ ولا `prisma` ولا `docker` ولا بناء، ولم يُكتب إلا هذا الملف.
**التاريخ:** 2026-09-26.

---

## (1) الدعوى بنصّها

> «محتوى سياسات العزل لا يُفحص — حارسٌ يقرأ كلَّ سياسةٍ ويرفض ما لا يقيّد بالمنشأة، و `USING (true)` تسقط».

والمطلوب معها: حصرُ الحرّاس القائمة وكيف تقرأ `pg_class`/`pg_policy`، وحصرُ أشكال عبارات السياسات في الهجرات كلّها، وتصميمُ حارسٍ حيّ يقرأ `pg_policies` (`qual` و`with_check`) لكل جدولٍ تحت العزل، يُسقط كلَّ سياسةٍ لا تقيّد بالمنشأة ويسمّي الاستثناءاتِ المعتمدة بأسمائها، وإثباتٌ بالعكس: سياسةُ `USING (true)` مؤقّتة في معاملةٍ تُرجَع يجب أن تُمسك.

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### ٢-أ) الحرّاسُ القائمة، وما يقرؤه كلٌّ منها فعلاً

| الحارس | ماذا يقرأ | ماذا يوكّد | هل يرى **محتوى** السياسة؟ |
|---|---|---|---|
| `apps/api/src/common/tenant/rls-coverage.live.spec.ts:104-110` | `pg_class.relrowsecurity` و`relforcerowsecurity` لجداول النماذج التي تحمل `companyId` (مشتقّةً من `tenantOwnedModels()` — `:77-85`، و`export/export-scope.ts:80-84`) | `ENABLE` و`FORCE` على كل جدول (`:117-123`) إلا `KNOWN_WEAK` (`:46-71`) | **لا** — لا يلمس `pg_policy` أصلاً |
| `apps/api/test/rls-coverage.e2e-spec.ts:111-127` (عنوانه «every tenant-scoped table carries an isolation policy») | `COUNT(p.polname)` من `pg_policy` لكل جدولٍ `relrowsecurity` (`:112-122`) | ألّا يكون العددُ صفراً (`:125-126`) | **لا — يعدّ ولا يقرأ.** والعنوانُ يَعِد بـ«سياسة عزل» والتوكيدُ «سياسةٌ ما» (`CLAUDE.md §8.14`: العنوانُ ليس التوكيد) |
| `apps/api/test/rls-coverage.e2e-spec.ts:131-143` | العددُ نفسُه للجداول الثلاثة ثنائية الوصول | `enabled` وعددٌ > 0 | **لا** |
| `apps/api/src/common/tenant/tenant-scope-coverage.spec.ts:62-68` | **نصُّ الهجرات** بالتعبير `CREATE POLICY [^\n]* ON "<table>"` (`:66`) | وجودُ سطرِ سياسة لكل جدول (`:71-79`) | **لا** — يطابق رأسَ العبارة وحدَه؛ وحدُّه معلَنٌ في `:39-42` |
| `apps/api/src/activities/rls-context.spec.ts:54-69` | نصُّ الهجرات: `ENABLE`/`FORCE` فقط (`:65-66`) | لا قراءةَ خارج السياق لجدولٍ `FORCE` (`:188-197`)، ولا `ENABLE` بلا `FORCE` جديد (`:235-238`) | **لا** |
| `apps/api/src/common/migration-rls-read.spec.ts:84-107` | نصُّ الهجرات | `DML` على جدولٍ محميّ يرفع `FORCE` ويعيده | **لا** |
| `apps/api/src/activities/rls-probe.live.spec.ts:114-144` | `pg_get_expr(p.polqual, p.polrelid)` — **الوحيدُ في المستودع الذي يقرأ نصَّ السياسة** | لا شيء عن المحتوى: يطبع حكماً، والتوكيدُ الوحيد `rows.length >= TABLES.length` (`:143`)؛ وعلى **خمسة جداول مكتوبة بيد** (`:36-44`) | يقرأ ويطبع **ولا يحكم**. وحكمُه المطبوع مبنيٌّ على `includes('app.company_id')` (`:129`) — **تطابقُ جزء**، فـ`"companyId" = current_setting('app.company_id', true) OR true` تُعدّ عنده «نفسَ الشكل» |
| `apps/api/src/activities/rls-probe.live.spec.ts:146-158` | عدُّ `customers` بلا سياق | `= 0` (`:157`) | سلوكيٌّ على **جدولٍ واحد**، ومشروطٌ بوجود صفوفٍ فيه |
| `apps/api/src/customers/marketing-consent.live.spec.ts:89-95` | `polname` من `pg_policy` لجدولٍ واحد | الاسمُ موجود (`:94`) | **لا** — الاسمُ لا المحتوى |
| `apps/api/src/pos/offline-incidents.spec.ts:79` | نصُّ هجرةٍ واحدة | العبارةُ القانونية حرفاً لجدول `pos_offline_incidents` | **نعم — لجدولٍ واحد، ونصّاً لا من القاعدة**. وهو دليلُ أن الحاجةَ عُرفت مرّةً ولم تُعمَّم |
| `tasks/tasks.guards.spec.ts:147` · `common/subprocessor-consent.spec.ts:125` · `delegations/delegation-log.spec.ts:102` · `tasks/task-model.spec.ts:187` | نصُّ هجرة | `toContain('tenant_isolation_…')` | **لا** — الاسمُ وحدَه |
| `templates/permission-templates-rls.live.spec.ts:83-145` · `company-users/company-users-rls.live.spec.ts:99-162` | سلوكٌ حيّ في معاملةٍ تُرجَع (`rolledBack` — `:31-45` و`:35-49`) | لا عبورَ بين «أ» و«ب» | سلوكيٌّ على **ثلاثة جداول** (`permission_templates` · `company_users` · `company_user_branches`) — ويُمسك `USING (true)` عليها بالسلوك |
| اختباراتُ `test/*-tenant-isolation.e2e-spec.ts` (١٦ ملفاً) | طلباتُ `HTTP` | لا عبور | **لا تمسّ الطبقة الثانية منفردةً**: البحثُ عن `set_config\|\$queryRaw\|\$executeRaw` فيها = **صفر**، والمسبارُ الضابطُ `request\(\|\.get\(\|\.post\(` في الملفّات نفسِها = **308** — فهي تمرّ عبر الطبقتين معاً، وتبقى خضراء ما دامت إحداهما قائمة (استنتاجٌ من القراءة، لم يُقَس) |

**بحثُ النفي ومسبارُه:**
- `pg_policies|polqual|polwithcheck|pg_get_expr|with_check` في المستودع كلّه (خارج `node_modules`) ⟵ في الشيفرة موضعٌ واحد: `rls-probe.live.spec.ts:108,120` (والباقي وثيقتان). **المسبارُ يرى** لأنه أصاب `pg_get_expr` المعروفَ مسبقاً.
- `pg_policy|polname|DELIBERATE_EXCEPTIONS` في `apps/api` ⟵ `rls-coverage.e2e-spec.ts:113,116,134,136` و`rls-probe.live.spec.ts:122` و`marketing-consent.live.spec.ts:93-94` — كلُّها عدٌّ أو اسم.
- `USING \(true\)` في المستودع ⟵ **صفر**؛ والضابطُ على الشكل نفسِه `CREATE POLICY` ⟵ **102** موضعاً في 70 ملفَّ هجرة.

### ٢-ب) أشكالُ عبارات السياسات في الهجرات — مقروءةً كلّها

`CREATE POLICY` = **102** موضعاً، منها **واحدٌ تعليق** (`20260719160445_init/migration.sql:165` — نمطُ «كرّر هذا») ⟵ **101 سياسةٍ حقيقية على 100 جدول** (`api_keys` وحدَه عليه اثنتان). و`ENABLE ROW LEVEL SECURITY` في أوّل السطر = **100** جدول، يطابق جداولَ السياسات واحداً بواحد.

**لا `AS RESTRICTIVE` ولا `TO <role>`**: البحثُ متعدّدُ الأسطر `CREATE POLICY[^;]*?\s(TO|AS|FOR)\s` أصاب موضعاً واحداً فقط هو `FOR SELECT` في `20260923000000_api_keys/migration.sql:49-50` — **وهو الضابط** (معروفٌ مسبقاً)، فالصفرُ في `TO`/`AS` ليس عمى. ولا `DROP POLICY` إلا ثلاثةٌ تُسقط ثم تُعيد (`20260913130000_company_users_rls:18,28` · `20260913120000_permission_templates_rls:23`)، ولا `ALTER POLICY` أصلاً.

| # | الشكل | `USING` | `WITH CHECK` | `cmd` | عددُه | موضعُ الأصل |
|---|---|---|---|---|---|---|
| **أ** | **القانونيّ** | `"companyId" = current_setting('app.company_id', true)` | مثلُه | `ALL` | **97** سياسةً على 97 جدولاً (منها `tenant_isolation_api_keys`) | `init/migration.sql:158-160` والنمطُ المعلَنُ للتكرار `:162-167` |
| **ب** | `company_users` | القانونيّ **`OR current_setting('app.platform_admin', true) = 'true'`** | القانونيّ وحدَه | `ALL` | 1 | `20260913130000_company_users_rls/migration.sql:19-24` |
| **ج** | `permission_templates` | **`"companyId" IS NULL`** `OR` القانونيّ `OR` مسنَدُ الإدارة | القانونيّ `OR ("companyId" IS NULL AND platform_admin = 'true')` | `ALL` | 1 | `20260913120000_permission_templates_rls/migration.sql:24-33` |
| **د** | `company_user_branches` (بلا `companyId`) | `EXISTS (SELECT 1 FROM "company_users" cu WHERE cu."id" = "company_user_branches"."companyUserId" AND cu."companyId" = current_setting('app.company_id', true))` | مثلُه | `ALL` | 1 | `20260913130000_company_users_rls/migration.sql:29-39` |
| **هـ** | `api_key_authentication` على `api_keys` | **`current_setting('app.api_key_auth', true) = 'true'`** — **لا يقيّد بالمنشأة إطلاقاً** | — | `SELECT` | 1 | `20260923000000_api_keys/migration.sql:49-51` |

المجموع: 97 + 1 + 1 + 1 + 1 = **101** ✓.

**ومن يضبط المسنَدَين** (`app.platform_admin` · `app.api_key_auth`) في الشيفرة غير الاختبارية: `common/tenant/tenant-prisma.service.ts:78` (`runAsPlatformAdmin`) و`:99` (`runAsApiKeyLookup`) و`platform/platform-bootstrap.ts:30` — والباقي ملفّاتُ اختبار حيّة. وسياسةُ **هـ** مسوَّغةٌ في موضعها (`api_keys/migration.sql:40-48`: `FOR SELECT` · مسارٌ واحد · بحثٌ بالبادئة الفريدة)، و**ب/ج** في `tenant-scope-exceptions.ts:77-80` و`rls-coverage.e2e-spec.ts:34-71`.

⚠️ **وملاحظةٌ تهمّ التصميم**: السياسات في Postgres **متساهلةٌ افتراضاً وتُجمع بـ`OR`**. فسياسةٌ ثانية `USING (true)` بجوار القانونيّة **تُلغيها** على الجدول كلّه — وهذا بالضبط ما لا يراه أيُّ حارسٍ أعلاه: `relforcerowsecurity` لا يتغيّر، والعددُ يصير 2 بدل 1 فيمرّ «> 0»، ورأسُ العبارة `CREATE POLICY … ON "t"` يُطابَق.

---

## (3) حكمٌ مبدئيّ بالقراءة: **قائمة** — بوصفها فجوةَ حراسة

**لماذا قائمة:** لا حارسَ في المستودع يحكم على **محتوى** سياسةٍ في القاعدة لأكثر من ثلاثة جداول بالسلوك (ب/ج/د) وجدولٍ رابعٍ مشروطٍ بالبيانات (`customers` — `rls-probe.live.spec.ts:157`)، وجدولٍ خامسٍ نصّاً في هجرته (`offline-incidents.spec.ts:79`). **فعلى نحو 95 جدولاً** يمرّ كلُّ حارسٍ قائم على هجرةٍ جديدة تكتب:

```sql
CREATE POLICY admin_read ON "account_deletion_requests" FOR SELECT USING (true);
```

(وهي صياغةٌ محتملةٌ لا مصطنعة: «إصلاحُ» دَين `KNOWN_WEAK` بإضافة `FORCE` ثم فتحِ قراءة المدير — `rls-coverage.live.spec.ts:58-63` يصف بالضبط أن قراءة المدير تعمى تحت `FORCE`.) وبعدها يُسقط `rls-coverage.live.spec.ts:143-144` الجدولَ من `KNOWN_WEAK` لأنه «صار قويّاً» — **فيُحذف الدَّينُ من القائمة ويبقى الثقبُ أوسع**.

**وما ليس قائماً — أو غيرُ محسومٍ بالقراءة وحدها:**
- **المصدرُ لا يحمل اليوم سياسةً مفتوحة**: الـ101 كلُّها قُرئت، وكلُّها تقيّد بالمنشأة إلا الاستثناءَ المعلَن **هـ** (ومعه التوسيعاتُ المسوَّغة في **ب** و**ج**). فالدعوى **فجوةُ حارس** لا **تسريبٌ واقع** — بحسب المصدر.
- **القواعدُ الحيّة لم تُقرأ** (التطوير · السير · المنشور): سياسةٌ أُنشئت يدوياً خارج الهجرات لا يراها هذا التقرير. وهذا بعينه ما يحسمه الاستعلامُ ٦-② أدناه.

---

## (4) كيف تُقاس حيّاً

### ٤-أ) القياسُ الذي يحسم الدعوى (يسقط على الشيفرة الحالية إن كانت قائمة)

**الموضع:** اختبارٌ مؤقّتٌ لا يُلتزم، أو ملفٌّ حيّ `apps/api/src/common/tenant/rls-gap-7a.live.spec.ts` يُشغَّل **وحدَه** (`--runInBand`) على **قاعدةٍ مؤقّتة نظيفة** — لأنه يُنشئ سياسةً على جدولٍ حقيقيّ (`customers`) داخل معاملةٍ تُرجَع، و`CREATE POLICY` يأخذ قفلاً على الجدول حتى الإرجاع (نوعُه لم أتحقّق منه من مصدر Postgres — انظر ٧).

**الخطوات — في معاملةٍ واحدة تُرجَع** (نمطُ `rolledBack` بعينه — `permission-templates-rls.live.spec.ts:31-45`)، ودورُ الاتصال `app_user`:
1. `set_config('app.company_id', A, true)` ثم قراءتُه (`current_setting`) **لإثبات الآلية** (`permission-templates-rls.live.spec.ts:50-54`).
2. إنشاءُ عميلٍ لـ«أ».
3. `CREATE POLICY __gap7a_open ON "customers" USING (true) WITH CHECK (true);` — ثم **إثباتُ وقوع الكسر** (`§8.8`): `SELECT count(*) FROM pg_policies WHERE policyname = '__gap7a_open'` = 1.
4. **تشغيلُ استعلامات الحرّاس القائمة بنصّها داخل المعاملة نفسِها** (فهي وحدَها ترى السياسةَ غيرَ الملتزمة):
   - استعلامُ `rls-coverage.live.spec.ts:104-110` ⟵ `customers` يبقى `enabled=true forced=true`.
   - استعلامُ `rls-coverage.e2e-spec.ts:112-122` ⟵ `policies = 2` لـ`customers` (يمرّ «> 0»).
5. `set_config('app.company_id', B, true)` ثم `SELECT count(*) FROM customers WHERE id = <عميل أ>`.

**التوكيدُ الذي يسقط اليوم إن كانت الدعوى قائمة:**
```ts
expect({ caughtByExistingGuards, crossTenantRead }).toEqual({ caughtByExistingGuards: true, crossTenantRead: 0 });
```
حيث `caughtByExistingGuards` = أيٌّ من الاستعلامين في (4) يُعلن الجدولَ ضعيفاً. **المتوقَّعُ بالقراءة**: `{ caughtByExistingGuards: false, crossTenantRead: 1 }` ⟵ **أحمر = الدعوى قائمة**: الحرّاسُ يشهدون بالسلامة و«ب» تقرأ عميلَ «أ».

**والضابطُ في المعاملة نفسِها** (حالتان معلومتان — «مسبارٌ مُصادَق»): قبل الخطوة 3 يجب أن يكون `crossTenantRead = 0` (السياسةُ القانونيّة تعمل)؛ وبعد `DROP POLICY __gap7a_open` داخل المعاملة يعود `0`. فالتفاوتُ **سببه السياسةُ المحقونة وحدها**.

⚠️ **وملاحظةٌ على حارس `customers`**: لو كُتبت السياسةُ المحقونة على `customers` وبقيت ملتزمة، لأمسكها `rls-probe.live.spec.ts:157` **إن كانت في `customers` صفوفٌ خارج السياق**. فلإظهار الفجوة بنقاء يُعاد القياس على جدولٍ آخر بلا حارسٍ سلوكيّ (مثلاً `warranties`) — والحكمُ واحد.

### ٤-ب) ما يُقاس بعد الإصلاح (انظر ٥): الحارسُ الجديد أخضرُ على القاعدة كما هي، وأحمرُ في كلِّ حالةٍ محقونة.

---

## (5) تصميمُ الإصلاح — حارسٌ حيّ على محتوى السياسات

**بوّابةُ الفاعل (`§3.5`):** بنيةُ اختبار لا شاشة — لا فاعلَ منتَج. **`§3.8`:** لا يمسّ افتراضاً سعودياً.

### ٥-أ) الملفّ: `apps/api/src/common/tenant/rls-policy-content.live.spec.ts`

الاسمُ بـ`.live.spec.ts` كي يوصَل به شرطُ «القاعدة على آخر هجرة» آلياً (`test/live-db-precheck.ts:24-29` · `package.json:84-86`)، والتخطّي بالنمط القائم `const d = HAS_DB ? describe : describe.skip` (`rls-coverage.live.spec.ts:35-36`) — لا `return` مبكر (`no-silent-skip.spec.ts:140-142`). ويُوسَم `[SPEC 1.2]` كأخيه (`rls-coverage.live.spec.ts:100`).

**① القارئ — دالّةٌ تقبل عميلاً أو معاملة** (فيرى الإثباتُ العكسيّ ما أُنشئ داخل معاملته):
```ts
type PolicyRow = { table: string; name: string; permissive: string; roles: string[]; cmd: string; qual: string | null; check: string | null };
const readPolicies = (db: Prisma.TransactionClient | PrismaClient) => db.$queryRaw<PolicyRow[]>`
  SELECT p.tablename AS "table", p.policyname AS name, p.permissive,
         p.roles::text[] AS roles, p.cmd, p.qual, p.with_check AS "check"
    FROM pg_policies p
   WHERE p.schemaname = 'public'`;
```
والسطحُ **كلُّ سياسةٍ في `public`** لا نماذجُ `companyId` وحدَها — لأن `company_user_branches` بلا `companyId` (شكل **د**)، و`tenantOwnedModels()` (`export-scope.ts:80-84`) لا يراه.

**② الشكلُ القانونيّ مشتقٌّ من المُحلِّل نفسِه لا مكتوبٌ بيد.** لا يُكتب في الحارس نصُّ `pg_get_expr` المتوقَّع (`::text` والأقواس تفاصيلُ المُحلِّل ونسخته) — ولا يُطبَّع بتعبيراتٍ نمطية (مرشِّحٌ بين المصدر والمخرَج يُعمي صامتاً). بل في معاملةٍ تُرجَع:
```sql
CREATE TABLE "__rls_shape_<pid>_<ts>" ("id" text, "companyId" text);
CREATE POLICY __canon ON "__rls_shape_…" USING ("companyId" = current_setting('app.company_id', true))
                                         WITH CHECK ("companyId" = current_setting('app.company_id', true));
SELECT qual, with_check FROM pg_policies WHERE policyname = '__canon';   -- ⟵ CANON
```
(جدولُ مسبارٍ باسمٍ فريد — لا قفلَ على جدولٍ حقيقيّ ولا تصادمَ بين عاملَين؛ و`app_user` مالكُ `public` فله `CREATE`: `docker/postgres-init/01-create-app-role.sql:9` · `web-tests.yml:251-253` · والهجراتُ في السير تُطبَّق بـ`app_user` نفسِه: `web-tests.yml:180,256-260`.)

**③ الاستثناءاتُ المعتمدة — بالاسم والجدول والأمر وعبارتها المصدرية وحجّتها:**
```ts
const APPROVED = [
  { table: 'company_users', name: 'tenant_isolation_company_users', cmd: 'ALL',
    using: `"companyId" = current_setting('app.company_id', true) OR current_setting('app.platform_admin', true) = 'true'`,
    check: `"companyId" = current_setting('app.company_id', true)`,
    why: 'ق-٦٧٥/ق-٦٦٢ — مسنَدُ الإدارة يعدّ الحساباتِ الراكبة على قالبٍ عامّ، ولا يكتب' },
  { table: 'permission_templates', name: 'tenant_isolation_permission_templates', cmd: 'ALL',
    using: `"companyId" IS NULL OR "companyId" = current_setting('app.company_id', true) OR current_setting('app.platform_admin', true) = 'true'`,
    check: `"companyId" = current_setting('app.company_id', true) OR ("companyId" IS NULL AND current_setting('app.platform_admin', true) = 'true')`,
    why: 'ق-٦٧٥ — العامُّ يُرى قبل أيّ سياق (التسجيل)، والكتابةُ عليه لمسنَد الإدارة' },
  { table: 'company_user_branches', name: 'tenant_isolation_company_user_branches', cmd: 'ALL', using: '<EXISTS … من الهجرة>', check: '<مثله>',
    why: 'ق-٦٥٣ — بلا companyId، يُبلَغ عبر أبيه' },
  { table: 'api_keys', name: 'api_key_authentication', cmd: 'SELECT',
    using: `current_setting('app.api_key_auth', true) = 'true'`, check: null,
    why: 'ق-١٢٩١ — المفتاحُ يُقدَّم قبل أن يُعرف مستأجرُه؛ FOR SELECT، ومسارٌ واحد (runAsApiKeyLookup)، وبالبادئة الفريدة' },
];
```
ويُشتقّ **الشكلُ المتوقَّع لكلٍّ منها بالمُحلِّل** كالقانونيّ: الثلاثةُ الأولى والرابع تُنشأ على جدول المسبار (أعمدتُها `companyId` فقط)؛ و**د** وحدَه يسمّي جدولَه في مصدره (`"company_user_branches"."companyUserId"`) فيُشتقّ على الجدول الحقيقيّ في معاملته المُرجَعة (قفلٌ قصير على جدولٍ واحد — أو يُكتب نصُّه حرفاً **منقولاً من مخرَج الاستعلام ٦-①** لا من الذاكرة).

**④ الاختبارات:**

| # | الاسم | التوكيد |
|---|---|---|
| ⓪ | حارسٌ على المسبار | `readPolicies` يعيد > 90 صفّاً ويحوي `tenant_isolation_accounts`؛ و`CANON` غيرُ فارغ **ويساوي** `qual` لـ`accounts` (حالةٌ معلومةٌ يجب أن تُطابَق) **ولا يساوي** `qual` لـ`api_key_authentication` (حالةٌ يجب ألّا تُطابَق) |
| ① | `[SPEC 1.2]` كلُّ سياسةٍ **متساهلة** إمّا قانونيّةٌ أو استثناءٌ معتمدٌ بعينه | قانونيّة = `cmd='ALL'` و`qual = CANON` و`check ∈ {CANON}`؛ أو تطابقٌ **تامّ** مع مدخلٍ في `APPROVED` على (`table`,`name`,`cmd`,`qual`,`check`). الباقي ⟵ `offenders` تُطبع بـ`table.name: qual / check` و`expect(offenders).toEqual([])`. **مطابقةٌ تامّة لا `includes`** — وإلا مرّت `… OR true` (عيبُ `rls-probe.live.spec.ts:129` بعينه) |
| ② | كلُّ جدولٍ `relrowsecurity` له سياسةٌ متساهلةٌ واحدة على الأقلّ قانونيّةٌ أو معتمدة | يمنع جدولاً سياستُه كلُّها مقيِّدة (`RESTRICTIVE`) فيعمى، أو استثناءً وحدَه بلا قانونيّة (كـ`api_keys` لو سقطت `tenant_isolation_api_keys`) |
| ③ | الاستثناءاتُ صادقة في الاتجاهين | كلُّ مدخلٍ في `APPROVED` موجودٌ حيّاً **ومطابق**؛ ومدخلٌ صار قانونيّاً أو زال ⟵ يُسقط (نمطُ `rls-coverage.live.spec.ts:126-145`)؛ ولكلٍّ حجّةٌ > 40 حرفاً (`:147-151`) |
| ④ | 🔴 **الإثباتُ بالعكس — `USING (true)`** | في معاملةٍ تُرجَع: جدولُ مسبارٍ بـ`ENABLE`+`FORCE`+القانونيّة، ثم `CREATE POLICY __probe_open … USING (true) WITH CHECK (true)`؛ **وقوعُ الكسر أوّلاً**: عددُه في `pg_policies` داخل المعاملة = 1؛ ثم `offenders(readPolicies(tx))` **يحوي** `__probe_open`. **وسلوكيّاً في المعاملة نفسِها**: صفٌّ يُكتب بسياق «أ» يُقرأ بسياق «ب» = 1، وبعد `DROP POLICY __probe_open` = 0 — فالمُمسَك تسريبٌ حقيقيّ لا شكلٌ فقط |
| ⑤ | صياغاتٌ محتملة — كلٌّ في معاملته (خطأُ Postgres يُجهض المعاملة `25P02` — `marketing-consent.live.spec.ts:98-99`) | تُمسك جميعاً: `CANON OR true` · `FOR SELECT USING (true)` · `USING CANON WITH CHECK (true)` (تسريبُ كتابة) · `USING (CANON OR current_setting('app.platform_admin', true) <> 'false')` على جدولٍ عاديّ · `TO app_user USING (true)` |
| ⑥ | الضوابطُ — **يجب ألّا تُمسك** | `AS RESTRICTIVE USING (true)` (يُضيّق ولا يوسّع — `AND true`) · سياسةٌ قانونيّةٌ مكرَّرة باسمٍ آخر. فحارسٌ يُمسك كلَّ شيء يُمسك الكسرَ أيضاً فيبدو عاملاً (`§8.15`) |
| ⑦ | القاعدةُ بعد التشغيل كما قبله | من اتصالٍ جديد: لا سياسةَ باسم `__probe%`/`__canon` ولا جدولَ `__rls_shape_%` |

### ٥-ب) مواضعُ تُعدَّل معه

- `apps/api/test/rls-coverage.e2e-spec.ts:111` — عنوانُ الاختبار ② «carries an **isolation** policy» وهو يعدّ فقط؛ يُصحَّح العنوانُ إلى «carries a policy» ويُحال في تعليقه إلى الحارس الجديد (`§8.14`).
- `apps/api/src/activities/rls-probe.live.spec.ts:129` — حكمُ `includes('app.company_id')` المطبوع يُستبدل بالمصنِّف نفسِه من الحارس الجديد (تشخيصٌ يطبع حكماً خاطئاً على `… OR true` أسوأُ من لا حكم).
- `apps/api/src/common/tenant/tenant-scope-coverage.spec.ts:66` — يبقى كما هو (نصّيٌّ بلا قاعدة، وحدُّه معلَن `:39-42`)؛ **والحيُّ هو الحَكَم** كما يقول تعليقُه نفسُه.
- (اختياريّ، خارج الدعوى بحدّها) حارسٌ نصّيّ يحصر ضابطي المسنَدَين: `set_config('app.platform_admin'` و`set_config('app.api_key_auth'` لا يظهران في الشيفرة غير الاختبارية إلا في `tenant-prisma.service.ts:78,99` و`platform-bootstrap.ts:30` — لأن الاستثناءات **ب/ج/هـ** تقوم على مسنَدٍ يستطيع أيُّ استعلامٍ خامٍ ضبطَه؛ والحارسُ الجديد يرى **شكلَ** السياسة ولا يرى **من يضبط** مسنَدَها.

### ٥-ج) ما ينكسر

- **لا شيء في المنتَج** — اختبارٌ فقط.
- **هجرةٌ قادمة بشكلٍ جديد مشروع** (مثلاً سياسةٌ على مستوى الفرع) تُسقط الحزمة حتى تُعلن في `APPROVED` بحجّتها — وهو المقصود.
- **كلفةُ التشغيل**: `CREATE TABLE` وبضعُ `CREATE POLICY` في معاملاتٍ تُرجَع على جدول مسبار؛ ثوانٍ.
- **خطرُ الإنذار الكاذب**: إن اختلف تحليلُ التعبير بين نسخ Postgres — مُعالَجٌ بالاشتقاق من القاعدة نفسِها (`postgres:16-alpine` في التطوير والسير: `docker-compose.yml:3` · `web-tests.yml:164`).

### ٥-د) كسرٌ محتملٌ للإثبات بالعكس (`§8.8` الوجه الثاني — صياغةٌ يكتبها مطوّرٌ فعلاً)

1. **على المنتَج**: هجرةٌ «تُصلح» دَين `KNOWN_WEAK` بـ`ALTER TABLE "account_deletion_requests" FORCE ROW LEVEL SECURITY; CREATE POLICY admin_read ON "account_deletion_requests" FOR SELECT USING (true);` — الحرّاسُ الحاليّة كلُّها خضراء (بل يطلب `rls-coverage.live.spec.ts:143-144` حذفَ الجدول من `KNOWN_WEAK`)، والجديد يجب أن يُسقط.
2. **على الحارس نفسِه**: مصنِّفٌ يطابق بـ`qual.includes("app.company_id")` بدل التطابق التامّ — الحالةُ ⑤-أ (`CANON OR true`) يجب أن تُسقطه؛ فإن لم تُسقطه فالحارسُ لم يُثبَت.
3. **على الكتابة**: `USING CANON WITH CHECK (true)` — مطوّرٌ يفتح الكتابة لاستيرادٍ جماعيّ «مؤقّتاً»؛ يجب أن يُمسك لأن `check ∉ {CANON}`.

---

## (6) أرقامٌ تُقاس على قاعدة التطوير قبل التغيير

⚠️ **كتالوجُ النظام (`pg_policies` · `pg_policy` · `pg_class` · `pg_attribute` · `pg_proc` · `pg_roles`) ليس تحت عزل الصفوف** — فالاستعلامات ①–⑥ تُشغَّل بـ`app_user` بلا سياق وتعطي الحقيقة كاملة. أمّا ⑦–⑧ فتقرأ **بيانات** جداولٍ تحت `FORCE` — فإمّا بدورٍ يتجاوز العزل (`mad_app` الخارق في التطوير: `docker-compose.yml:6`) أو بـ`app_user` داخل المسنَد/السياق كما هو مكتوب، **ويُقارَن الاثنان** (قاعدةُ 2026-08-12: عدٌّ خارج السياق يرى الغيابَ حيث لا غياب).

**① جردُ السياسات بمحتواها** (المتوقَّع بالقراءة: 101 صفّاً على 100 جدول):
```sql
SELECT p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check
  FROM pg_policies p
 WHERE p.schemaname = 'public'
 ORDER BY p.tablename, p.policyname;
```

**② الأشكالُ المتمايزة** (المتوقَّع: خمسُ مجموعات 97/1/1/1/1 — أيُّ مجموعةٍ سادسة = انحرافٌ عن الهجرات يُقرأ قبل البناء):
```sql
SELECT p.permissive, p.cmd, p.roles::text AS roles, p.qual, p.with_check,
       count(*) AS policies,
       string_agg(p.tablename || '.' || p.policyname, ', ' ORDER BY p.tablename) AS members
  FROM pg_policies p
 WHERE p.schemaname = 'public'
 GROUP BY 1, 2, 3, 4, 5
 ORDER BY policies DESC;
```

**③ الجداولُ تحت العزل ومالكُها وعددُ سياساتها** (المتوقَّع: 100 جدول · `forced=false` لثلاثةٍ بأسمائها `account_deletion_requests`/`support_access_grants`/`support_access_logs` · المالك `app_user` للجميع — **شرطُ أن يُنشئ الإثباتُ بالعكس سياسةً** · `restrictive = 0` · `permissive = 1` إلا `api_keys` = 2):
```sql
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) AS owner,
       count(p.polname) FILTER (WHERE p.polpermissive)     AS permissive,
       count(p.polname) FILTER (WHERE NOT p.polpermissive) AS restrictive
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
 WHERE c.relkind = 'r' AND (c.relrowsecurity OR p.polname IS NOT NULL)
 GROUP BY 1, 2, 3, 4
 ORDER BY 1;
```

**④ نوعُ `companyId` على جداول العزل** (المتوقَّع: `text` وحدَه — شرطُ أن يصدق اشتقاقُ الشكل القانونيّ على جدول مسبارٍ عمودُه `text`):
```sql
SELECT format_type(a.atttypid, a.atttypmod) AS type, count(*) AS tables
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
 WHERE a.attname = 'companyId' AND NOT a.attisdropped AND c.relkind = 'r' AND c.relrowsecurity
 GROUP BY 1;
```

**⑤ لا دالّةَ تُظلّل `current_setting`/`set_config`** (المتوقَّع: 0 — وإلا فالشكلُ القانونيّ يقرأ غيرَ ما يظنّ):
```sql
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE p.proname IN ('current_setting', 'set_config') AND n.nspname <> 'pg_catalog';
```

**⑥ الأدوار** (المتوقَّع: `app_user` بـ`rolsuper=false` و`rolbypassrls=false`؛ و`current_user` في جلسة الاختبار = `app_user`):
```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname IN ('app_user', 'mad_app');
SELECT current_user;
```

**⑦ عرضُ الاستثناءات المعتمدة بالبيانات — بـ`app_user` داخل مسنَدها، في معاملةٍ تُرجَع:**
```sql
BEGIN;
SELECT set_config('app.api_key_auth', 'true', true);
SELECT count(*) AS keys, count(DISTINCT "companyId") AS companies FROM api_keys;
ROLLBACK;

BEGIN;
SELECT set_config('app.platform_admin', 'true', true);
SELECT count(*) FILTER (WHERE "companyId" IS NULL)     AS global_templates,
       count(*) FILTER (WHERE "companyId" IS NOT NULL) AS private_templates,
       count(DISTINCT "companyId")                     AS companies_with_private
  FROM permission_templates;
SELECT count(*) AS company_users, count(DISTINCT "companyId") AS companies FROM company_users;
ROLLBACK;
```
**وبـ`mad_app`** (يتجاوز العزل) الاستعلاماتُ نفسُها **بلا** `set_config` — والرقمان يجب أن يتساويا؛ وتفاوتُهما يعني أن المسنَد أضيقُ أو أوسعُ مما يُظنّ.

**⑧ ما يُرى بلا أيّ سياق على كل جدولٍ تحت العزل — بـ`app_user`** (المتوقَّع: تحذيرٌ لـ`permission_templates` بعدد القوالب العامّة، ولكلٍّ من الثلاثة بلا `FORCE` — لأن المالك يتجاوز سياستها — **وصفرٌ في كل ما عداها**؛ وصفرٌ في جدولٍ فارغ لا يحكم، فيُقرن بعدِّ `mad_app` للجدول نفسِه):
```sql
DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace AND ns.nspname = 'public'
     WHERE c.relkind = 'r' AND c.relrowsecurity ORDER BY 1
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.relname) INTO n;
    IF n > 0 THEN RAISE WARNING 'visible without context: % = %', r.relname, n; END IF;
  END LOOP;
END $$;
```

**⑨ نصُّ المُحلِّل الفعليّ للشكل القانونيّ** (لِيُعرف لا ليُكتب في الحارس): `SELECT qual, with_check FROM pg_policies WHERE tablename = 'accounts';` — المتوقَّعُ **غيرُ المقيس**: `("companyId" = current_setting('app.company_id'::text, true))`. و`SHOW server_version;` للمقارنة بصورة السير.

---

## (7) ما لا أعرفه

1. **حالُ القواعد الحيّة**: قرأتُ الهجرات لا القواعد. سياسةٌ أُنشئت يدوياً على التطوير أو المنشور لا يراها هذا التقرير — ويحسمها ٦-②. والمنشورُ كان متأخّراً بعشرات الهجرات حين كُتب `docs/decisions.md:1867` (`ق-٦٧٩`)، وحالُه اليوم لم أقرأه.
2. **النصُّ الحرفيّ لـ`pg_get_expr`** على Postgres 16 — لم يُقَس؛ والتصميمُ لا يعتمد عليه لأنه يشتقّه.
3. **نوعُ قفل `CREATE POLICY`** وأثرُه على العمّال المتوازين في `jest` — لم أتحقّق منه في مصدر Postgres؛ ولذلك اختير جدولُ مسبارٍ باسمٍ فريد لكل الحالات عدا اشتقاق الشكل **د**.
4. **ملكيةُ الجداول على قاعدة التطوير**: الهجراتُ تُطبَّق بـ`app_user` في السير (`web-tests.yml:180,256-260`) وبحسب `.env.example:1` في التطوير؛ لكن جدولاً أنشأه `mad_app` يوماً (مثلاً بقاعدةٍ ظلّية) يُفشل `CREATE POLICY` في الإثبات بـ«must be owner». يحسمه ٦-③.
5. **هل في `customers` على قاعدة السير صفوفٌ** — فيُمسك `rls-probe.live.spec.ts:157` سياسةً مفتوحة عليه بالصدفة؟ لم أقرأ البذرة لذلك.
6. **أنّ اختبارات `*-tenant-isolation.e2e-spec.ts` تمرّ مع طبقةٍ ثانيةٍ مكسورة** — استنتاجٌ من أنها لا تمسّ القاعدةَ خاماً (صفرُ `set_config`/`$queryRaw`)، لا قياس؛ ويتوقّف على أن امتدادَ المستأجر يحقن `companyId` في كل مسارٍ تقرؤه.
7. **من يضبط المسنَدَين**: الحارسُ المقترح يحكم على شكل السياسة، ولا يرى أن `app.platform_admin`/`app.api_key_auth` يضبطهما أيُّ استعلامٍ خامٍ في العملية — وحصرُ ضابطيهما (٥-ب) حارسٌ مستقلّ لم يُبنَ ولم يُطلب.
8. **الشققُ الرمادية في دلالة Postgres** التي بنيتُ عليها ولم أقِسها هنا: أن `WITH CHECK` الغائب في سياسة `ALL` يأخذ `USING`، وأن السياسات المقيِّدة وحدها بلا متساهلة تُعمي الجدول — كلاهما من معرفتي بـPostgres لا من قياسٍ في هذه الجلسة، ويثبتهما الإثباتُ ⑥ حين يُبنى.

---

## مراجعةٌ عدائية

**قِيست على:** `D:\worktrees\outbox-266` (رأسُها `eda979a2`، شجرةٌ نظيفة). قراءةٌ وبحثٌ فقط — لا اختبارَ ولا `prisma` ولا `docker`. ⚠️ **إفصاح**: لقراءة الأشكال كتبتُ سكربتَ قراءةٍ ومخرجاته في مجلد المسودة (`…\scratchpad\policies.mjs` · `en.txt` · `pol.txt`) وملفاً عابراً `/tmp/en.txt` — لا شيءَ منها في المستودع؛ وهذا خارجُ حرف «لا يُكتب إلا التقرير».

### الحكم: **قائمة — يصمد**، بل أشدّ مما كتب التقرير (البند ١). والتصحيحُ الأهمّ: القياسُ ٤-أ يعيد كتابة استعلامَي حارسين ولا يشغّل الحرّاس، فيعمى عن الحرّاس السلوكية والعَرَضية (البندان ٢ و٣).

### ما صمد بالتحقّق (لا يُعاد)

- العددُ **102** موضعاً في **70** ملفّاً، منها تعليقُ `init/migration.sql:165` ⟵ **101** سياسة. استخرجتُ كلَّ عبارة `CREATE POLICY … ;` بعد حذف التعليقات وطبّعتُ المسافات: **97** قانونيّة حرفاً + **ب** (`company_users_rls/migration.sql:19-24`) + **ج** (`permission_templates_rls/migration.sql:24-33`) + **د** (`company_users_rls/migration.sql:29-39`) + **هـ** (`api_keys/migration.sql:49-51`). لا `TO` ولا `AS` في أيٍّ منها، ولا `ALTER POLICY`، والـ`DROP POLICY` ثلاثٌ تعيد (`company_users_rls:18,28` · `permission_templates_rls:23`).
- مجموعةُ جداول `^ALTER TABLE "x" ENABLE ROW LEVEL SECURITY` = **100** ومجموعةُ جداول السياسات = **100**، و`diff` بينهما فارغ (مطابقةُ مجموعتين لا عددين).
- `USING (true)` / `USING(true)` في المستودع = **0**؛ والضابط `CREATE POLICY` = 102.
- ضابطو المسنَدَين في الشيفرة غير الاختبارية ثلاثةٌ لا غير: `tenant-prisma.service.ts:78,99` و`platform-bootstrap.ts:30` (بحثٌ شمل `src` و`scripts` و`seed`، وبصيغتَي `SET LOCAL app.` و`set_config($…)` — صفر).
- لا شيفرةَ حيّة تغيّر السياسات: `NO FORCE|DISABLE ROW LEVEL|CREATE POLICY|DROP POLICY|ALTER POLICY|row_security` في `apps/api/src` (غير الاختبارية) و`scripts` و`seed.ts` = **0**؛ والضابط: النمطُ نفسُه في الهجرات يصيب عشرات مواضع `NO FORCE` (رفعٌ وإعادةٌ حول الـDML، يحرسه `migration-rls-read.spec.ts:84-107`).
- لا قناةَ تجاوزٍ بالتعريف في الهجرات: `SECURITY DEFINER|CREATE VIEW|MATERIALIZED|security_invoker` = **0**؛ والضابط `CREATE (OR REPLACE) FUNCTION` = **16** في **9** ملفّات (مشغِّلاتٌ بحقّ المستدعي).
- مواضعُ ٢-أ صحيحةٌ كما ذُكرت: `rls-coverage.live.spec.ts:77-85,104-110,117-123,143-144` · `rls-coverage.e2e-spec.ts:111-127,131-143` · `tenant-scope-coverage.spec.ts:62-68` · `rls-probe.live.spec.ts:36-44,114-144,129,157` · `offline-incidents.spec.ts:79` · `marketing-consent.live.spec.ts:89-95` · والأسماءُ الأربعة `toContain('tenant_isolation_…')`. و`pg_policies|polqual|polwithcheck|pg_get_expr|with_check` خارج `node_modules` يصيب في الشيفرة `rls-probe.live.spec.ts:108,120` وحدَه.
- استعلاماتُ §٦ لا يعدّ أيٌّ منها صفراً بسبب العزل: ①–⑥ كتالوج؛ ⑦ داخل مسنَدها ومقرونٌ بعدّ الخارق؛ ⑧ صفرُه المقصود مقرونٌ بعدّ الخارق للجدول نفسِه.

### ١) 🔴 مسارُ شيفرةٍ فائت يرفع الخطورة: الاستعلامُ الخامّ لا يمرّ بامتداد المستأجر

`tenant-scope.extension.ts:209-213` يعترض `$allModels.$allOperations` وحدَها — **فكلُّ `$queryRaw` خارجه**، ولو على نموذجٍ في `TENANT_SCOPED_MODELS`. وحيث لا يكتب الاستعلامُ `"companyId"` صراحةً **فنصُّ السياسة هو المرشّحُ الوحيد**:

| الموضع | الاستعلام | أثرُ `USING (true)` على جدوله |
|---|---|---|
| `delegations/delegations.service.ts:215-220` | `SELECT … FROM "delegation_logs" ORDER BY "seq" ASC` — بلا مرشّح | سجلُّ تفويض كلّ المنشآت يُقرأ لمنشأةٍ واحدة |
| `tasks/tasks.service.ts:269` | `SELECT * FROM "tasks" WHERE "id" = ${id}` | مهمّةُ منشأةٍ تُفتح بمعرّفها من أخرى |
| `tasks/tasks.service.ts:349` | `SELECT COALESCE(MAX("seq"), 0) … FROM "task_logs"` | التسلسلُ يُحسب عبر المنشآت |
| `inventory/inventory-ledger-reconciliation.util.ts:59-60` | `SUM(l."qtyRemaining" * l."unitCost") FROM inventory_layers l` | مطابقةُ المخزون تجمع طبقاتِ الجميع |

ومعها النماذجُ **`db-only`** — لا حقنَ لها أصلاً: `Task` · `TaskLog` · `DelegationLog` · `PurchaseLine` · `InventoryLayer` · `InventoryConsumption` (`tenant-scope-exceptions.ts:35-57`) و`PermissionTemplate` (`:77-80`). وسطحُ الخامّ: **39** سطراً `$queryRaw…` في **18** ملفّاً غيرِ اختباريّ (لم أفرز كلَّها — الأربعةُ أعلاه عيّنةٌ مؤكَّدة لا حصر).

⟵ **فعبارةُ التقرير** (٢-أ الصفّ الأخير، و§٧-٦) «تبقى خضراء ما دامت إحداهما قائمة» **لا تصدق على هذه المسارات: لها طبقةٌ واحدة هي السياسة.** الفجوةُ إذن ليست «طبقةً ثانيةً بلا حارس» فحسب، بل **الحارسُ الوحيد لمساراتٍ تعمل اليوم**. تعزيزٌ للحكم لا نقضٌ له، ويرفع أولويّةَ البناء.

### ٢) حرّاسٌ سلوكيةٌ وعَرَضيةٌ فاتت قائمةَ ٢-أ

- **`purchases/purchase-lines.live.spec.ts:181-192`** (`[SPEC 1.2] ③ والعزل`): يضبط سياق «ب» ويقرأ `tx.purchaseLine.findMany` بالعميل الخامّ (`PurchaseLine` `db-only` فلا حقن) ويوكّد `0` — **يُمسك `USING (true)` على `purchase_lines`**. فالجداولُ المحروسةُ سلوكياً خمسةٌ لا أربعة، و«نحو 95» ⟵ **94 على الأكثر**.
- **عَرَضيّ**: `test/inventory-ledger-reconciliation.e2e-spec.ts:151,156-164` يوكّد مجموعَ الطبقات لمنشأةٍ معزولة (`40` · `440` · `320` …) والمجموعُ يُقرأ بلا مرشّح (`inventory-ledger-reconciliation.util.ts:59-60`) — **فسياسةٌ مفتوحة على `inventory_layers` تُسقطه**. وعلى `journal_lines` **لا**: الربطُ بـ`accounts` المقيَّدة يحصر السطور (`:53-56`). فالإمساكُ العَرَضيُّ **لكلّ جدولٍ بعينه** ولا يُستنتج بالقراءة.
- بحثُ السلوكيّ: `set_config('app.company_id', ${companyB}` و`asCompany(tx, companyB)` في `src` و`test` ⟵ أربعة ملفّات (`identity-company.live` · `company-users-rls.live` · `purchase-lines.live` · `permission-templates-rls.live`) — والتقرير عدّ اثنين منها حارسَين وفاته الثالث (`identity-company.live` يختبر المشغِّلَ لا العزل).

⟵ **العددُ الحقيقيّ للجداول «بلا أيّ حارس» غيرُ محسومٍ بالقراءة** — والتقريرُ قدّمه رقماً (95).

### ٣) 🔴 القياسُ ٤-أ مسبارٌ أعمى جزئياً — يقيس إعادةَ كتابةٍ للحرّاس لا الحرّاس

يشغّل داخل المعاملة استعلامَي `rls-coverage.live.spec.ts:104-110` و`rls-coverage.e2e-spec.ts:112-122` **منسوخَين**، ويحكم `caughtByExistingGuards` منهما وحدَهما. والحرّاسُ السلوكية (البند ٢، و`rls-probe.live.spec.ts:150-157`) **تفتح اتصالاتِها فلا ترى سياسةً غيرَ ملتزمة أصلاً** — فـ`false` **محسومٌ بالبناء** ولا يشهد أن «الحزمة تمرّ». وهو `§8.10`: قِيس الشيءُ المصنوع لا الشيءُ المقصود.

**البديل الذي يحسم**: قاعدةٌ مؤقّتة نظيفة (نسخةٌ على آخر هجرة)، و`CREATE POLICY __gap7a_open ON "<t>" USING (true) WITH CHECK (true);` **ملتزمةً**، ثم تشغيلُ الحزم **الفعلية بأسمائها**: `rls-coverage.live` · `rls-coverage.e2e` · `tenant-scope-coverage` · `rls-context` · `rls-probe.live` وحزمةُ `e2e` كاملة. **المتوقّع إن كانت الدعوى قائمة لذلك الجدول: أخضرُ كلّها**، ومعه قراءةٌ عابرة = 1 بسياق «ب».
- **ضابطٌ موجب** (مسبارٌ مُصادَق): الحقنُ نفسُه على `purchase_lines` **يجب** أن يُسقط `purchase-lines.live.spec.ts:192` — وإلا فالأداةُ لا ترى.
- **الهدف**: جدولٌ لا يمسّه مسارٌ خامّ بلا مرشّح ولا حارسٌ سلوكيّ — `warranties` مرشَّحٌ بعد التحقق؛ لا `customers` (التقرير نفسُه يقرّ أن `rls-probe.live.spec.ts:157` قد يُمسكه).

### ٤) عيبٌ منطقيّ في الحارس المقترح ②

يقول ٥-أ② إنه يمنع «استثناءً وحدَه بلا قانونيّة (كـ`api_keys` لو سقطت `tenant_isolation_api_keys`)». **لكنّ شرطه «قانونيّةٌ أو معتمدة»** — و`api_key_authentication` معتمدٌ (`api_keys/migration.sql:49-51`) فيُرضيه وحدَه؛ و③ لا يرى الزوالَ لأن `tenant_isolation_api_keys` **قانونيّةٌ لا مدخلٌ في `APPROVED`**. **فالدعوى ساقطةٌ كما كُتبت.** الأثرُ عمىً للتاجر عن مفاتيحه لا تسريب (`FOR SELECT` مشروطٌ بمسنَد) — لكنّ الحارس يَعِد بما لا يفعل. **العلاج**: حقلٌ على كلّ مدخل `alongsideCanonical` — `api_keys` يشترط القانونيّةَ بجانبه، والثلاثةُ الأخرى (ب/ج/د) بديلةٌ عنها؛ وضابطٌ في ⑤: `DROP POLICY tenant_isolation_api_keys` داخل معاملةٍ مُرجَعة **يجب** أن يُسقط ②.

### ٥) ثغرةٌ في ③: السياسةُ تبقى بعد تعطيل العزل

`pg_policies` يُبقي السياسة بعد `DISABLE ROW LEVEL SECURITY` (السياساتُ لا تُحذف بتعطيل الراية — معرفةٌ بـPostgres لم أقِسها هنا). و`company_user_branches` بلا `companyId` (`schema.prisma:798-806`) **فخارجُ اشتقاق** `rls-coverage.live.spec.ts:77-85` (`export-scope.ts:80-84`) — لا حارسَ `ENABLE/FORCE` مشتقّاً عليه. فالحارسُ المقترح يشهد «موجودٌ ومطابق» على جدولٍ عُطّل عزلُه. يغطّيه سلوكياً `company-users-rls.live.spec.ts:112-123`، لكنّ حارسَ المحتوى **يقرأ `relrowsecurity`/`relforcerowsecurity` لكلّ جدولٍ يفحص سياساته** (ربطٌ بـ`pg_class`) — وإلا كان محتوىً بلا نفاذ.

### ٦) إنذارٌ كاذبٌ غيرُ مذكور في ①

① يشترط `check ∈ {CANON}`. وسياسةُ `ALL` بلا `WITH CHECK` يأخذ Postgres فيها `USING` شرطاً للكتابة (§٧-٨ من التقرير نفسه) فيكون `with_check = NULL` **وهي آمنة** — ويُدينها ①. ليس عمىً بل حارسٌ يُنذر بما لا يسرّب (`§8.11`: «حارسٌ يُزعج يُعطَّل»). **يُقبل `NULL`** حين `qual = CANON` و`cmd ∈ {ALL, UPDATE}`، وتُضاف الحالةُ إلى ضوابط ⑥ «يجب ألّا تُمسك».

### ٧) اشتقاقُ الشكل **د** على الجدول الحقيقيّ لا يصلح في حارسٍ دائم

خطوةُ السير الحيّة تشغّل الحرّاس **بلا `--runInBand`** (`web-tests.yml:312-313`: `npx jest --roots '<rootDir>/src' --testPathPattern 'live\.spec'`) — فقفلُ `CREATE POLICY` على `company_user_branches` داخل معاملةٍ يحبس `company-users-rls.live.spec.ts` في عاملٍ آخر، ومعاملاتُ Prisma التفاعلية ذاتُ مهلةٍ محدودة ⟵ تقلّب. **فالبديلُ الذي ذكره التقرير «أو» — النصُّ منقولاً من مخرَج ٦-① — هو الصواب وحدَه** للشكل **د**. (نوعُ القفل لم أتحقّقه من مصدر Postgres؛ أيُّ قفلٍ يتعارض مع الكتابة يكفي للحبس.)

### ٨) تصحيحاتُ مواضعَ صغيرة

- `tenant-scope-exceptions.ts:77-80` يسوّغ **ج** (`PermissionTemplate`) وحدَه؛ **ب** (`company_users`) لا مدخلَ له هناك — تعليقٌ في `:73-75` لأنه صار في الطبقتين.
- §٧-٤ «جدولٌ أنشأه `mad_app` يُفشل `CREATE POLICY` في الإثبات» يصدق على **القياس ٤-أ واشتقاق د** فقط؛ الإثباتُ بالعكس ④ في الحارس الدائم على **جدول مسبارٍ ينشئه `app_user` نفسُه** فلا يمسّه.
- §٦-⑧ «تحذيرٌ لكلٍّ من الثلاثة بلا `FORCE` لأن المالك يتجاوز سياستها» مشروطٌ بأن `app_user` مالكُ الجداول على تلك القاعدة (§٦-③) — وإلا عادت صفراً وهي سليمة.

### ٩) ما لم أحسمه

- كم من الأسطر الـ39 الخامّة يقرأ بلا `"companyId"` صريح — عيّنةُ أربعة مؤكَّدة، والحصرُ لم يُجرَ.
- هل تمسّ اختباراتُ `e2e` الأخرى مساراتٍ خامّةً بمنشأتين فتُمسك عَرَضاً جداولَ أخرى — لا يُعرف إلا بالقياس في البند ٣.
