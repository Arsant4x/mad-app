# الدعوى «د» — موظّفٌ بلا فروع يُقرأ «كلَّ الفروع»

**قِيس على:** `D:\worktrees\outbox-266` (نسخةٌ نظيفة من `main` + تغييرُ الطابور الصادر، ولا يمسّ الموضوع) — **قراءةٌ وبحثٌ فقط**: لا تشغيلَ لاختبار ولا `prisma` ولا بناء، ولا كتابةَ إلا هذا الملف.
**التاريخ:** 2026-09-26.

---

## (1) الدعوى بنصّها

> «موظّفٌ بلا فروع يُقرأ «كلَّ الفروع». ⇒ «كلُّ الفروع» علَمٌ صريح، والقائمةُ الفارغة لا شيء. وقِس القائمَ قبل التغيير.»

وتفصيلُ المهمّة: أين يصير حسابُ موظّفٍ بلا صفوف `CompanyUserBranch` نطاقَ `'all'`؛ وتصميمُ علَمٍ صريح (مثل `CompanyUser.allBranches`) بهجرةٍ **تحفظ سلوكَ اليوم للقائمين** (تضعه `true` لمن لا إسنادَ له) **وتجعل القائمةَ الفارغة «لا فرع» للجدد**؛ وكلُّ موضعٍ يُنشئ الإسنادَ أو يعدّله أو يتحقّق منه؛ واستعلامُ عدِّ القائمين.

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### ٢-أ) موضعُ التحويل: صفرُ صفوفٍ ⟸ `'all'`

- `apps/api/src/common/tenant/tenant.guard.ts:210-215` — الحارسُ يقرأ الموظّفَ **تحت سياق المنشأة** مع `include: { permissionTemplate: true, branches: { select: { branchId: true } } }`.
- `tenant.guard.ts:222-224` — التعليقُ المعلِّل بنصّه: «No assignment means unrestricted, not "no access" — otherwise every employee account that existed before branches shipped would have been locked out».
- **`tenant.guard.ts:226`** — السطرُ الحاكم:
  ```ts
  allowedBranchIds = companyUser.branches.length > 0 ? companyUser.branches.map((b) => b.branchId) : 'all';
  ```
- ولا علَمَ على النموذج: `apps/api/prisma/schema.prisma:604-634` (`CompanyUser`) — حقولُه `name · status · canEditMasterData · permissionTemplateId` ولا شيءَ عن نطاق الفروع؛ والتعليقُ `:623` «Empty = unrestricted within the company».
- `schema.prisma:791-811` (`CompanyUserBranch`) وتعليقُه `:795-797`: «An employee with **no** rows here is treated as unrestricted within their company».
- ونوعُ السياق يوثّقه: `apps/api/src/auth/types.ts:21-24` («`'all'` for the company owner, and for an employee with no branch assignment») و`:30`.

### ٢-ب) الفاعلون الآخرون — كلُّهم `'all'` بلا جدول

| الفاعل | الموضع | الحكم |
|---|---|---|
| مالكُ المنشأة (`COMPANY`) | `tenant.guard.ts:167-169` | `'all'` قاعدةً (`CLAUDE.md 6.8`) — خارج الدعوى |
| مفتاحُ التكامل (`INTEGRATION`) | `tenant.guard.ts:180-181` (حدٌّ معلَن) · `:199` | `'all'` دائماً، ولا جدولَ إسنادٍ له: `ApiKey` في `schema.prisma:820-846` بلا أيِّ حقلِ فرع |
| وضعُ الدعم (`PLATFORM_ADMIN`) | `tenant.guard.ts:94-100` | `'all'` (قراءةٌ فقط بإذن) |

### ٢-ج) من يكتب الإسنادَ — **كاتبٌ واحد في المنتَج**

- `apps/api/src/company-users/company-users.service.ts:218-225` — `replaceBranchAssignments`: «Replace-all … **Empty = unrestricted**» (`:219`)، `deleteMany` ثم `createMany` إن لم تكن فارغة (`:221-224`).
- **الإنشاء** `:64-122`: يُتحقَّق من الفروع إن وُجدت (`:82`)، ويُنشأ الصفُّ بلا فروع (`:111`)، ثم يُسنَد إن وُجدت (`:116-120`) — **بلا `branchIds` ⟸ صفرُ صفوف ⟸ `'all'`**.
- **التعديل** `:124-188`: `branchIds !== undefined` ⟸ تحقّقٌ ثم استبدال (`:160-163`) — **`branchIds: []` يُفرغ الإسنادَ فيصير الموظّفُ `'all'`**.
- التحقّق `:209-216` — `if (branchIds.length === 0) return;` (`:210`)، ثم وجودُ الفروع في المنشأة (`:211-212`) وإذنُ المُسنِد (`:215`).
- العقدان: `dto/create-company-user.dto.ts:19-25` («empty/omitted = unrestricted») · `dto/update-company-user.dto.ts:29-35` («Sending `[]` clears the restriction (back to unrestricted …)»). والأنبوبُ `whitelist` + `forbidNonWhitelisted` (`apps/api/src/main.ts:59` · `:61`) — **حقلٌ جديد غيرُ معلَنٍ في الـDTO يُردّ `400`**.
- المتحكّم: `company-users.controller.ts:18` (`@OwnerOnly`) · `:43-55` يمرّر `tenant.allowedBranchIds` إلى الخدمة.

**بحثُ الكتّاب الآخرين:** `companyUserBranch|company_user_branches|CompanyUserBranch` على `apps/` كلِّها ⟸ الكتابةُ في `company-users.service.ts:221,223` وحدَها في المنتَج، والباقي تعليقاتٌ وحرّاسٌ ومسبارٌ حيّ (`company-users-rls.live.spec.ts:95,137`). **مصادقةُ المسبار:** البحثُ نفسُه وجد السطرين المعروفين `:221,223` وتعريفَ النموذج `schema.prisma:798` — فهو يرى.

### ٢-د) «ربطُ الموظّفين» الذي سمّته المهمّة — **غير موجود**

- `Employee` (`schema.prisma:2609-2649`) يحمل `branchId?` بـ`SetNull` (`:2614-2615`) ولا حقلَ يربطه بـ`CompanyUser` أو `LoginIdentity`.
- **البحث:** `companyUserId|companyUser\b` في `apps/api/src/employees` ⟸ **صفر**. **المسبار المصادَق:** `companyUserId` على `schema.prisma` ⟸ ثلاثةُ أسطرٍ معروفة (`:801` · `:802` · `:809`، كلُّها في `CompanyUserBranch`).
- ويؤكّده الموجزُ المقيس: `docs/موجز-نقل-الحساب-والموظف-بين-الفروع.md:65` («**ولا صلةَ بينها وبين `Employee`**»). ⟸ **لا شيءَ يتغيّر في الموظفين**.

### ٢-هـ) حذفُ الفرع — **الطريقُ الصامتُ الأوّل إلى `'all'` مُغلَقٌ اليوم**

- المفتاح `CompanyUserBranch.branch` بـ**`onDelete: Cascade`** (`schema.prisma:805`) — فحذفُ فرعٍ في القاعدة يمحو إسنادَه، **ومقصورٌ على ذلك الفرع وحدَه يصير صفراً ⟸ `'all'`**.
- وقد أُغلق في الخدمة بـ`ق-١٤٣٥`: `branch-references.ts:5-6` (يسمّي العلّةَ نفسَها) · `:20` (`CompanyUserBranch: 'content'`) · `:119-127` (القارئُ يسمّي الحساب) · والحذفُ يرفض قبل `delete`: `branches.service.ts:94-98` (الشرح) · `:111-112` (الرفض) · `:114` (الحذف).
- ومُثبَتٌ باختبار: `test/branch-delete-contents.e2e-spec.ts:82-100` (④: الحسابُ باقٍ مقصوراً على فرعه بعد رفض الحذف).
- **مساراتُ حذف الفرع الأخرى:** `branch\.delete|branch\.deleteMany|DELETE FROM "?branches` على `apps/api` ⟸ `branches.service.ts:114` واختبارٌ واحد (`test/structural-wave.e2e-spec.ts:103`). والفروعُ ليست في السلّة (`trash/trash.service.ts:21-31` — تسعةُ كياناتٍ ليس منها `Branch`).
- **⚠️ لكنّ المفتاحَ نفسَه ما زال `Cascade`** — فأيُّ حذفٍ للفرع يتجاوز الخدمة (SQL خام · سكربت · مسارٌ مستقبليّ) يعيد التوسيعَ الصامت. **الحمايةُ في الخدمة لا في القاعدة.**

