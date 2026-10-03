# الدعوى (و) — حذفُ المنشأة وفيها مستنداتٌ تحت الحفظ

> قراءةٌ فقط على `D:\worktrees\outbox-266` (main + تغيير الطابور). لا تشغيل ولا تعديل. كلُّ دعوى بموضعها.

---

## (1) الدعوى بنصّها

> «حذفُ المنشأة: أيوجد مسارٌ يحذفها نهائياً وفيها مستنداتٌ تحت الحفظ؟ وأثبته بمحاولة.»
> المطلوب: كلُّ مسارٍ يحذف صفَّ `companies` (مسارُ المنصّة `DELETE /companies/:id` · تنفيذُ طلبات الحذف · السكربتات · كنسُ السلّة — بلا مساعدات الاختبار)، وهل يُمنع حين تحمل المنشأةُ مستنداتٍ تحت الحفظ النظاميّ (فواتيرُ 6 سنوات · عقارٌ 11)، و`onDelete: Cascade` من `Company` إلى جداول المستندات، وتصميمُ المحاولة الحيّة.

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### 2.1 المسلكُ الوحيد لحذف صفّ المنشأة: حذفُ هويّة دخول المالك ← `CASCADE`

- `Company.loginIdentity … onDelete: Cascade` — `apps/api/prisma/schema.prisma:311`؛ وفي القاعدة: `companies_loginIdentityId_fkey … ON DELETE CASCADE` — `prisma/migrations/20260719160445_init/migration.sql:121`.
- `CompaniesService.remove()` يحذف **هويّةَ الدخول** لا المنشأة، فتسقط المنشأةُ بالتسلسل — `apps/api/src/companies/companies.service.ts:220-232` (والتعليق `:208-210`: «Hard delete. Cascades through every business table via Company's onDelete: Cascade relations»). **لا فحصَ فيه لأيّ مستندٍ ولا لأجل حفظ** — يترجم رفضَ القاعدة (`P2003`) فقط (`:226-229`).
- المنشأةُ إلى جداول المستندات: **٩٣ علاقة `Cascade` و٣ `Restrict`** من ٩٦ علاقةً إلى `Company` (بحث `Company\??\s+@relation\(` على `schema.prisma` = ٩٦ سطراً عددتُها، كلُّها تحمل `onDelete` صريحاً — منها `memberOf` `:132` و`ownerCompany` `:283`؛ والصيغةُ الضيّقة `company\s+Company…` = ٩٤ لأنها تستثني هذين؛ و`onDelete: (Restrict|NoAction|SetNull)` = ثلاثٌ فقط: `:6413` `Task` · `:6465` `TaskLog` · `:6499` `DelegationLog`). ومنها: `Invoice` `:1400` · `JournalEntry` `:3048` · `Contract` `:4142` · `MaintenanceRequest` `:3692` · `Warranty` `:3765` — كلُّها `Cascade`.
- ما يبقى بعد الحذف بلا مفتاحٍ أجنبيّ عمداً: `AuditLog` (`schema.prisma:2666-2675`) و`AccountDeletionRequest` (`:2737-2745`).
- `Company.permissionTemplate` بلا `onDelete` صريح ⇒ في القاعدة `ON DELETE RESTRICT` (`init/migration.sql:124`) — فحذفُ قالبٍ عامّ **لا** يجرّ منشآت.

### 2.2 المساراتُ التي تبلغ ذلك المسلك — جردٌ كامل

| المسار | الحال | الموضع |
|---|---|---|
| `DELETE /companies/:id` (مدير المنصّة) | **محذوف** — لا `@Delete` في المتحكّم، والتعليق يقول «المسارُ الوحيد طلبُ الحذف وموافقتُه» | `companies/companies.controller.ts:12-16` · والاختبار يؤكّد `404`: `test/deletion-requests.e2e-spec.ts:383` |
| موافقةُ طلب الحذف `POST /admin/deletion-requests/:id/approve` (دور `COMPLIANCE` + يدٌ ثانية) | **لا يحذف أبداً — يُغلق**: `status: 'CLOSED'` و`retainUntil` | `deletion-requests/deletion-requests.controller.ts:101-122` · `deletion-requests.service.ts:239-333` (الإغلاق `:320`، والإقرار الثنائي `:255`) |
| **الكنسُ اليوميّ** `PersonalDataErasureService.sweep()` — `@Cron(EVERY_DAY_AT_4AM)` | **المسارُ الإنتاجيّ الوحيد الذي يحذف صلباً**: كلُّ منشأةٍ `CLOSED` و`retainUntil < now` ⇒ `companiesService.remove(id)` | `deletion-requests/personal-data-erasure.service.ts:153-189` (الاستعلام `:173`، الحذف `:180`) · والمستدعي الوحيد لـ`remove` في `src` (بحث `companiesService\.remove` ⇒ هذا السطر وحده) |
| حذفُ حساب موظّف `DELETE /company-users/:id` | يحذف هويّةَ **الموظّف** لا المالك؛ ومشغِّلاتُ `ق-٦٦٦` تمنع هويّةً تكون مالكةً وعضواً معاً | `company-users/company-users.service.ts:227-236` · `migrations/20260912150000_identity_company/migration.sql:127-162` |
| كنسُ السلّة | لا يشمل المنشآت — تسعةُ كيانات لا `companies` فيها | `trash/trash.service.ts:21-31` |
| السكربتات والبذرة | لا حذفَ لمنشأة | بحث `company\.delete\|companies\|loginIdentity\.delete\|DELETE FROM\|TRUNCATE\|deleteMany` على `apps/api/scripts` ⇒ لا حذفَ لمنشأة (والضابطُ: أعاد `deleteMany` في `benchmark-*.ts:109-140` — فالبحثُ يرى) · و`\.delete\(\|deleteMany\|DELETE FROM` على `prisma/seed.ts` ⇒ صفر (الضابطُ: `\.update\(\|upsert` على الملفّ نفسِه = ٨) |
| الهجرات | لا `DELETE FROM companies`؛ الوحيدُ `DELETE FROM login_identities` داخل مشغِّل حذف `company_users` | بحث `DELETE FROM "?(companies\|login_identities)\|TRUNCATE` على `apps/api/**/*.sql` ⇒ `identity_company/migration.sql:155` وحده |
| (مستثنى بالمهمّة) مساعدات الاختبار | `hardDeleteCompanyForTest` · `removeIsolatedCompany` · حيّاتٌ `live.spec` | `test/hard-delete-company.ts:8-16` · `test/isolated-company.ts:41-47` |

> ⚠️ **ملاحظةُ أداة**: بحثٌ على المجلّد `apps\api\prisma` بنمط `ALTER TABLE "?(invoices|companies)"? (ENABLE|FORCE)` أعاد صفراً — **وهو أعمى**: الصيغةُ نفسُها على `apps\api` بـ`glob *.sql` وجدت `invoices` ست مرات. فكلُّ نفيٍ في هذا التقرير على الهجرات أُعيد على `apps\api` بـ`*.sql` مع ضابطٍ موجب.

### 2.3 متى يقع الحذفُ الصلب إذن؟ — `retainUntil` المحسوبُ لحظةَ الموافقة

`approveAndExecute` لطلب `DELETION` (`deletion-requests.service.ts:292-323`):
1. `:292` — `movement.describe(company.id)` (تحت سياق المنشأة — `company-movement.service.ts:127-136`).
2. `:297` — `retainUntil = hasMovement ? retentionDeadline(closedAt, report.models) : closedAt + ARCHIVE_WINDOW_DAYS` — والنافذةُ `90` يوماً (`export/company-archive.service.ts:40` ← `common/tenant/reopen-window.ts:9`).
3. `:303` — `archive.produce(...)` (لقطةٌ كاملة + رفعٌ إلى المخزن — ثوانٍ).
4. `:308-323` — معاملةُ الإغلاق: `CLOSED` · `closedAt` · `retainUntil`. **لا إعادةَ قياسٍ للحركة داخلها.**

`retentionDeadline` (`company-movement.service.ts:103-108`): `11` سنة إن كان في `models` نموذجٌ من `REAL_ESTATE_MODELS`، وإلا `10` (`RETENTION_YEARS` `:88`) — **من `closedAt` لا من تاريخ المستند**.

ومعيارُ الحركة `movementSources()` (`:79-85`) = ① المشتقّ من `Restrict` (`Task`·`TaskLog`·`DelegationLog`) + ② `NUMBERED_DOCUMENTS` (`:51-67`: فواتير · قيود · سندات · مشتريات · استلامات · إيداعات · تسويات · أرصدة افتتاحية · إعدام · عروض · عقود) + ③ `LEDGER_LINES` (`:70-76`: حركات مخزون · بنكية · ورديات · دفعات إيجار · حجوزات).

**والكنسُ يثق بـ`retainUntil` المخزَّن ولا يعيد القياس** (`personal-data-erasure.service.ts:173-186`) — بخلاف السلّة التي **تعيد حساب الحفظ لحظةَ المحو** (`trash/trash.service.ts:156-159` في المحو اليدويّ، و`:215-219` في الكنس).

### 2.4 ثلاثُ فجواتٍ مقروءة

**(أ) سباقُ الموافقة.** بين القياس (`:292`) وختم الإغلاق (`:320`) تمرّ لقطةُ النسخة ورفعُها (`:303`)، والمنشأةُ **`ACTIVE`** طوالها: الحارسُ يقرأ الحالةَ لكلّ طلب ويمنع `CLOSED` وحدَه (`common/tenant/tenant.guard.ts:112-117` · `:133-139`)، **ولا شيءَ يجمّد الكتابة حين يكون طلبُ حذفٍ معلَّقاً** (بحث `deletion|PENDING|CLOSED` على `tenant.guard.ts` ⇒ لا ذكرَ للطلب؛ الضابط: وجد `CLOSED` في `:133`). فمنشأةٌ **بلا حركة لحظةَ القياس** يصدر فيها موظّفٌ فاتورةً أثناء اللقطة ⇒ `retainUntil = closedAt + 90d` والفاتورةُ قائمة ⇒ الكنسُ بعد 90 يوماً يحذف المنشأةَ وفاتورتَها **وقيدَها** — والفاتورةُ ليست في النسخة أيضاً إن صدرت بعد انتهاء اللقطة. ويُضاف وجهٌ ثانٍ: طلبٌ عبر الحارس قبل الختم ويكتب بعده.

**(ب) سجلّاتُ العقار بمعيار المشروع نفسِه (`ق-١٢٧١/أ`) خارجَ معيار الإغلاق.** `REAL_ESTATE_MODELS` تضمّ `Property`·`Unit`·`MaintenanceRequest`·`Warranty` (`company-movement.service.ts:95-97`)، **والتعليقُ نفسُه يقول إنها أُضيفت «لأجل السلّة»** (`:89-94`) — **لكنها ليست في `movementSources()`**، فلا تظهر في `report.models` أبداً. النتيجة:
- منشأةٌ إدارةُ أملاك **بلا عقود ولا فواتير** (عقاراتٌ ووحداتٌ وبلاغاتُ صيانةٍ بلا كلفة وضمانات) ⇒ «بلا حركة» ⇒ `retainUntil = +90d` ⇒ الكنسُ يحذفها **ويُسلسِل البلاغات والضمانات** (`MaintenanceRequest.property … Cascade` `schema.prisma:3695` · `Warranty.property … Cascade` `:3771`).
- وإن أُكملت صيانةٌ بكلفة ⇒ قيدٌ يحمل بُعدَ العقار (`maintenance/maintenance.service.ts:169-179` · `JournalLine.propertyId/unitId` `schema.prisma:3213-3219`) ⇒ `models = ['JournalEntry']` ⇒ **10** سنوات لا **11**.
- **بينما السلّةُ تحفظ الصفوفَ نفسَها 11 سنة** «ولو لم يُشر إليهما عقد» (`trash/trash-retention.util.ts:17-19` · `:108-116`)، ومُثبَتٌ حيّاً في `test/trash-retention.e2e-spec.ts:106-113`. **وحارسُ الوحدة يُثبت الدالّةَ لا المسار**: `company-movement.spec.ts:106` يؤكّد `retentionDeadline(…, ['MaintenanceRequest'])` = 11 — والمسارُ لا يمرّر `MaintenanceRequest` إليها قطّ (عائلة `§8.5`: «مكتوبة» ليست «تعمل»).

**(ج) ساعةُ الحفظ من `closedAt`.** للفواتير (6 من نهاية الفترة): `closedAt + 10` يغطّيها دائماً. للعقار (11): إن كان مبدأُ المدّة نهايةَ الفترة الضريبية أو السنة، فـ`closedAt + 11` قد يسبق `نهاية فترة آخر مستند + 11` بأشهر. **غيرُ محسوم** (انظر §7). ومعه تعارضُ `11`/`15` المعلَن «يُحسم قبل أول حذفٍ نهائيّ» (`docs/licensing-and-operations.md:31`) — **والكنسُ يحذف عند 11 آلياً بلا تلك البوّابة** (أقربُه 2037 — ليس عاجلاً).

### 2.5 ما يمنع الحذفَ فعلاً في القاعدة

- `Restrict` على `Task`/`TaskLog`/`DelegationLog` ⇒ الحذفُ يسقط والكنسُ يسجّله `blocked` (`personal-data-erasure.service.ts:183-186`) — **حمايةٌ عَرَضية** لمنشأةٍ صادف أن لها مهمّة، لا حارسُ حفظ.
- `marketing_consents` ملحقٌ فقط **لكنه يسمح بالتسلسل** حين يغيب العميلُ أو المنشأة (`migrations/20260923180000_marketing_consent_erasure/migration.sql:36-47`) — فلا يمنع.
- الحذفُ الصلبُ لمنشأةٍ فيها فواتيرُ وعملاءُ وقيودٌ **ينجح** بالتسلسل: `removeIsolatedCompany` يرمي إن بقيت المنشأة (`test/isolated-company.ts:44-46`) ويُستعمل بعد إصدار فواتير في `test/document-line-order.e2e-spec.ts:53` — **مشروطاً بخضرة تلك الحزمة في السير** (لم أشغّلها).

---

## (3) الحكمُ المبدئيّ بالقراءة

| الوجه | الحكم | لماذا |
|---|---|---|
| **العامّ**: مسارٌ يحذف منشأةً فيها فواتير/قيود/عقود **قبل انقضاء مدّتها** بالطريق العاديّ | **ساقطة** | لا `DELETE` مباشر (`companies.controller.ts:12-16`)؛ الموافقةُ تُغلق (`deletion-requests.service.ts:320`)؛ والحذفُ الوحيد بالكنس عند `retainUntil ≥ closedAt + 10y` لكلِّ منشأةٍ فيها مستندٌ مرقَّم (`company-movement.service.ts:103-108`) — وهو ≥ 6 سنوات الفوترة |
| **(أ) سباقُ الموافقة** | **قائمةٌ بالقراءة — غيرُ مُثبتةٍ حيّاً** | القياسُ خارج معاملة الختم، ولا تجميدَ أثناء الطلب المعلَّق، والكنسُ لا يعيد القياس (2.4-أ). يلزم إثباتٌ بتداخلٍ مفروض (§4-ب) |
| **(ب) سجلّاتُ العقار بلا عقود** | **قائمةٌ بالقراءة كتناقضٍ داخليّ** بين مسارَين في المستودع (السلّة 11 سنة ⇄ الإغلاق 90 يوماً/10 سنوات)؛ **وهل هي مخالفةٌ نظامية — غيرُ محسومة** | يتوقّف على أنّ بلاغَ صيانةٍ بلا كلفةٍ ولا فاتورة «سجلٌّ مرتبطٌ بالعقار» نظاماً؛ المشروعُ قرّر ذلك للسلّة (`ق-١٢٧١/أ`) ولم يطبّقه على الإغلاق |
| **(ج) ساعةُ الحفظ** | **غيرُ محسومة بالقراءة** | مبدأُ مدّة الـ11 (وتعارضُ الـ15) نصٌّ لم يُقرأ هنا |

**وجوابُ السؤال الحرفيّ «هل يُمنع الحذفُ حين تحمل مستنداتٍ تحت الحفظ؟»**: **لا يوجد فحصٌ لحظةَ الحذف** — `remove()` لا ينظر (`companies.service.ts:220-232`) والكنسُ يثق بتاريخٍ حُسب قبل أشهر أو سنين (`personal-data-erasure.service.ts:173`). **الحمايةُ كلُّها معلّقةٌ على صحّة `retainUntil` لحظةَ الموافقة**.

---

## (4) كيف تُقاس حيّاً — `apps/api/test/company-deletion-retention.e2e-spec.ts` (مقترح)

**البيئة**: قاعدةٌ نظيفةٌ معزولة (لا `mad_app` المشتركة) — لأن `sweep()` يعبر **كلَّ** المنشآت المغلقة، كما في الحالة القائمة `deletion-requests.e2e-spec.ts:564-634`. **الفاعل**: مالكُ المنشأة (`POST /deletion-request`) ومديرُ المنصّة المبذور (`OWNER` يمرّ `COMPLIANCE`) مع اليد الثانية `grantPlatformDecision(app, 'ACCOUNT_ERASURE', id, adminToken)` (`test/platform-decision.ts:40-48`). والقالب/الإقلاع كما في `deletion-requests.e2e-spec.ts:64-83`. المنشأةُ بـ`POST /companies` (كـ`makeCompany` `:53-62`) أو `registerIsolatedCompany` (`test/isolated-company.ts:24-38`).

**مساعدٌ مشترك — «أزِح الإغلاقَ في الماضي بالفرق نفسِه»** (لا يُكتب `retainUntil` بقيمةٍ مختارة؛ يُحفظ الفرقُ المحسوب):
```ts
const shiftClosure = async (id: string, days: number) => {
  const c = await prisma.company.findUniqueOrThrow({ where: { id }, select: { closedAt: true, retainUntil: true } });
  const d = days * 24 * 3600 * 1000;
  await prisma.company.update({ where: { id }, data: { closedAt: new Date(c.closedAt!.getTime() - d), retainUntil: new Date(c.retainUntil!.getTime() - d) } });
};
```

### (أ) سجلّاتُ العقار بلا عقود — الحالةُ التي تسقط على الشيفرة الحالية
1. مالكٌ: `POST /properties` `{ name, ownership: 'owned' }` → `201` (الشكل من `test/company-region.e2e-spec.ts:131`)؛ `POST /maintenance` `{ propertyId, title, reportedAt: '2026-03-01' }` → `201` (الشكل من `test/trash-retention.e2e-spec.ts:75`).
2. **حارسٌ على المجسّ**: `CompanyMovementService.describe(id)` ⇒ `hasMovement === false` **وتحت السياق** `tx.maintenanceRequest.count() === 1` (فالصفرُ في الحركة حقيقةٌ لا عمى — `ق-٢٦٢`).
3. `POST /deletion-request` → `201`؛ الإقرارُ الثنائيّ؛ `POST /admin/deletion-requests/:id/approve` → `201`، `outcome === 'CLOSED'`، `movement` = `[]`.
4. **التوكيدُ الحاكم (يسقط اليوم)**:
   ```ts
   expect(company.retainUntil!.getUTCFullYear()).toBeGreaterThanOrEqual(company.closedAt!.getUTCFullYear() + RETENTION_YEARS.realEstate);
   ```
   على الشيفرة الحالية: `retainUntil − closedAt = 90d` (كما يثبته `deletion-requests.e2e-spec.ts:177` لمنشأةٍ فارغة) ⇒ **يسقط**.
5. **الأثر** (يُكتب بعد التوكيد الحاكم ليقرأه من يشكّ): `shiftClosure(id, 91)` ثم `sweep()` ⇒ اليوم: `result.deleted` يحوي المنشأة، و`prisma.company.findUnique` = `null`، وقراءةُ البلاغ تحت سياقها = `null`. والمطلوب بعد الإصلاح: `result.deleted` **لا** يحويها والبلاغُ قائم.
6. **وجهٌ ثانٍ في الحالة نفسِها**: بلاغٌ مُكمَل بكلفة (`POST /maintenance/:id/start` ثم `/complete` بـ`cost`) ⇒ اليوم `retainUntil` = `closedAt + 10` لا `11`.

### (ب) سباقُ الموافقة — بتداخلٍ **مفروض** لا منتظَر (`§8.8` الوجه الثالث)
1. منشأةٌ فيها عميلٌ **فقط** (العميلُ ليس حركة) — `describe` ⇒ `hasMovement === false`.
2. `POST /deletion-request`؛ الإقرارُ الثنائيّ.
3. **الطُّعم**: يُلفّ `produce` على الكائن المفرد (كما لُفّ `putObject` في `deletion-requests.e2e-spec.ts:197-207`):
   ```ts
   const archive = app.get(CompanyArchiveService);
   const original = archive.produce.bind(archive);
   archive.produce = async (...a) => {
     const m = await original(...a);                       // اللقطةُ انتهت — فالفاتورةُ خارجَها
     await auth(request(app.getHttpServer()).post('/invoices'))
       .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بيعٌ أثناء الموافقة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
       .expect(201);                                        // المنشأةُ ما زالت ACTIVE
     return m;
   };
   ```
   (شكلُ السطر بلا صنف من `test/document-line-order.e2e-spec.ts:27-31,53`.) ويُعاد `produce` في `finally`.
4. `approve` → `201`، `outcome === 'CLOSED'`، `movement` = `[]`.
5. **حارسٌ على وقوع الكسر** (`§8.8`): تحت سياق المنشأة `tx.invoice.count() === 1` — وإلا فالحالةُ لم تقع ولا تُقرأ.
6. **التوكيدُ الحاكم (يسقط اليوم)**: `retainUntil ≥ closedAt + 10 سنوات` — أو، إن اختير الإصلاحُ بإعادة القياس عند الكنس: بعد `shiftClosure(id, 91)` و`sweep()` ⇒ `result.deleted` لا يحويها و`tx.invoice.count() === 1`. **على الشيفرة الحالية**: `retainUntil − closedAt = 90d`، والكنسُ يحذف المنشأةَ وفاتورتَها وقيدَها ⇒ **يسقط**.
7. وتوكيدٌ جانبيّ يوثّق الحدّ: ملفُّ السنة في النسخة **لا** يحوي الفاتورة (تُنزَّل كما في `deletion-requests.e2e-spec.ts:435-442`).

### (ج) الحالةُ الضابطة — ما يجب أن يبقى صحيحاً اليوم وبعد الإصلاح
منشأةٌ فيها فاتورةٌ قبل الطلب ⇒ `outcome: 'CLOSED'`، `retainUntil.year = closedAt.year + 10`؛ `shiftClosure(id, 91)` + `sweep()` ⇒ **لا تُحذف** (`retainUntil` ما زال بعد 10 سنوات إلا 91 يوماً). تُثبت أن الوجهَ العامّ ساقطٌ فعلاً لا بالقراءة وحدها.

---

## (5) الإصلاح — إن ثبتت (أ) أو (ب)

### 5.1 التصميم
1. **إعادةُ القياس لحظةَ الحذف** — نظيرُ ما تفعله السلّة (`trash.service.ts:156-159` · `:215-219`): في `sweep()` قبل `companiesService.remove(id)` (`personal-data-erasure.service.ts:179-181`) يُحسب `deadline = retentionDeadline(closedAt, describeForRetention(id).models)`؛ **إن كان `deadline > now` لا يُحذف**: يُحدَّث `retainUntil = deadline`، ويُضاف إلى قائمةٍ جديدة `retained` بسببٍ مكتوب، ويُعلَن بـ`logger.warn`. **هذا وحده يسدّ (أ) بوجهيه** (المكتوبُ قبل الختم وبعده) ويسدّ كلَّ `retainUntil` قديمٍ حُسب بمعيارٍ أضيق.
2. **مصدرُ حفظٍ منفصل عن معيار الحركة**: `retentionSources()` في `company-movement.service.ts` = `movementSources()` ∪ `REAL_ESTATE_MODELS` (`Property`·`Unit`·`MaintenanceRequest`·`Warranty`) ∪ عدُّ `JournalLine` ذات `propertyId`/`unitId` غير الفارغ (يُعدّ عقاراً). ويُستعمل في `approveAndExecute` (`deletion-requests.service.ts:297`) وفي إعادة القياس (1). ⛔ **ولا يُمسّ `movementSources()` نفسُه**: `yearlyModels()` مشتقٌّ منه (`export/company-archive.service.ts:73-80`) — إضافةُ `Property` إليه تقلب تقسيمَ ملفّات النسخة (كلُّ ما يشير إلى العقار يصير سنوياً).
3. **(اختياريّ) إعادةُ القياس داخل معاملة الختم** (`:308-323`) — ليصدق `movement` في الردّ وعلى الطلب؛ **ولا يُقفل صفُّ المنشأة `FOR UPDATE`** لأجله: القفلُ يعارض `KEY SHARE` الذي يأخذه كلُّ إدراجٍ يشير إلى المنشأة — وهو ما أوقف عدّادَ المستندات حتى مهلته في `٢٥` (`schema.prisma:331-334`). فالضمانُ الحقيقيّ (1) لا (3).

### 5.2 ما ينكسر
- `test/deletion-requests.e2e-spec.ts:628` — `expect(result.blocked).toContain(kept.id)`: المنشأةُ ذاتُ المهمّة لها حركةٌ (`Task` مشتقٌّ من `Restrict`) فيصير أجلُها `closedAt(−100d) + 10y > now` ⇒ تذهب إلى `retained` لا `blocked`. يُعدَّل التوكيد (والحالةُ تبقى تُثبت أن ما ترفضه القاعدة لا يُلتفّ عليه — بجعل `retainUntil` المُعاد حسابُه ماضياً: `closedAt` قبل 11 سنة).
- نوعُ ردّ `sweep()` يتغيّر (`{ erased, deleted, blocked }` + `retained`) — كلُّ مستدعٍ (الحالةُ `:602` وحدها في المستودع).
- `retainUntil` في ردّ الموافقة وفي رسالة المغلق (`tenant.guard.ts:137`) يتغيّر لمنشآت العقار بلا عقود (90 يوماً ⇒ 11 سنة) — **نصُّ الواجهة** `ClosedAccountView.tsx:54-64` يقرؤه كما هو.
- `deletion-requests.e2e-spec.ts:163-186` (منشأةٌ فارغة ⇒ 90 يوماً) **لا ينكسر**، و`:399-432` (عرضُ سعر ⇒ 10) **لا ينكسر**.

### 5.3 كسرٌ محتمل للإثبات بالعكس — بصياغةٍ يكتبها مطوّرٌ فعلاً (`§8.8` الوجه الثاني)
- **«توحيد»** `retentionSources()` مع `movementSources()` في `approveAndExecute` (إعادةُ السطر `:297` إلى ما كان) ⇒ يسقط (أ) الخطوة 4.
- **«تبسيطُ» الكنس** إلى الثقة بـ`retainUntil` (حذفُ إعادة القياس بحجّة أنه محسوبٌ عند الإغلاق) ⇒ يسقط (ب) الخطوة 6.
- **مقارنةٌ مقلوبة** `deadline < now` بدل `deadline > now` في شرط الإبقاء ⇒ تسقط (ج) الضابطة.
- ويُشغَّل (ب) أكثر من مرّة: الطُّعمُ يفرض الترتيب، لكن الكسرَ يُقرأ بعد التحقّق من وقوعه (الخطوة 5).

---

## (6) أرقامٌ تُقاس على قاعدة التطوير قبل التغيير

⚠️ `companies` **بلا RLS** (بحث `"(companies|invoices)" (ENABLE|FORCE) ROW LEVEL` على `apps/api/**/*.sql` ⇒ `invoices` ست مرات و`companies` صفر؛ ويوافقه تعليقُ `deletion-requests.service.ts:116` و`personal-data-erasure.service.ts:112`). **أمّا جداولُ المستندات فتحت `FORCE`** — فالعدُّ بـ`app_user` بلا سياقٍ **صفرٌ بلا خطأ** (`ق-٢٦٢`). إمّا دورُ الـsuperuser (`mad_app` في التطوير — CLAUDE.md §6.1، يتجاوز RLS)، أو حلقةٌ بسياق كلِّ منشأة (6.4). **كلُّها قراءة.**

### 6.1 توزيعُ الحالات والأجل (بلا RLS)
```sql
SELECT status,
       count(*)                                                              AS n,
       count(*) FILTER (WHERE "retainUntil" - "closedAt" <= interval '91 days') AS short_window,
       count(*) FILTER (WHERE "retainUntil" < now() + interval '90 days')    AS due_within_90d,
       min("retainUntil") AS first_due, max("retainUntil") AS last_due
FROM companies GROUP BY status ORDER BY status;
```

### 6.2 المغلقةُ بنافذةٍ قصيرة **وفيها الآن** مستنداتٌ أو سجلّاتُ عقار (superuser)
```sql
SELECT c.id, c."orgName", c."closedAt", c."retainUntil",
  (SELECT count(*) FROM invoices i            WHERE i."companyId" = c.id) AS invoices,
  (SELECT count(*) FROM journal_entries j     WHERE j."companyId" = c.id) AS journal_entries,
  (SELECT count(*) FROM contracts k           WHERE k."companyId" = c.id) AS contracts,
  (SELECT count(*) FROM properties p          WHERE p."companyId" = c.id) AS properties,
  (SELECT count(*) FROM units u               WHERE u."companyId" = c.id) AS units,
  (SELECT count(*) FROM maintenance_requests m WHERE m."companyId" = c.id) AS maintenance,
  (SELECT count(*) FROM warranties w          WHERE w."companyId" = c.id) AS warranties,
  (SELECT count(*) FROM journal_lines l       WHERE l."companyId" = c.id AND (l."propertyId" IS NOT NULL OR l."unitId" IS NOT NULL)) AS re_dim_lines
FROM companies c
WHERE c.status = 'CLOSED'
ORDER BY c."retainUntil";
```
**يُقرأ منه**: كم مغلقةً بنافذة 90 يوماً تحمل شيئاً ممّا سبق (= حالاتُ (أ) أو (ب) أو معيارٌ قديم) · وكم مغلقةً بأجل 10 سنوات تحمل `properties`/`maintenance`/`re_dim_lines` بلا `contracts` (= (ب) بوجه الـ10).

### 6.3 منشآتُ «عقارٍ بلا عقود» — أيّاً كانت حالتُها (superuser)
```sql
SELECT count(*) AS property_only_companies
FROM companies c
WHERE EXISTS (SELECT 1 FROM properties p WHERE p."companyId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM contracts k      WHERE k."companyId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM rent_payments r  WHERE r."companyId" = c.id)
  AND NOT EXISTS (SELECT 1 FROM reservations s   WHERE s."companyId" = c.id);
```
ومعه — كم منها **بلا أيّ حركةٍ إطلاقاً** (أي ستُغلق بـ90 يوماً):
```sql
SELECT count(*) FROM companies c
WHERE (EXISTS (SELECT 1 FROM properties p WHERE p."companyId"=c.id)
    OR EXISTS (SELECT 1 FROM maintenance_requests m WHERE m."companyId"=c.id)
    OR EXISTS (SELECT 1 FROM warranties w WHERE w."companyId"=c.id))
  AND NOT EXISTS (SELECT 1 FROM invoices WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM journal_entries WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM payments WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM supplier_payments WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM purchases WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM goods_receipts WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM cash_deposits WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM network_settlements WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM stock_openings WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_write_offs WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM quotes WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM contracts WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM stock_movements WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM bank_transactions WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM pos_shifts WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM rent_payments WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM reservations WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM tasks WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM task_logs WHERE "companyId"=c.id)
  AND NOT EXISTS (SELECT 1 FROM delegation_logs WHERE "companyId"=c.id);
```
(الجداولُ = أسماءُ `@@map` لنماذج `movementSources()` — `company-movement.service.ts:51-76` مع `schema.prisma` `@@map`.)

### 6.4 البديلُ بدور التطبيق — بسياق كلِّ منشأة، **مع مصادقة المسبار**
```sql
BEGIN;
CREATE TEMP TABLE probe (company_id text, ctx text, invoices bigint, maintenance bigint, properties bigint) ON COMMIT DROP;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT id FROM companies WHERE status = 'CLOSED' OR "loginIdentityId" IN
           (SELECT id FROM login_identities WHERE username = 'demo-company-a') LOOP
    PERFORM set_config('app.company_id', c.id, true);
    INSERT INTO probe SELECT c.id, current_setting('app.company_id', true),
      (SELECT count(*) FROM invoices), (SELECT count(*) FROM maintenance_requests), (SELECT count(*) FROM properties);
  END LOOP;
END $$;
SELECT * FROM probe;
-- المسبار: (١) صفُّ demo-company-a يجب أن يُظهر invoices > 0 (حالةٌ يجب أن تُصاب)
--          (٢) ctx يساوي company_id في كلِّ صفّ (الآليةُ نفسُها مقروءة لا مفترضة)
SELECT set_config('app.company_id', '', true);
SELECT count(*) AS must_be_zero_without_context FROM invoices;   -- (٣) بلا سياق يجب أن يكون 0 — وإلا فالدورُ يتجاوز RLS والقراءةُ ليست ما نظنّ
ROLLBACK;
```

### 6.5 عرضُ سباق (أ) على البيانات القائمة — تقريبيّ
```sql
SELECT r.id, r."companyId", r."decidedAt", c."retainUntil" - c."closedAt" AS window,
  (SELECT count(*) FROM invoices i WHERE i."companyId" = r."companyId" AND i."createdAt" >= r."createdAt") AS invoices_after_request
FROM account_deletion_requests r JOIN companies c ON c.id = r."companyId"
WHERE r.kind = 'DELETION' AND r.outcome = 'CLOSED' AND r.movement = '{}';
```
(superuser — `invoices` تحت `FORCE`؛ و`account_deletion_requests` `ENABLE` بلا `FORCE` بحسب `test/deletion-requests.e2e-spec.ts:94`.) أيُّ صفٍّ بـ`window = 90 days` و`invoices_after_request > 0` هو (أ) واقعاً.

---

## (7) ما لا أعرفه

1. **لم يُشغَّل شيء**: كلُّ «قائمة» أعلاه قراءةٌ لا قياس. خصوصاً (أ): أُثبت بالقراءة أن الترتيبَ يسمح، لا أن التوقيتَ يقع في الإنتاج.
2. **مبدأُ مدّة الـ11 سنة ونصُّها**: من نهاية الفترة الضريبية؟ من نهاية السنة؟ من تاريخ التوريد؟ — وتعارضُ `11`/`15` معلَنٌ «يُحسم قبل أول حذفٍ نهائيّ» (`docs/licensing-and-operations.md:31`). فالوجه (ج) غيرُ محسوم.
3. **هل بلاغُ صيانةٍ بلا كلفة، أو ضمانٌ، أو عقارٌ بلا عقد «سجلٌّ مرتبطٌ بالعقار» نظاماً؟** المشروعُ قرّر نعم للسلّة (`ق-١٢٧١/أ` — `trash-retention.util.ts:5-19`)؛ النصُّ النظاميّ لم أقرأه. فـ(ب) تناقضٌ داخليّ مؤكَّد بالقراءة، ومخالفةٌ نظامية غيرُ مؤكَّدة.
4. **حفظُ سجلّات العمل** (`Employee`·`AttendanceRecord`·`LeaveRequest`): خارجَ معيار الحركة، فمنشأةٌ بموظّفين فقط تُحذف بعد 90 يوماً — **ومدّتُها «لم تُبحث: فراغ»** بنصّ الشيفرة (`personal-data-erasure.service.ts:55`). لا أحكم.
5. **«من يحفظ بعد زوال المنشأة»** — فراغٌ نظاميٌّ معلَن (`ق-٥٣٩` — `docs/licensing-and-operations.md:32`)؛ **وذلك السطرُ نفسُه متخلّفٌ عن الشيفرة**: يقول «حذفٌ صلبٌ يمحو ما يلزم حفظُه ستَّ سنوات — وهو ما يفعله المبنيُّ اليوم»، والمبنيُّ منذ `ق-٥٤٢`/`ق-٥٤٨` يُغلق ولا يحذف قبل 10 سنوات.
6. **نجاحُ الحذف الصلب لمنشأةٍ فيها قيودٌ بأبعاد عقار أو بلاغُ صيانةٍ بكلفة**: `JournalLine.property … Restrict` (`schema.prisma:3214`) و`MaintenanceRequest.journalEntry … Restrict` (`:3731`) مع تسلسلَين من `companies` — ترتيبُ تنفيذ مشغِّلات RI غيرُ مضمون؛ قد يسقط الحذفُ فيذهب إلى `blocked` (حمايةٌ عَرَضية). الدليلُ غيرُ المباشر على نجاحه مع الفواتير والعملاء (`isolated-company.ts:44-46` + `document-line-order.e2e-spec.ts:53`) **لا يشمل هذين**. يُقاس في §4-أ/الوجه الثاني.
7. **أرقامُ قاعدة التطوير**: لم تُقرأ؛ استعلاماتُ §6 جاهزة ولم تُشغَّل.
8. **النسخُ الاحتياطية**: الحذفُ «يكتمل خلال أربعةَ عشرَ يوماً من دوران النسخ» (`company-archive.service.ts:42-43`) — ما في النسخة الخارجية (restic) بعد الحذف خارجَ هذا الفحص.

### ملاحظةٌ جانبية مقروءة (خارج الدعوى، للتسجيل)
`TenantGuard` يكتب `status` مقيَّماً من لقطةٍ قرأها في أول الطلب **بلا شرط** (`tenant.guard.ts:119-125`)، وكذلك `CompaniesService.refreshStatus` (`companies.service.ts:95-109`). منشأةٌ `ACTIVE` انتهى اشتراكُها تُقرأ، ثم تُغلَق بالموافقة، ثم يكتب الطلبُ `FROZEN` فوق `CLOSED` — فيخرج من استعلام الكنس (`status: 'CLOSED'`). اتجاهُه آمنٌ للحفظ (لا حذف) لكنه يضيّع الإغلاق. غيرُ مُثبت؛ مرشَّحٌ لفحصٍ مستقلّ.

---

## مراجعةٌ عدائية

> المُحقِّقُ الثاني — قراءةٌ فقط على `D:\worktrees\outbox-266`؛ لا تشغيلَ ولا تعديلَ لشيفرة. كلُّ موضعٍ أدناه قُرئ في هذه الجلسة.
> **الحكمُ العامّ يصمد، و(أ) و(ب) قائمتان بالقراءة — لكن تصميمَ الإصلاح (§5.1) كما كُتب يكسر مسارَ «بلا حركة» كلَّه، و§5.2 لم يذكر ذلك.**

### م١ — ما صمد بعد التحقّق المستقلّ

- **لا مسلكَ لحذف صفّ المنشأة إلا حذفُ هويّة مالكها.** قرأتُ مفاتيحَ `Company` الخارجة كلَّها (`schema.prisma:308-599`): `loginIdentity … Cascade` (`:311`) · `receiptClearingAccount … Restrict` (`:336`) · `permissionTemplate` بلا تصريح ⇒ `RESTRICT` (`:479` · `init/migration.sql:124`) · `primaryActivity … SetNull` (`:506`). فلا جدولَ آخر يُسقط المنشأةَ بحذفه. وعددُ علاقات `Company` = **٩٦** منها **٩٣** `Cascade` و**٣** `Restrict` (`:6413` · `:6465` · `:6499`) — مطابقٌ للتقرير.
- **حاذفو هويّة الدخول في شيفرة الإنتاج اثنان لا ثالثَ لهما**: `companies.service.ts:224` و`company-users.service.ts:234`. البحث: `loginIdentity\.(delete|deleteMany)|company\.(delete|deleteMany)|DELETE FROM "?(companies|login_identities)|TRUNCATE|DROP DATABASE` على **المستودع كلِّه** (`*.ts *.mjs *.js *.sh *.sql *.yml`، لا `apps/api/scripts` وحدها كما في التقرير — فيشمل `ops/` و`deploy.sh` و`docker/`). خارج الاختبارات لم يظهر إلا هذان ومشغِّلُ `identity_company/migration.sql:155` و`apps/api/scripts/test-clean.mjs:73` (`DROP DATABASE` لقاعدة الاختبار — ليس مساراً منتجاً). **الضابطُ الموجب**: البحثُ نفسُه وجد `test/hard-delete-company.ts:12` و`src/tasks/task-log.live.spec.ts:120`.
- **المستدعي الوحيد لـ`CompaniesService.remove`** هو الكنس (`personal-data-erasure.service.ts:180`): بحثُ `CompaniesService` على `src` وجد حقنَه في `personal-data-erasure.service.ts:104` و`deletion-requests.service.ts:57` والمتحكّمَين — ولا `.remove(` في `deletion-requests.service.ts`. ولا مسارَ HTTP يستدعي `sweep` (بحث `\.sweep\(` على `src` ⇒ صفر؛ الضابط: وجد تعريفَ الصنف `:98`).
- **لا شيءَ يجمّد الكتابةَ أثناء طلب حذفٍ معلَّق** — وسّعتُ بحث التقرير من `tenant.guard.ts` إلى `src` كلِّه: `accountDeletionRequest` لا يظهر إلا في `deletion-requests.service.ts` و`personal-data-erasure.service.ts`. فـ(أ) قائمةٌ بالقراءة.
- **(ب) قائمةٌ بالقراءة**: `REAL_ESTATE_MODELS` تضمّ `Property`·`Unit`·`MaintenanceRequest`·`Warranty` (`company-movement.service.ts:95-97`) ولا يدخل أيٌّ منها `movementSources()` (`:79-85`)، فلا يبلغ `retentionDeadline` من مسار الإغلاق (`deletion-requests.service.ts:292-297`).
- لا مشغِّلَ في القاعدة يمنع حذفَ فاتورةٍ مختومة: الـ١٥ مشغِّلاً في الهجرات كلُّها قُرئت (بحث `CREATE (CONSTRAINT )?TRIGGER` + سطرَي التوقيت)، ومشغِّلاتُ الحذف أربعة فقط: `delegation_logs` · `task_logs` · `marketing_consents` (كلُّها `BEFORE UPDATE OR DELETE`) و`company_users` (`AFTER DELETE`). فالحمايةُ العَرَضية الوحيدة `Restrict` على المهامّ والسجلّين — كما قال التقرير.

### م٢ — تصحيحاتٌ على المواضع

1. **دعوى المشغِّلات خاطئةُ السبب (§2.2، صفّ `DELETE /company-users/:id`).** التقرير: «مشغِّلاتُ `ق-٦٦٦` تمنع هويّةً تكون مالكةً وعضواً معاً» (`identity_company/migration.sql:127-162`). **والمقروء غيرُ ذلك**: `:127-147` مشغِّلُ ③ (منعُ تعديل `companyId` يدوياً) و`:150-162` مشغِّلُ ④ (حذفُ هويّة الحساب الفرعيّ بعده). والمشغِّلان ① و② (`:81-96` · `:104-119`) يرفضان **منشأتَين مختلفتَين** فقط (`ELSIF current_company <> NEW.id` · `<> NEW."companyId"`) — **فهويّةُ المالك وعضوٌ في المنشأة نفسِها مقبولان في القاعدة**. الحمايةُ الحقيقية في التطبيق: `create` يصنع هويّةً **جديدة** دائماً ويرفض اسماً مأخوذاً (`company-users.service.ts:84-114`)، وتعديلُ الاسم يرفض هويّةً أخرى (`:140-142`)، و`username` فريد. **النتيجةُ (ليس مساراً لحذف المنشأة) صحيحة، والسببُ المذكور خاطئ** — وحارسٌ يُبنى على السبب المذكور يحرس ما لا يمنع.
2. **«السلّةُ تحفظ الصفوفَ نفسَها 11 سنة ولو لم يُشر إليها عقد» أوسعُ من المقروء.** `retentionOf` يعطي `retainedUntil: null` لصفٍّ **لا يشير إليه شيء** (`trash-retention.util.ts:111`)؛ و«العقارُ عقارٌ بذاته» (`:108`) يرفع المدّة إلى 11 **فقط حين يوجد مرجعٌ ما** (وحدةٌ أو بلاغٌ أو ضمان). فعقارٌ عارٍ في السلّة يُمحى بعد ثلاثين يوماً هناك أيضاً. التناقضُ الداخليّ قائمٌ **لعقارٍ له بلاغٌ أو ضمانٌ أو وحدة** — وهي حالةُ اختبار §4-أ بعينها، فالاختبارُ سليم والصياغةُ في §2.4-ب تُضيَّق.
3. **نطاقُ بحث السكربتات** كان `apps/api/scripts` و`seed.ts` وحدهما؛ الحكمُ لم يتغيّر بعد التوسيع (م١) لكن النفيَ كما كُتب لم يغطِّ `ops/` ولا `deploy.sh`.

### م٣ — تصميمُ الإصلاح (§5.1) يكسر ما لم يُذكر في §5.2

1. 🔴 **الأهمّ: إعادةُ القياس بالصيغة المكتوبة تحبس كلَّ منشأةٍ بلا حركة عشرَ سنين.** §5.1(1) يحسب `deadline = retentionDeadline(closedAt, …models)` ولا يُحذف إن `deadline > now`. لكن `retentionDeadline(closedAt, [])` = **`closedAt + 10`** (`company-movement.service.ts:103-108` — الفرعُ الافتراضيّ `RETENTION_YEARS.books`؛ ومؤكَّدٌ في `company-movement.spec.ts:87`). فمنشأةٌ فارغة أُغلقت بنافذة 90 يوماً (`deletion-requests.service.ts:297`) **لن تُحذف أبداً قبل عشر سنين** — نقيضُ `ق-٥٥٦` (الحذفُ بعد نافذة النسخة). **وينكسر به** `test/deletion-requests.e2e-spec.ts:621-625` (③ `expired` — منشأةٌ بلا حركة يُنتظر أن تُحذف ونسختُها `404`)، **ولم يذكره §5.2** الذي عدّ `:628` وحده. الصيغةُ الصحيحة تحمل الفرعَ نفسَه الذي في `:297`: `hasRetainedRows ? retentionDeadline(closedAt, models) : closedAt + ARCHIVE_WINDOW_DAYS`. وكسرٌ للإثبات بالعكس بصياغةٍ محتملة: **«توحيدُ» الشرط إلى `retentionDeadline` وحده** — يلتقطه `:621` القائم.
2. 🔴 **ترتيبُ الكنس يحذف النسخةَ قبل القرار.** ملفّاتُ نسخة الإغلاق تُحذف من المخزن في `personal-data-erasure.service.ts:175-178` **قبل** محاولة `remove` في `:179-181`. والإصلاحُ يضع فحصَه «قبل `companiesService.remove(id)` (`:179-181`)» — فالمنشأةُ المُبقاة (`retained`) **تفقد نسختَها وتبقى بياناتُها**، خلافاً لـ«مدّةُ الإتاحة = مدّةُ الحفظ» (`ق-٥٥٨/ج` — `deletion-requests.service.ts:298-300`). يلزم: نقلُ حذف الملفّات بعد القرار، وتمديدُ `accountDeletionRequest.archiveExpiresAt` مع `retainUntil`، وفي حالة السباق (أ) **إعادةُ إنتاج النسخة** لأن الفاتورةَ ليست فيها. وحالةٌ في الاختبار: بعد `sweep()` على منشأةٍ مُبقاة يُنزَّل `master-data.json.gz` ويُنتظر `200` (نظيرُ `:584-586` · `:623`).
3. 🟠 **عدُّ `Property`/`Unit` عبر عميل المستأجر لا يرى ما في السلّة.** الامتدادُ يحقن `deletedAt: null` في كلِّ قراءةٍ **ومنها `count`** لنماذج `SOFT_DELETE_MODELS` (`tenant-scope.extension.ts:182` · `:184-194` · `:237-240`)، و`Property`/`Unit` منها. فـ`retentionSources()` بنمط `describe()` (`company-movement.service.ts:131` — `count({ where: { companyId } })`) **يعدّ صفراً لعقارٍ محذوفٍ ناعماً** — وهو بالضبط ما تحفظه السلّةُ 11 سنة. يلزم عدٌّ صريحٌ يتجاوز المرشِّح (`deletedAt` معطًى صراحةً، أو SQL خامٌ تحت السياق)، وحالةٌ في الاختبار: عقارٌ ببلاغٍ **محذوفٌ إلى السلّة** قبل الطلب.
4. 🟡 **المعاينةُ تكذب بعد الإصلاح.** `preview()` (`deletion-requests.service.ts:209-212`) و`listAll` (`:198-203`) يقرآن `movement.describe` — فمنشأةُ عقارٍ بلا عقود تُعرض للمدير `outcome: 'DELETE'` وهي ستُحبس 11 سنة؛ نقضٌ لـ«الحقيقةُ قبل الضغطة» (`ق-٥٤٦`). يُضاف إلى «ما ينكسر».

### م٤ — المسابير: أين قد تمرّ على شيفرةٍ مكسورة

1. **توكيدُ (ب) الحاكم عند الموافقة أعمى عن إصلاحٍ جزئيّ.** الطُّعمُ يكتب الفاتورةَ **بعد** `produce` وقبل الختم. إصلاحٌ يكتبه مطوّرٌ فعلاً — **نقلُ `describe` إلى ما بعد `produce`** (`deletion-requests.service.ts:292` ⇒ بعد `:303`) — يُخضِّر توكيدَ `retainUntil ≥ closedAt + 10` مع أن النافذةَ الثانية باقية (طلبٌ عبر الحارس قبل الختم `:308` ويكتب بعده؛ والحارسُ يقرأ الحالةَ مرّةً في أوّل الطلب `tenant.guard.ts:112-117`). **فتوكيدُ الكنس (`shiftClosure` + `sweep()` ⇒ الفاتورةُ باقية) يُلزَم لا يُخيَّر**، ويُضاف إلى §5.3 كسرُ «نقلِ `describe` بعد `produce`» ليُثبت أن التوكيدَ الملزَم يسقط عليه.
2. **لا ضابطَ في §4 يحرس مسارَ «بلا حركة» بعد الإصلاح** — (ج) الضابطة تحرس «ذات الحركة لا تُحذف» فقط، فتمرّ على خلل م٣/١. `deletion-requests.e2e-spec.ts:621` يحرسه اليوم؛ يُنصّ عليه صراحةً في §5.2 أنه **يجب أن يبقى أخضرَ بلا تعديل**.
3. **استعلاماتُ §6.2 و§6.3 و§6.5 بلا ضابطٍ داخل الاستعلام على تجاوز RLS.** إن شُغِّلت بدور `app_user` (وهو دورُ `DATABASE_URL` في `apps/api/.env.example:1`) عادت كلُّ العدّات **صفراً بلا خطأ** — و§6.3 تُعلن «صفر منشأة عقارٍ بلا عقود» عمىً. يُسبق كلٌّ منها بـ:
   ```sql
   SELECT current_user, r.rolsuper, r.rolbypassrls,
          (SELECT count(*) FROM invoices) AS must_be_positive   -- حالةٌ يجب أن تُصاب
   FROM pg_roles r WHERE r.rolname = current_user;
   ```
   ولا يُقرأ ما بعده إلا إن كان `rolsuper OR rolbypassrls` صحيحاً و`must_be_positive > 0`. (§6.4 وحدَه يحمل مصادقته.)
4. **§6.5 يُنتج إيجاباً كاذباً للمنشآت المُعاد فتحُها.** منشأةٌ أُغلقت بنافذة 90 يوماً ثم أُعيد فتحُها (`deletion-requests.service.ts:270-273` — `ACTIVE` و`closedAt: null`) وأصدرت فواتير يظهر طلبُها القديم بـ`window` فارغ و`invoices_after_request > 0`. ولأن `closedAt` هو `decision.decidedAt` المأخوذ **قبل** `describe` (`:257-263` ثم `:293`)، فالشرطُ الصحيح:
   ```sql
   WHERE r.kind = 'DELETION' AND r.outcome = 'CLOSED' AND r.movement = '{}'
     AND c.status = 'CLOSED' AND c."closedAt" = r."decidedAt"      -- الإغلاقُ نفسُه لا إغلاقٌ سابق
   -- والعدُّ: i."createdAt" > c."closedAt"  (ما قبله يعدّه describe فيجعل movement غيرَ فارغ)
   ```

### م٥ — ما لا يُعرف: إضافتان

1. **§7.6 أوسعُ ممّا كُتب — وبعضُه له دليلٌ غيرُ مباشر.** داخل رسم المستندات حوافُّ `Restrict` كثيرة غيرُ المذكورتَين: `StockMovement → Product/Warehouse/InvoiceLine/PurchaseLine/GoodsReceiptLine/JournalEntry/reversalOf` (`schema.prisma:5727` · `:5732` · `:5780` · `:5785` · `:5794` · `:5809` · `:5817`). **والدليلُ غيرُ المباشر على نجاح التسلسل رغمها**: `removeIsolatedCompany` يرمي إن بقيت المنشأة (`test/isolated-company.ts:41-46`) ويُستدعى بعد نشاطٍ مخزنيّ في `goods-receipts.e2e-spec.ts:99-101` و`opening-stock.e2e-spec.ts:109-111` و`movement-reversal.e2e-spec.ts:76` — **مشروطاً بخضرتها في السير** (لم تُشغَّل هنا). أمّا `JournalLine.property/unit … Restrict` (`:3214` · `:3219`) و`MaintenanceRequest.journalEntry … Restrict` (`:3731`) فبلا دليل: `maintenance.e2e-spec.ts` لا يزيل منشأتَه (`afterAll` في `:73` بلا `removeIsolatedCompany`). فوجهُ §4-أ/6 يبقى القياسَ الوحيد.
2. **ساعةُ الحفظ (ج) لا تخصّ العقار وحده.** قال التقرير «للفواتير `closedAt + 10` يغطّيها دائماً» — صحيحٌ لمدّة الستّ. لكن **الدفاترُ التجارية العشر** نفسُها (`RETENTION_YEARS.books` — `company-movement.service.ts:88`) إن كان مبدؤها نهايةَ السنة المالية، فقيدٌ في سنةٍ لم تنتهِ عند الإغلاق يستحقّ حتى `نهاية السنة + 10` — أي بعد `closedAt + 10` بما يصل إلى اثني عشر شهراً. غيرُ محسومٍ بالقراءة كوجه الـ11، ويُضاف إلى §7.2.

### م٦ — خلاصة
- **الحكمُ يصمد**: لا مسارَ يحذف منشأةً ذاتَ مستندٍ مرقَّم قبل `closedAt + 10`؛ والثغرتان (أ) السباقُ و(ب) سجلّاتُ العقار خارج المعيار قائمتان بالقراءة وتحتاجان القياسَ المصمَّم.
- **أهمُّ تصحيح**: إصلاحُ §5.1(1) بصيغته يحبس كلَّ منشأةٍ بلا حركة عشرَ سنين (`retentionDeadline(closedAt, [])` = `+10`) ويكسر `deletion-requests.e2e-spec.ts:621-625` — ومعه ترتيبُ حذف النسخة (`personal-data-erasure.service.ts:175-178` قبل `:180`) وعمى العدّ عن السلّة (`tenant-scope.extension.ts:237-240`).