### ٢-و) الطُّرقُ القائمةُ اليوم إلى «فارغ ⟸ الكلّ»

| # | الطريق | الموضع | صامتٌ؟ |
|---|---|---|---|
| ① | إنشاءُ موظّفٍ بلا `branchIds` | `company-users.service.ts:116` · والواجهةُ **لا ترسلها أصلاً** لمنشأةٍ بلا فروع: `CompanyUserModal.tsx:51` · `:96` | الواجهةُ تقول «بلا تحديد = يرى كل الفروع» (`CompanyUserModal.tsx:108`) |
| ② | المالكُ يُزيل آخرَ مربّعٍ في التعديل | `CompanyUserModal.tsx:31-33` ⟵ `:51` ⟵ `company-users.service.ts:160-163` | **معلَنٌ بتلميح** (`:108`) — لكنّه نقرةٌ واحدة من «فرعٌ واحد» إلى «كلّ الفروع» |
| ③ | قراءةٌ عمياء لـ`company_user_branches` | الحارسُ يقرأ تحت السياق اليوم (`tenant.guard.ts:210-215`)، وحارسُ القراءة `common/company-user-reads-in-context.spec.ts:6` · `:38` | **صامتٌ بتصميمه**: `FORCE` بلا سياق يعيد صفراً بنجاح (`tenant.guard.ts:204-208` يسمّيه «أسوأُ كسورِ العائق المقيسة») — **النظامُ مفتوحٌ عند الفشل** |
| ④ | حذفُ فرعٍ خارج الخدمة | `schema.prisma:805` (`Cascade`) | صامت — مغلقٌ في الخدمة وحدَها (٢-هـ) |

### ٢-ز) كيف يتصرّف المستهلكون مع قائمةٍ **فارغة** `[]` — مقروءٌ لأن الإصلاح سيُنتجها

- `branchFilter([])` ⟸ `{ OR: [{ branchId: { in: [] } }, { branchId: null }] }` (`branches/branch-scope.util.ts:20-23`) ⟸ **يرى صفوفَ المنشأة العامّة (`branchId` فارغ) ولا يرى أيَّ فرع**.
- `assertBranchAllowed([], null)` يمرّ (`branch-scope.util.ts:50` — «company-wide write») و`assertBranchAllowed([], 'x')` يُرفض `403` (`:51-53`).
- قائمةُ الفروع: `branches.service.ts:33` ⟸ `id: { in: [] }` ⟸ لا فرع.
- مستهلكون بفرعٍ خاصّ كلُّها تتعامل مع `[]` كتقييد: `reports.service.ts:396` · `:427` · `:811` · `reports/receivables-exposure.util.ts:99` · `inventory/write-off-attachments.service.ts:98` · `inventory/inventory.service.ts:231` · `:307` · `banks/network-settlements.service.ts:132` · `banks/cash-deposits.service.ts:46`.
- **لا SQL خامٌ يُدخل القائمة**: `Prisma\.join\(|ANY\(|= ANY` على `apps/api/src` ⟸ لا شيءَ يخصّ الفروع (`reports/ledger.util.ts:99` يخصّ معرّفاتِ القيود، والباقي حرّاسٌ حيّة) — فلا `Prisma.join([])` يرمي على قائمةٍ فارغة. **المصادقة:** النمطُ نفسُه وجد `ledger.util.ts:99` و`rls-coverage.live.spec.ts:110` المعروفَين.

⟸ **فـ`[]` اليوم تعني «صفوفَ المنشأة العامّة وحدَها» لا «لا شيء إطلاقاً».** وهذا فرقٌ يجب أن يُسمّى في القرار (القسم ٧).

### ٢-ح) الواجهةُ والعقدُ المشترك

- `apps/web/src/pages/companyUsers/CompanyUserModal.tsx:27` (الحالة من الإسناد) · `:49-51` (يُرسل `branchIds` فقط ما دامت للمنشأة فروع) · `:96-110` (القسمُ يختفي بلا فروع) · `:108` (التلميح «بلا تحديد = يرى كل الفروع»).
- `CompanyUsersPage.tsx:44` — `if (!u.branches?.length) return 'كل الفروع';`.
- `apps/web/src/api/companyUsers.ts:22-25` — «فارغة = يرى كل الفروع».
- العقدُ المولَّد: `packages/shared/src/api/requests.ts:1-4` («مولَّدٌ — لا يُحرَّر بيد» · `npm run openapi:snapshot` · والحارسُ `openapi:check`) · `CreateCompanyUserDto` في `:185-191` · `UpdateCompanyUserDto` يبدأ `:1210`.
- `/me/permissions` **لا يحمل نطاقَ الفروع**: `[Bb]ranch` على `apps/api/src/delegations` ⟸ `permission-tree.ts:66` وحدَه (شاشةُ `branches` في شجرة الشاشات) — فالمسبارُ يرى، ولا نطاقَ فروعٍ في الردّ.

### ٢-ط) ما يثبّت السلوكَ الحاليّ اليوم (سيتغيّر عمداً)

- `test/branches.e2e-spec.ts:220-228` — «leaves an employee with no branch assignment unrestricted».
- `test/branches.e2e-spec.ts:391-400` — «restores unrestricted visibility when the assignment is cleared» (`branchIds: []` ⟸ يرى الشمالَ والجنوب).
- `test/branches.e2e-spec.ts:525-529` و`:572-576` — «إعادةُ الضبط» بـ`branchIds: []` بعد حالةٍ مقيَّدة (تعتمد عليها الحالاتُ التالية ضمنياً).
- الموظّفُ نفسُه يُنشأ بلا `branchIds` في `:98-102`.
- التوثيق: `CLAUDE.md:340` (صفّ 2.7: «بلا تحديد = يرى الكلّ») · `branch-scope.util.ts:11` · `company-users.service.ts:219` · `schema.prisma:623`.

### ٢-ي) لا قرارَ سابقٍ بالعلَم

`allBranches` على `docs/decisions.md` ⟸ صفر. **المصادقة:** `ق-١٤٣٥ ` على الملفّ نفسِه ⟸ السطرُ `:3670` (قرارُ حذف الفرع) — فالبحثُ يقرأ الملفّ.

---

## (3) حكمٌ مبدئيٌّ بالقراءة: **قائمة**

**الآليةُ قائمةٌ بلا لبس**: `tenant.guard.ts:226` يحوّل صفرَ الصفوف إلى `'all'`، والخدمةُ والعقدُ والواجهةُ والاختبارُ يوثّقونه قصداً (٢-ج · ٢-ح · ٢-ط). **فهي ليست عطلاً عارضاً بل تصميمٌ معلَّل** — وُضع ليبقى الموظّفون السابقون للفروع عاملين (`tenant.guard.ts:222-224`).

**ولماذا تبقى الدعوى قائمةً رغم أنه مقصود:** التصميمُ **يجعل غيابَ البيانات صلاحيةً أوسع** — «مفتوحٌ عند الفشل»:
1. أيُّ طريقٍ يُفرغ الإسنادَ يوسّع الصلاحيةَ إلى الأقصى: حذفُ الفرع كان واحداً منها ووقع فعلاً (`branch-references.ts:5-6` · `ق-١٤٣٥`) ولم يُغلق إلا بالخدمة، والمفتاحُ `Cascade` باقٍ (`schema.prisma:805`).
2. قراءةٌ عمياء تحت `FORCE` تُنتج `'all'` بلا خطأ (`tenant.guard.ts:204-208` يسمّيه بنفسه).
3. «فرعٌ واحد» و«كلُّ الفروع» يفصل بينهما مربّعٌ واحد (`CompanyUserModal.tsx:108`)، **ولا يُعبَّر عن حالةِ «لا فرع — صفوفُ المنشأة العامّة وحدَها»** أصلاً.

**وما لا تحسمه القراءة:** حجمُ الأثر (كم حساباً بلا إسناد في منشأةٍ لها فروع — القسم ٦)، **وما يريده المالك لقائمةٍ فارغة**: «صفوفُ المنشأة العامّة وحدَها» (ما يفعله `branchFilter([])` اليوم) أم «لا شيءَ إطلاقاً» (القسم ٧).

---

## (4) كيف تُقاس حيّاً — اختبار `e2e` محدّد

**الملف المقترح:** `apps/api/test/branch-scope-explicit-all.e2e-spec.ts` — على منشأةٍ معزولة (`registerIsolatedCompany` من `test/isolated-company.ts`، كنمط `branches.e2e-spec.ts:9,50`) وعميلٍ يُصنع (`test/tenant-customer.ts`، كنمط `branch-delete-contents.e2e-spec.ts:8`).

### المرحلة أ — **تُسقط على الشيفرة الحالية للسبب المقصود** (وتستعمل حقولاً موجودةً في النسختين)

1. المالك: `POST /branches` ×2 ⟸ `North` · `South`.
2. المالك: `POST /quotes` بـ`branchId: South` وآخرُ بلا فرع (النمط `branches.e2e-spec.ts:149-163`).
3. المالك: `POST /templates` بشاشتَي `branches` و`quotes` (النمط `branch-delete-contents.e2e-spec.ts:89`).
4. المالك: `POST /company-users` بـ`branchIds: [North]` — **بلا حقلٍ جديد** (فيمرّ على القديم والجديد) — ثم `POST /auth/login` للموظّف.
5. توكيدٌ مرجعيّ (حالةٌ معلومةٌ يجب أن تمرّ في الاثنين): `GET /branches` بالموظّف ⟸ `[North]`.
6. **الفعلُ المقيس:** المالك `PATCH /company-users/:id` بـ`{ branchIds: [] }` ⟸ `200`.
7. **التوكيدُ الذي يسقط اليوم:**
   ```ts
   const seen = (await get('/branches', employeeToken)).body.map((b) => b.id);
   expect(seen).toEqual([]);                  // اليوم: [North, South] ⟸ يسقط هنا بالسبب المقصود
   const quotes = (await get('/quotes', employeeToken)).body.map((q) => q.branchId);
   expect(quotes).not.toContain(SouthId);     // اليوم: يراه
   expect(quotes).toContain(null);            // صفوفُ المنشأة العامّة تبقى (branch-scope.util.ts:20-23)
   ```
   **ورسالةُ السقوط على الحالية:** `expected [] … received [North, South]` — أي «القائمةُ الفارغة وسّعت إلى الكلّ»، لا سقوطَ تهيئة (`CLAUDE §8.12`/«أحمر يُقرأ سببه»).
8. وكتابةٌ على فرعٍ بالموظّف نفسِه: `POST /quotes` بـ`branchId: North` ⟸ **`403`** بعد الإصلاح (`assertBranchAllowed([], North)` — `branch-scope.util.ts:51-53`)؛ **واليوم `201`**.

### المرحلة ب — العلَمُ الجديد (تُردّ `400` على الحالية لأن الحقلَ غيرُ معلَن — `main.ts:61`؛ فهي إثباتُ البناء لا إثباتُ الدعوى)

9. `PATCH { allBranches: true }` ⟸ `GET /branches` يحوي الاثنين، والجنوبُ يُرى في العروض.
10. `PATCH { allBranches: true, branchIds: [North] }` ⟸ **`400` مسمّى** (تعارضٌ صريح).
11. `PATCH { allBranches: false }` (بلا `branchIds`) ⟸ `GET /branches` = `[]` — **القائمةُ الفارغة لا شيء**.
12. `POST /company-users` بلا `allBranches` ولا `branchIds` ⟸ حسب قرار المالك (القسم ٥-أ): إمّا `400` (إلزاميّ) أو `[]` (افتراضُه `false`) — **ويُوكَّد أيُّهما اعتُمد**.

### المرحلة ج — حارسٌ حيٌّ للهجرة (`*.live.spec.ts`، يعمل في `db-integration`)

13. داخل معاملةٍ تُرجَع، بسياق منشأةٍ معزولة: موظّفان `allBranches = false` — أحدُهما بإسناد والآخرُ بلا — ثم تُشغَّل **كتلةُ `DO` نفسُها مقروءةً من `migration.sql`** (نمطُ «يُعيد كتلةَ الهجرة على حالةٍ معلومة في معاملةٍ تُرجَع» — `CLAUDE.md` صفّ `٢٥` الاستلام المستقلّ) ⟸ المُسنَدُ يبقى `false` والآخرُ يصير `true`.
14. **ومصادقةُ آلية الرؤية** قبل الحكم (ذاكرة «Prove mechanism not effect»): بعد `set_config` يُقرأ `current_setting('app.company_id')`، وعدُّ `company_user_branches` بلا سياقٍ `0` وبالسياق موجب.

---

## (5) الإصلاح — بالمواضع، وما ينكسر، والكسرُ المحتمل للإثبات بالعكس

**رأسُ البناء (`CLAUDE §3.5`/`§3.8`):** الفاعلُ **مالكُ المنشأة** · شاشتُه نافذةُ حساب الموظّف (`CompanyUserModal.tsx`) — **صحيحةٌ اليوم** · النموذجُ أحاديُّ المستأجر بلا فروع فلا حجّة منه · **أمسّ افتراضاً سعودياً؟ لا**.

### ٥-أ) المخطَّطُ والهجرة

- `schema.prisma:604-634` — يُضاف إلى `CompanyUser`:
  ```prisma
  /// «كلُّ الفروع» علَمٌ صريح — والقائمةُ الفارغة مع false = لا فرع (صفوفُ المنشأة العامّة وحدَها).
  allBranches Boolean @default(false)
  ```
  ويُصحَّح التعليقان `:623` و`:795-797`.
  **بديلٌ للحكم:** `branchScope` تعدادٌ (`ALL` | `ASSIGNED`) أوضحُ من منطقيّ إن احتُمل ثالثٌ لاحقاً (مثلاً «فروعُ نشاطٍ بعينه»)؛ والمنطقيُّ يطابق نمطَ `canEditMasterData` (`:615`).
- **هجرةٌ** `apps/api/prisma/migrations/<بعد 20260925040000>_company_user_all_branches/migration.sql` (آخرُ هجرةٍ قائمة `20260925040000_bank_transfer`):
  ```sql
  ALTER TABLE "company_users" ADD COLUMN "allBranches" BOOLEAN NOT NULL DEFAULT false;

  DO $$
  DECLARE
    c RECORD; k INTEGER;
    companies_n INTEGER := 0; flagged INTEGER := 0; restricted INTEGER := 0; rows_seen INTEGER := 0;
  BEGIN
    FOR c IN SELECT id FROM companies LOOP            -- companies بلا سياسة (tenant.guard.ts:110)
      companies_n := companies_n + 1;
      PERFORM set_config('app.company_id', c.id, true);   -- company_users وأبناؤه تحت FORCE

      UPDATE "company_users" cu SET "allBranches" = true
       WHERE cu."companyId" = c.id
         AND NOT EXISTS (SELECT 1 FROM "company_user_branches" b WHERE b."companyUserId" = cu.id);
      GET DIAGNOSTICS k = ROW_COUNT; flagged := flagged + k;

      SELECT count(*) INTO k FROM "company_users" cu
       WHERE cu."companyId" = c.id
         AND EXISTS (SELECT 1 FROM "company_user_branches" b WHERE b."companyUserId" = cu.id);
      restricted := restricted + k;

      SELECT count(*) INTO k FROM "company_user_branches" b
        JOIN "company_users" cu ON cu.id = b."companyUserId" WHERE cu."companyId" = c.id;
      rows_seen := rows_seen + k;
    END LOOP;

    RAISE WARNING 'allBranches: % منشأة — حساباتٌ بلا إسنادٍ صارت «كلَّ الفروع» صراحةً: % · مقيَّدةٌ بإسناد: % · صفوفُ إسنادٍ مرئيّة: %',
      companies_n, flagged, restricted, rows_seen;
  END $$;
  ```
  - **`RAISE WARNING` لا `NOTICE`** — `common/migrations-announce.spec.ts:5` · `:13-17`؛ والنمطُ منقولٌ من `20260924200000_manual_movement_reason/migration.sql:11-36`.
  - **العدُّ داخل سياق كلِّ منشأة** — بلا `set_config` يمسّ `UPDATE` صفراً صامتاً **فيفقد كلُّ القائمين `'all'`** (مغلقٌ عند الفشل، لكنه انحدارٌ على كلِّ موظّف). و`WITH CHECK` على `company_users` يطلب السياقَ نفسَه (`20260913130000_company_users_rls/migration.sql:24`).
  - **لا `app.platform_admin` هنا**: يُظهر `company_users` (`:22`) **ولا يُظهر `company_user_branches`** (سياستُه `:29-39` بلا مسنَد الإدارة) — فيرى كلَّ موظّفٍ «بلا إسناد» ويضعه `true` **ولو كان مقيَّداً**: توسيعٌ صامتٌ لكلِّ مقيَّد، أي الدعوى بعينها في الهجرة.
  - **على قاعدةٍ فارغة** (السير: الهجراتُ قبل البذرة) الحلقةُ لا تدور وتُعلن أصفاراً ولا ترمي (ذاكرة «Migration proven on empty DB»).
  - **ترتيبُ النشر:** الشيفرةُ القديمة لا تقرأ العمود، فنافذةُ ما بين الهجرة والإقلاع لا أثرَ لها. ⚠️ **لكنّ التراجعَ عن الشيفرة بعد النشر يوسّع**: موظّفٌ جديد `allBranches=false` بلا إسناد يقرؤه القديمُ `'all'` (`tenant.guard.ts:226`) — يُعلَن في رأس الطلب.

### ٥-ب) الحارس — `tenant.guard.ts:222-226`

```ts
// «كلُّ الفروع» علَمٌ يُقرأ — لا غيابٌ يُستنتج. والقائمةُ الفارغة لا فرع.
allowedBranchIds = companyUser.allBranches ? 'all' : companyUser.branches.map((b) => b.branchId);
```
- `include` في `:213` يُرجع الأعمدةَ القياسيّة، فـ`allBranches` حاضرٌ بلا تعديل. يُحذف تعليقُ `:222-224` ويُعاد كتابةُ `:204-208` (قراءةٌ عمياء صارت **تضييقاً لا توسيعاً**).
- ⟸ **يصير مغلقاً عند الفشل**: قراءةٌ عمياء لـ`company_user_branches` تُعطي `[]`.
- `auth/types.ts:21-24` — يُصحَّح التوثيق.
- **مفتاحُ التكامل** (`:199`) ووضعُ الدعم (`:99`) **خارج النطاق** ويبقيان `'all'` معلَنَين.

### ٥-ج) الخدمةُ والعقد — `company-users.service.ts` والـDTO

- `create-company-user.dto.ts:19-25` و`update-company-user.dto.ts:29-35`: يُضاف
  ```ts
  @IsOptional() @IsBoolean() allBranches?: boolean;   // أو إلزاميّ في الإنشاء — قرارُ المالك
  ```
  ويُعاد كتابةُ تعليقَي `branchIds` («الفارغةُ لا فرع؛ الكلُّ بـ`allBranches`»).
  **خياران للإنشاء:** (أ) **إلزاميّ** — لا افتراضَ صامت (نمطُ `ق-٨٩١` في `CLAUDE.md` صفّ ①: «حقلان مهيكلان إلزاميان … بلا افتراضٍ صامت»)، وثمنُه القسم ٥-هـ؛ (ب) **اختياريٌّ افتراضُه `false`** — يطابق نصَّ الدعوى «القائمةُ الفارغة لا شيء للجدد».
- `create` (`:64-122`): يُكتب `allBranches` في `companyUser.create` (`:111`)، ويُرفض `allBranches === true` مع `branchIds` غيرِ فارغة (`400` برسالةٍ جديدة في `common/i18n/messages.ts`).
- `update` (`:124-188`): الحالةُ الناتجة `const all = dto.allBranches ?? existing.allBranches` — إن كانت `true` و`branchIds` غيرُ فارغة ⟸ `400`؛ وإن صارت `true` ⟸ `deleteMany` للإسناد (فلا حالتان متعارضتان مخزَّنتان)؛ ويُضاف `allBranches: dto.allBranches` إلى `data` في `:184`.
- `assertBranchIdsAssignable` (`:209-216`): **ومنحُ `allBranches: true` يتطلّب أن يكون المُسنِدُ `'all'`** — سلامةٌ ذاتية كما في `:197-208` (`ق-٥١٤`)، واليومَ المالكُ وحده.
- `replaceBranchAssignments` (`:218-225`): يُحذف «Empty = unrestricted» (`:219`).
- `branch-scope.util.ts:8-15` — يُصحَّح «an unassigned employee sees everything» (`:11`).
- **حذفُ الفرع** (`branch-references.ts:20` · `:119-127` · `branches.service.ts:111-112`): **يبقى كما هو** — والآن يصير رفضُه حمايةً من **تضييقٍ** غير مقصود (حسابٌ بفرعٍ واحد يُحذف فرعُه ⟸ `[]`) لا من توسيع. واختياريّاً: `schema.prisma:805` من `Cascade` إلى `Restrict` لتصير الحمايةُ في القاعدة (قرارٌ مستقلّ — يمسّ حذفَ الشركة؟ لا: حذفُ الشركة يُسلسِل على `company_users` أوّلاً عبر `:609`، **ويُقاس قبل الحكم**).

### ٥-د) الواجهةُ والعقدُ المولَّد

- `CompanyUserModal.tsx`: خيارٌ صريح «كلُّ الفروع (ويشمل ما يُضاف لاحقاً)» منفصلٌ عن المربّعات؛ `:51` يُرسل `allBranches` **دائماً** (ولو بلا فروع — وإلّا بقي الجديدُ على الافتراض)؛ `:108` يُعاد كتابةُ التلميح («بلا تحديد ولا "كل الفروع" = صفوفُ المنشأة العامّة وحدَها»).
- `CompanyUsersPage.tsx:44` يقرأ `u.allBranches` لا طولَ القائمة؛ و`api/companyUsers.ts:14-26` يُضاف `allBranches: boolean` ويُصحَّح `:24`.
- `packages/shared/src/api/requests.ts` يُعاد توليدُه بـ`npm run openapi:snapshot` (`:1-4`) — وإلّا سقط `openapi:check`.

### ٥-هـ) ما ينكسر — مقروءاً

| ما ينكسر | الموضع | لماذا |
|---|---|---|
| ثلاثُ حالاتٍ تثبّت القديم | `branches.e2e-spec.ts:220-228` · `:391-400` · (والإعادةُ `:525-529` · `:572-576`) | تُعاد كتابتُها: الإنشاءُ في `:98-102` بـ`allBranches: true`، والإعادةُ بـ`{ allBranches: true }` |
| **٢٥ ملفَّ e2e** تُنشئ موظّفاً بلا `branchIds` | `activities-currencies` · `audit-log` · `bank-transfer` · `company-profile` · `company-slug` · `company-user-deactivation` · `credit-limit` · `delegations` · `deletion-requests` · `export` · `integrations` · `inventory-write-offs` · `master-data-lock` · `owner-templates` · `permission-actions` · `platform-admin` · `pos-payment-attempts` · `pos` · `sector-screens` · `subprocessor-consent` · `support-access` · `tasks` · `tenant-guard-default-closed` · `throttle-enforced` · `zatca-phase2` (كلُّها `apps/api/test/*.e2e-spec.ts`)؛ و`src/common/pagination/list-routes.ts` يذكر المسار | الخيار (أ) ⟸ **كلُّها `400`**. الخيار (ب) ⟸ تنكسر حيث يكتب الموظّفُ على فرعٍ أو يقرأ صفَّ فرع؛ **ستّةٌ منها تُنشئ فروعاً** (`tenant-guard-default-closed` ×2 · `bank-transfer` ×2 · `pos` · `inventory-write-offs` · `credit-limit` · `activities-currencies` — عدُّ `'/branches'` في كلٍّ)، والباقي على منشآتٍ **قد** تحمل فروعاً (منشآتُ العرض) — **لا يُحسم بالقراءة** |
| بذرةُ العرض المنشورة | `apps/api/scripts/seed-demo-realestate.mjs:332-337` | تُنشئ «سارة العتيبي» بلا فروع — في (أ) `400`، وفي (ب) لا ترى فروعاً. تُرسل `allBranches: true` |
| البذرةُ الأساسيّة | `prisma/seed.ts` | **لا تُنشئ موظّفين** — `companyUser\|CompanyUser\|company-users` ⟸ صفر؛ **والمسبار يرى**: `loginIdentity` على الملفّ نفسِه ⟸ ٦ |
| التوثيق | `CLAUDE.md:340` · `branch-scope.util.ts:11` · `company-users.service.ts:219` · `schema.prisma:623` · `:795-797` · `auth/types.ts:21-24` · `CompanyUserModal.tsx:108` · `api/companyUsers.ts:24` | «فارغ = الكلّ» في ثمانية مواضع |

### ٥-و) الكسورُ المحتملة للإثبات بالعكس — بصياغةٍ يكتبها مطوّرٌ فعلاً (`CLAUDE §8.8` الوجه الثاني)

| # | الكسر | ما يُسقطه |
|---|---|---|
| ١ | «توافقٌ خلفيّ» في الحارس: `companyUser.allBranches \|\| companyUser.branches.length === 0 ? 'all' : …` | المرحلة أ-٧ (الفارغةُ تعود `'all'`) |
| ٢ | الخدمةُ تحمل المعنى القديم إلى العلَم: `allBranches: dto.branchIds?.length === 0` في `update` | المرحلة أ-٧ و ب-١١ |
| ٣ | الهجرةُ بلا `set_config` في الحلقة (صياغةٌ طبيعية لـ`UPDATE … WHERE NOT EXISTS`) | المرحلة ج-١٣: الموظّفُ بلا إسناد يبقى `false` |
| ٤ | الهجرةُ بـ`app.platform_admin = 'true'` بدل سياق المنشأة | المرحلة ج-١٣: `UPDATE` يرمي على `WITH CHECK` — **أو** إن كُتب `SELECT` للعدّ وحده: يرى المقيَّدَ «بلا إسناد» |
| ٥ | الهجرةُ بلا `NOT EXISTS` (تعميمٌ «آمن» على الكلّ) | المرحلة ج-١٣: المُسنَدُ يصير `true` |

⚠️ **ويُتحقَّق من وقوع الكسر قبل قراءة النتيجة** (`CLAUDE §8.8`)، وتُعاد الحالةُ ببوّابة `git diff --quiet` لكلِّ هدف (`§8.8` الوجه الخامس).

---

## (6) أرقامٌ تُقاس على قاعدة التطوير **قبل** التغيير

⚠️ **الجداولُ الثلاثة تحت `FORCE`** (`company_users` · `company_user_branches` بالهجرة `20260913130000_company_users_rls/migration.sql:16-39`، و`branches` كذلك). **فالعدُّ بدور التطبيق بلا سياق يعود صفراً بنجاح** — وأخطرُ فخّ: **`app.platform_admin = 'true'` وحدَه يُظهر الموظّفين (`:22`) ويُخفي إسنادَهم (`:29-39`)** فيُقرأ كلُّ موظّفٍ «بلا إسناد»، **وهو الرقمُ الذي تدّعيه الدعوى في أسوأ صوره — عمىً لا واقع**. فالعدُّ بطريقين ويُطابَقان.

### الطريق ① — دورٌ يتجاوز العزل (`mad_app` الخارق في التطوير، `CLAUDE §6.1`)

```sql
-- ٠) تحقّقُ الدور — إن لم يكن أحدُهما true فكلُّ ما بعده أعمى
SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;

-- ١) العدُّ الحاكم
WITH u AS (
  SELECT cu.id, cu."companyId", cu.status,
         (SELECT count(*) FROM company_user_branches b WHERE b."companyUserId" = cu.id)  AS n_assign,
         (SELECT count(*) FROM branches br WHERE br."companyId" = cu."companyId")        AS n_company_branches
    FROM company_users cu
)
SELECT count(*)                                                              AS company_users,
       count(*) FILTER (WHERE n_assign = 0)                                  AS zero_assign_read_as_all,
       count(*) FILTER (WHERE n_assign > 0)                                  AS restricted,
       count(*) FILTER (WHERE n_assign = 0 AND n_company_branches > 0)       AS zero_assign_where_branches_exist,
       count(*) FILTER (WHERE n_assign = 0 AND n_company_branches > 0 AND status = 'ACTIVE') AS zero_assign_active_where_branches_exist,
       count(DISTINCT "companyId")                                           AS companies_with_users,
       count(DISTINCT "companyId") FILTER (WHERE n_company_branches > 0)     AS companies_with_users_and_branches,
       coalesce(sum(n_assign), 0)                                            AS assignment_rows_via_users
  FROM u;

-- ٢) مصادقةُ المسبار — يجب أن يساوي assignment_rows_via_users (ولا يتيمَ: المفتاحُ Cascade)
SELECT count(*) AS assignment_rows_total FROM company_user_branches;

-- ٣) توزيعٌ على المنشآت التي يقع فيها الفرقُ فعلاً (لها فروع)
SELECT cu."companyId",
       count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM company_user_branches b WHERE b."companyUserId" = cu.id)) AS zero_assign,
       count(*) AS users,
       (SELECT count(*) FROM branches br WHERE br."companyId" = cu."companyId") AS branches
  FROM company_users cu
 GROUP BY cu."companyId"
HAVING (SELECT count(*) FROM branches br WHERE br."companyId" = cu."companyId") > 0
 ORDER BY zero_assign DESC
 LIMIT 20;
```

### الطريق ② — دورُ التطبيق (`app_user`) داخل سياق كلِّ منشأة — يُطابَق بالأوّل

```sql
BEGIN;
DO $$
DECLARE
  c RECORD; k INTEGER; n INTEGER := 0;
  t_users INTEGER := 0; t_zero INTEGER := 0; t_zero_br INTEGER := 0; t_rows INTEGER := 0;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    n := n + 1;
    PERFORM set_config('app.company_id', c.id, true);
    SELECT count(*) INTO k FROM company_users WHERE "companyId" = c.id;                       t_users := t_users + k;
    SELECT count(*) INTO k FROM company_users cu WHERE cu."companyId" = c.id
       AND NOT EXISTS (SELECT 1 FROM company_user_branches b WHERE b."companyUserId" = cu.id);  t_zero := t_zero + k;
    SELECT count(*) INTO k FROM company_users cu WHERE cu."companyId" = c.id
       AND NOT EXISTS (SELECT 1 FROM company_user_branches b WHERE b."companyUserId" = cu.id)
       AND EXISTS (SELECT 1 FROM branches br WHERE br."companyId" = c.id);                     t_zero_br := t_zero_br + k;
    SELECT count(*) INTO k FROM company_user_branches b
      JOIN company_users cu ON cu.id = b."companyUserId" WHERE cu."companyId" = c.id;          t_rows := t_rows + k;
  END LOOP;
  RAISE WARNING 'companies=% users=% zero_assign=% zero_assign_where_branches_exist=% assignment_rows=%',
    n, t_users, t_zero, t_zero_br, t_rows;
END $$;
ROLLBACK;
```

**قاعدةُ القبول:** `users` و`zero_assign` و`assignment_rows` **متطابقةٌ في الطريقين**. فإن كان `assignment_rows = 0` في ② وموجباً في ① ⟸ السياقُ لم يقم والمسبارُ أعمى (ذاكرة «Validate the probe»). **ورقمُ القرار** هو `zero_assign_where_branches_exist` — هؤلاء وحدَهم يتغيّر ما يرونه لو صار الفارغُ «لا فرع» بلا هجرة؛ ومن في منشأةٍ بلا فروع يرى الشيءَ نفسَه في الحالين **حتى يُنشأ أوّلُ فرع**.
**والرقمُ نفسُه يُطابَق بعد الهجرة** بـ`flagged` في `RAISE WARNING` (٥-أ): `flagged = zero_assign` · `restricted` = عددُ المقيَّدين · `rows_seen = assignment_rows_total`.

⚠️ **والمنشورُ** (`test-app.rikzapp.com`) يحتاج القياسَ نفسَه قبل النشر — **بإذن المالك** لأنه خادمٌ حيّ؛ وقراءةُ `WARNING` هناك من سجلّ حاوية postgres لا من Prisma (ذاكرة «Deploy from session 227»).

---

## (7) ما لا أعرفه

1. **الأرقام** — لم يُشغَّل شيء؛ القسم ٦ هو ما يُشغَّل.
2. **معنى القائمة الفارغة عند المالك:** «صفوفُ المنشأة العامّة وحدَها» (ما يفعله `branchFilter([])` اليوم — `branch-scope.util.ts:20-23`، و`assertBranchAllowed` يسمح بكتابة صفوفٍ بلا فرع `:50`) — **أم «لا شيءَ إطلاقاً»**؟ الثاني يحتاج تغييرَ `branchFilter` نفسِه ويُخفي كلَّ ما سبق الفروع — **قرارٌ منفصلٌ أكبر**، ولم أصمّمه.
3. **افتراضُ الإنشاء:** إلزاميٌّ (أ) أم `false` (ب)؟ وفي منشأةٍ **بلا فروع** اليوم: أيُنشأ الموظّفُ `true` (فيرى الفرعَ الأوّلَ حين يُنشأ) أم `false` (فيحتاج إسناداً بعده)؟ — قرارُ منتَجٍ لا قراءة.
4. **مفتاحُ التكامل ووضعُ الدعم** يبقيان `'all'` (`tenant.guard.ts:99` · `:199`) — لم أصمّم لهما علَماً؛ وحدُّ المفتاح معلَنٌ في `:180-181`.
5. **أثرُ الخيار (ب) على ١٩ ملفَّ e2e لا تُنشئ فروعاً** — يعتمد على ما تحمله منشأتُها من فروع (منشآتُ العرض على قاعدة التطوير)؛ لا يُحسم إلا بالتشغيل.
6. **أيَلُفّ Prisma الهجرةَ في معاملة؟** لم أتحقّق من سلوك `migrate deploy` هنا؛ كتلةُ `DO` ذرّيةٌ بذاتها، و`ALTER` قبلها — والأثرُ غيرُ مؤذٍ لأن القديمَ لا يقرأ العمود (٥-أ).
7. **تحويلُ `schema.prisma:805` إلى `Restrict`** — لم أقس أثرَه على مسار حذف الشركة وسكربتات التنظيف.
8. **لم أقرأ كلَّ مستهلكي `allowedBranchIds` الـ٥٦ ملفّاً سطراً سطراً** — قرأتُ أنماطَ الفرع الخاصّ (`=== 'all'` · `!== 'all'` · `[` · `.length` · `.includes`) و`Prisma.join`/`ANY`؛ ومستهلكٌ يعامل `[]` خاصّاً بصياغةٍ أخرى لا يراه هذا البحث.

---

## مراجعةٌ عدائية

**المراجِع:** وكيلُ تحقّقٍ معارض · 2026-09-26 · على `D:\worktrees\outbox-266` (رأسُه `eda979a2`) — **قراءةٌ وبحثٌ فقط**، لا تشغيلَ لشيء، ولا كتابةَ إلا هذا القسم.

### الحكم: **«قائمة» يصمد** — بثلاثة تصحيحاتٍ جوهرية في التصميم لا في الحكم

- السطرُ الحاكم مطابقٌ حرفاً: `apps/api/src/common/tenant/tenant.guard.ts:226`، والقراءةُ تحت السياق `:210-215`، والتعليلُ `:222-224`.
- **ولا موضعَ آخرَ يحسب النطاقَ لموظّف.** البحث: `allowedBranchIds\s*[:=]` على `apps/api/src` بلا الاختبارات ⟸ الإسنادُ الفعليّ للنطاق في `tenant.guard.ts:99` · `:169` · `:199` · `:226` وحدَها (الباقي تواقيعُ دوالّ و`readLedger(... 'all')` داخليّ). **مصادقة:** النمطُ نفسُه وجد السطرَ المعروف `:226`. وقرّاءُ العلاقة `.branches\b|branches: true` على `api/src` + `web/src` ⟸ في الخادم `tenant.guard.ts:226` وحدَه (والتضمينان `tenant.guard.ts:213` · `company-users.service.ts:23`)، **ومصادقتُه** أنه وجد `CompanyUsersPage.tsx:44` المعروفَ في الواجهة. ولا شيءَ في `tasks` · `delegations` (سوى `permission-tree.ts`) · `notifications` · `auth` يقرأ فروعَ موظّف: `grep -il branch` عليها ⟸ `delegations/permission-tree.ts` وحدَه.
- **وسدُّ ما أعلنه التقريرُ مجهولاً (٧-٨) جزئياً:** `allowedBranchIds(\?)?\.(length|some|every|filter|map|find|join|\[)|allowedBranchIds\[|Array\.isArray\(…allowedBranchIds|!== 'all' &&|=== 'all' \|\|` على `apps/api/src` بلا الاختبارات ⟸ **موضعٌ واحد** `reports/reports.service.ts:427` وهو يحترم التقييد — فلا مستهلكَ يعامل `[]` بطولها أو أوّلِ عنصرها. **المصادقة:** النمطُ وجد `:427` المعروف.

**تحقّقُ الإحالات:** كلُّ ما فحصتُه من `file:line` مطابق — `tenant.guard.ts:94-100 · 167-169 · 180-181 · 199 · 204-208` · `schema.prisma:604-634 · 615 · 623 · 791-811 · 805 · 820-846 · 2609 · 2614-2615` · `company-users.service.ts:64-122 · 82 · 111 · 116-120 · 160-163 · 209-216 · 218-225` · الـDTO (`create:19-25` · `update:29-35`) · `main.ts:59 · 61` · `company-users.controller.ts:18 · 43-55` · `branch-scope.util.ts:11 · 20-23 · 50 · 51-53` · `branches.service.ts:33 · 94-98 · 111-112 · 114` · `branch-references.ts:5-6 · 20 · 119-127` · `trash.service.ts:21-31` · `structural-wave.e2e-spec.ts:103` · `20260913130000_company_users_rls/migration.sql:16-39 · 22 · 24` · `20260924200000_manual_movement_reason/migration.sql:11-36` · `seed-demo-realestate.mjs:332-337` · `CompanyUserModal.tsx:27 · 49-51 · 96-110 · 108` · `api/companyUsers.ts:22-25` · `requests.ts:1-4 · 185-191 · 1210` · `CLAUDE.md:340` · `decisions.md:3670` · والموجز `:65`. وعدُّ الـ٢٥ صحيح: `/company-users` في ٣٤ ملفّاً من `test/`، منها ٩ تحمل `branchIds`.

### ١) 🔴 مسبارُ الهجرة (المرحلة ج-١٣) **أعمى عن الكسر ٣، ومشروطٌ ببيئته في الكسر ٤**

التقرير ينقل نمطَ `goods-receipts.e2e-spec.ts` — **وهذا النمطُ يشغّل الكتلةَ داخل `runInTenantContext(cid, …)`** (`apps/api/test/goods-receipts.e2e-spec.ts:339` · `:343`) ثم يعيد السياقَ بعدها (`:344-346`). أي أن **`app.company_id` قائمٌ على منشأة التهيئة لحظةَ تشغيل الكتلة**.

- **الكسر ٣** (الحلقةُ بلا `set_config`): لكلِّ منشأةٍ `c` تمرّ `UPDATE … WHERE cu."companyId" = c.id` على `USING` السياسة (`20260913130000_company_users_rls/migration.sql:21`) **فقط حين `c` = منشأةُ التهيئة** — وهي بالضبط التي فيها الموظّفان. فالموظّفُ بلا إسنادٍ يصير `true`، والمُسنَدُ يبقى `false` (فروعُه مرئيّةٌ بالسياق القائم — `:30-34`)، **والمسبارُ يخضرّ على هجرةٍ تُسقط `allBranches` عن كلِّ منشأةٍ أخرى** — أي عن كلِّ موظّفٍ قائمٍ في الإنتاج (يُقفل عليه كلُّ فرع).
- **الكسر ٤** (`app.platform_admin='true'` بلا سياق منشأة): `USING` يمرّ للكلّ (`:22`)، وإسنادُ غيرِ منشأة التهيئة مخفيّ (`:33`) فيُقرأ «بلا إسناد»، و`WITH CHECK` (`:24`) يرمي **على أوّل صفٍّ من منشأةٍ أخرى** — فيُمسَك **ما دامت في القاعدة حساباتٌ لمنشآتٍ أخرى**. على قاعدةٍ لا حسابَ فيها إلا حسابُ التهيئة (بذرةُ السير لا تُنشئ موظّفين — التقرير نفسُه ٥-هـ) يمرّ صامتاً؛ فالإمساكُ يتبع ترتيبَ الملفّات (`CLAUDE §8.13` · `§8.30` «مسبارٌ يقيس على صفوفٍ قائمة يشهد لبيئته»).

**التصحيح:** قبل `$executeRawUnsafe(doBlock)` يُفرَّغ السياق (`SELECT set_config('app.company_id', '', true)`)، **وتُهيّأ منشأتان** (أ: مُسنَدٌ + بلا إسناد · ب: بلا إسناد، يُكتب تحت سياق ب)، ثم يُقرأ كلٌّ بسياقه ويُوكَّد: أ-المُسنَد `false` · أ-بلا `true` · ب-بلا `true`. وبه يسقط الكسر ٣ (الثلاثة `false` لأن الحلقة ترى صفراً بلا سياق) ويرمي الكسر ٤ دائماً (`WITH CHECK` على `''`). ⚠️ **ويُتحقَّق أن التفريغ وقع** بقراءة `current_setting('app.company_id', true)` قبل الكتلة (ذاكرة «Prove mechanism not effect»).

### ٢) 🔴 قاعدةُ التعديل المقترحة (٥-ج) **تُسقط الاختبارَ الذي يقترح التقريرُ إعادةَ كتابته بها (٥-هـ)**

القاعدة: `all = dto.allBranches ?? existing.allBranches`، و`all && branchIds غيرُ فارغة ⟸ 400`. والتقرير يقترح إنشاءَ موظّف `branches.e2e` بـ`allBranches: true` (`branches.e2e-spec.ts:98-102`) — **فكلُّ `PATCH { branchIds: [North] }` بعده يُردّ `400`**: `branches.e2e-spec.ts:138` (`restrictEmployeeToNorth` — تستدعيها حالاتٌ عدّة) · `:234` · `:267` · `:510` · `:555`؛ و`:412` يوكّد **`404`** (فرعُ منشأةٍ أخرى) فيصير `400` أو `404` بحسب ترتيب الفحصين — تغيّرٌ في الرمز المُوكَّد. وجدولُ ٥-هـ يذكر «الإنشاءَ والإعادة» وحدَهما.
**وهو نفسُه ما تفعله الواجهةُ اليوم**: `CompanyUserModal.tsx:51` ترسل `branchIds` دائماً ما دامت للمنشأة فروع — وأيُّ عميلٍ لم يُحدَّث (أو مفتاحُ تكامل يدير الحسابات لاحقاً) يُردّ `400` على تضييقٍ كان يعمل.
**يُحسم صراحةً** أحدُ اثنين: (أ) `branchIds` غيرُ فارغة **بلا** `allBranches` ⟸ `allBranches=false` ضمناً (التضييقُ لا يحتاج إذناً صريحاً؛ **والتوسيعُ وحدَه** يحتاج العلَم) — وهو الأسلم لأنه لا يوسّع أبداً ضمنياً؛ أو (ب) الإبقاءُ على `400` وإضافةُ `allBranches: false` إلى المواضع الستّة أعلاه ومثلِها في الواجهة. وكلاهما يُكتب في الموجز لا يُترك للبناء.

### ٣) 🟠 الخيارُ (أ) «إلزاميٌّ في الإنشاء» يكسر **٣٤** ملفّاً لا ٢٥ — ويُبطل ادّعاءَ المرحلة أ

- الإلزامُ يُسقط كلَّ `POST /company-users` بلا `allBranches` **سواءٌ حمل `branchIds` أم لا** — فالتسعةُ ذواتُ `branchIds` تسقط أيضاً: `branch-delete-contents.e2e-spec.ts:90-91` · `branch-scope-by-id.e2e-spec.ts:52-53` · `branch-scope-byid-hr.e2e-spec.ts:105-106` · `branch-scope-byid-ledger.e2e-spec.ts:131-132` · `branch-scope-byid-pos-inventory.e2e-spec.ts:106` · `branch-scope-byid-purchases.e2e-spec.ts:148-149` · `branch-scope-byid-sales.e2e-spec.ts:169-170` · `branch-transfer.e2e-spec.ts:154-155` · `branches.e2e-spec.ts:99-102 · 425 · 450 · 458`.
- **والمرحلة أ «تستعمل حقولاً موجودةً في النسختين» صحيحةٌ تحت (ب) وحدَه**: تحت (أ) الخطوةُ ٤ بلا `allBranches` تُردّ `400` على الجديدة (سقوطُ تهيئةٍ لا سقوطُ الدعوى)، وبه تُردّ `400` على القديمة (`main.ts:61`). فالإثباتُ بالعكس على الشيفرة الحالية يحتاج تحت (أ) نسخةً من الاختبار بلا الحقل، أو إنشاءَ الحساب بالقاعدة داخل السياق — **ويُعلَن أيُّهما في الموجز**، وإلا قُرئ `400` سقوطاً للسبب المقصود.

### ٤) 🟠 نصٌّ يراه التاجرُ يقرّر التوسيعَ — غائبٌ عن قائمة التوثيق (٥-هـ) — **ويوجّه المالكَ إليه**

`apps/api/src/common/i18n/messages.ts:1621-1624` (`branch_delete_accounts`):
> ar: «… أزل الفرعَ من فروع كلٍّ منها أولاً؛ **فحسابٌ يفقد فرعَه الوحيد يرى الفروعَ كلَّها**» · en: «… an account that loses its only branch sees every branch».

وهي الرسالةُ التي يراها المالكُ حين يُرفض حذفُ الفرع (`branch-references.ts:119-127` ⟸ `branches.service.ts:111-112`) — **فالرفضُ نفسُه يدلّه على الطريق ② (إفراغُ الإسناد)**، وهو اليوم توسيع. بعد الإصلاح تصير العبارةُ **كاذبة** (الحسابُ يصير «لا فرع») — ورسالةُ رفضٍ كاذبةٌ عملياً أسوأ من رفضٍ بلا سبب (`CLAUDE §4` «ترتيب الرفض قرارُ منتج»). **تُضاف إلى ٥-هـ** مع ستّة مواضعَ نصّيةٍ أخرى تقرّر المعنى القديم ولم تُذكر: `branch-references.ts:5-6` · `branches.service.ts:94-96` · `test/branch-delete-contents.e2e-spec.ts:18-21` و`:83-86` · `common/company-user-reads-in-context.spec.ts:15` · `test/branches.e2e-spec.ts:18`. (**البحث:** `يرى الفروعَ كلَّها|sees every branch|كل الفروع|unrestricted` على `api/src` · `api/test` · `web/src` · `packages` — ومصادقتُه أنه وجد `tenant.guard.ts:222` و`CompanyUserModal.tsx:108` المعروفَين.) ⚠️ و`messages.ts` يُقرأ بـ`grep -a` — `grep` بلا `-a` قال «Binary file matches» (ملفٌّ يحمل ثلاثةَ `NUL` بقصد — ذاكرة «messages.ts NUL separator»)؛ **فبحثٌ نصّيٌّ عادي على المستودع يُسقط هذا الموضعَ بصمت**.

### ٥) 🟡 أرجحُ انحدارٍ حقيقيّ بلا مسبار: **الواجهةُ تحمل المعنى القديم إلى العلَم**

النموذجُ الذهنيّ في `CompanyUserModal.tsx:49-51` («وإفراغها يعيد الموظف بلا قيد») و`:108` («بلا تحديد = يرى كل الفروع») يجعل أقربَ صياغةٍ يكتبها مطوّر: `allBranches: branchIds.length === 0` — **فتعود الدعوى كاملةً من طبقة الواجهة**، وكلُّ اختبارات الخادم في القسم ٤ خضراء عليها (الخادم يستلم `true` صريحاً). والكسورُ الخمسة في ٥-و كلُّها خادمية. **يُضاف** اختبارُ `vitest` على حمولة النافذة: لا مربّعَ ولا «كل الفروع» ⟸ `{ allBranches: false, branchIds: [] }`؛ واختيارُ «كل الفروع» ⟸ `{ allBranches: true }` بلا `branchIds` (وإلا اصطدم بـ`400` البند ٢)؛ ومنشأةٌ بلا فروع ⟸ `allBranches` يُرسل (`:51` يحذف `branchIds` اليوم كلياً). **ويُثبَت بالعكس بتلك الصياغة بعينها** (`CLAUDE §8.8` الوجه الثاني).

### ٦) 🟢 SQL القسم ٦ — **لا يعدّ صفراً بسبب RLS**، مع ملاحظتين

- مطابقٌ للسياسات المقروءة: `company_users` يُظهر بمسنَد الإدارة (`20260913130000…/migration.sql:22`) و`company_user_branches` لا (`:30-34`) — فتحذيرُ «`platform_admin` وحدَه يصنع الرقمَ الكاذب» صحيح. و`companies` بلا سياسة: `TABLE "companies" (ENABLE|FORCE)` على الهجرات كلِّها ⟸ صفر، **ومصادقتُه** أن النمطَ نفسَه على `branches` وجد `20260803120000_structural_wave/migration.sql:284` و`20260907040000_cash_drawer/migration.sql:125`. والطريقُ ① بدورٍ خارقٍ مع فحص `rolsuper/rolbypassrls` والطريقُ ② بسياق كلِّ منشأة ثم المطابقة — تصميمٌ سليم.
- **(أ)** رقمُ القرار على قاعدة التطوير **يحكمه ركامُ الاختبارات** (منشآتٌ معزولة تُنشأ في كلِّ تشغيل) لا منشآتٌ حقيقية؛ فهو مصادقةٌ للمسبار لا رقمٌ يُقرَّر به — **والحاكمُ رقمُ الخادم المنشور** (بإذن المالك) ومعه `mad_app_clean`. **(ب)** يُضاف إلى الطريق ② سطرُ `current_setting('app.company_id', true)` بعد `set_config` في أوّل دورة — المطابقةُ مع ① تكشف العمى، لكنّ قراءةَ الآلية تسمّيه.

### ٧) ملاحظاتٌ أصغر

- **نافذةُ ما بين الهجرة والإقلاع (٥-أ) — ادّعاءٌ صحيحٌ في الإنتاج بدليلٍ لم يُذكر:** الهجرةُ تُطبَّق عند إقلاع الحاوية الجديدة نفسِها (`apps/api/Dockerfile:78` — `prisma migrate deploy && node dist/src/main.js` · `deploy.sh:212`)، فلا شيفرةَ قديمةً تعمل على المخطَّط الجديد. **لكن على قاعدة التطوير المشتركة** (ذاكرة «Shared resource corrupts silently») كلُّ نسخة عملٍ لم تُحدَّث تُنشئ حساباتٍ `allBranches=false` افتراضاً بلا إسناد: يقرؤها القديمُ `'all'` والجديدُ `[]` — فتذبذبُ اختباراتٍ بين الجلسات مصدرُه هذا لا الإصلاح.
- **`company-users.service.ts:111` إنشاءٌ متداخل** داخل `tx.loginIdentity.create` (`:103-114`) — العلَمُ يُكتب في `companyUser: { create: { … allBranches } }` هناك؛ والردُّ بعدها من `identity.companyUser` (`:120`) يحمله لأن `include` يُعيد الأعمدةَ القياسية.
- **المُشغِّل `company_users_identity_follows`** لا يتأثّر بـ`UPDATE` الهجرة: `AFTER INSERT OR UPDATE OF "companyId", "loginIdentityId"` (`20260912150000_identity_company/migration.sql:122-124`).
- **تعليقُ `tenant.guard.ts:207-208`** («لا سياسةَ بعد») متخلّفٌ عن الواقع منذ `20260913130000` — يُصحَّح مع إعادة كتابة `:204-208` لا بعدها.
- **لا ردَّ مولَّداً لـ`CompanyUser`** في `packages/shared/src/api/responses.ts` (`companyuser` ⟸ صفر؛ **المصادقة:** الملفُّ نفسُه يحمل `BankAccountTransferResponse`)، فإعادةُ التوليد تمسّ `requests.ts` وحدَه — ونوعُ الواجهة `api/companyUsers.ts:14-26` يدويٌّ يُحدَّث بيد.

### الخلاصة

**الدعوى قائمة، والإحالاتُ صادقة، ولا مسارَ حسابٍ ثانٍ فات التقرير.** وأهمُّ تصحيح: **مسبارُ الهجرة المنقولُ عن `goods-receipts` يعمل داخل سياق منشأة التهيئة فيخضرّ على هجرةٍ بلا `set_config`** — وهي الهجرةُ التي تنزع «كلَّ الفروع» عن كلِّ موظّفٍ قائم في الإنتاج؛ يُفرَّغ السياقُ قبل الكتلة وتُهيّأ منشأتان. ثم: قاعدةُ التعديل تناقض خطّةَ إعادة كتابة `branches.e2e` (خمسُ تضييقاتٍ تُردّ `400`)، والخيارُ (أ) يكسر ٣٤ ملفّاً لا ٢٥، ورسالةُ رفض حذف الفرع (`messages.ts:1622-1623`) تقرّر التوسيعَ للتاجر وغائبةٌ عن القائمة.
