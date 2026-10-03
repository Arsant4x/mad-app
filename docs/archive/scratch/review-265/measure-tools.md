# قياسُ الأدوات — التوجيه ٢٦٥ (قياسٌ لا بناء) · 2026-09-26

**النطاق:** قراءةٌ وبحثٌ فقط على `D:\mad-app` (الفرع `feat/country-literals-guard`، الشجرةُ نظيفة) — لا تعديل، ولا تشغيلَ لحزمة، ولا تنزيلَ حزمة.
**وثائق الهيئة** قُرئت من `zatca.gov.sa` وحدَه يوم 2026-09-26: نُزّل الملفُّ بـ`WebFetch` ثم استُخرج نصُّه بـ pdf.js داخل Chromium المحلّي (طريقةُ `D:\mad-app-scratch\review-246\pdf-text.mjs` نفسُها، شُغّلت من الدخل القياسي بلا كتابة ملف). **عددُ الصفحات من `numPages` في بنية الملف** ويطابق ترويسةَ الصفحات («1 / 72» · «1 / 27»).
⚠️ **كلُّ ما قُرئ من الهيئة إنجليزيّ**؛ والقرارُ نفسُه يعلن في صفحته الأولى أن العربيَّ هو الرسميّ ويغلب. **العربيُّ لم يُقرأ** (ملفّاتُ الهيئة العربية بلا طبقة نصّ، ولم يُرسم شيءٌ منها هنا).

---

## ١) «أيفحص السيرُ بقاءَ سياسات العزل والمشغّلات بعد كلِّ هجرة؟»

**الجواب: نعم لسياسات العزل بتعميمٍ مشتقّ، ولا للمشغّلات إلا لجدولَين بالاسم.**

**أين ومتى في السير** (`.github/workflows/web-tests.yml`، وظيفة `db-integration`):

| الترتيب | الخطوة | السطور |
|---|---|---|
| ١ | `prisma migrate deploy` على قاعدةٍ فارغة تُخلق مع الوظيفة | 249–253 (الخدمة 157–169) |
| ٢ | البذرة | 258–260 |
| ٣ | عدُّ المشغّلات من `pg_trigger` — **لجدولَي `delegation_logs` و`task_logs` وحدَهما**، ويُسقط إن لم يكن العدد `4` | 268–287 (الاسمان 273، والعدد 283) |
| ٤ | كلُّ `*.live.spec.ts` (ومنها `rls-coverage.live.spec.ts`) — وقبل كلٍّ منها تحقّقٌ أن القاعدة على آخر هجرة | 300–306 · `apps/api/test/live-db-precheck.ts:25-29` |
| ٥ | `npm run test:e2e` (ومنه `test/rls-coverage.e2e-spec.ts`) | 409–415 |

**ما يُغطّى:**
- `apps/api/src/common/tenant/rls-coverage.live.spec.ts`: الجداولُ **مشتقّةٌ** من `tenantOwnedModels()` و`Prisma.dmmf` (77–85)، ويقرأ `relrowsecurity`/`relforcerowsecurity` من `pg_class` (104–110)؛ جدولٌ مشتقٌّ غائبٌ عن القاعدة يُسقط (114–115)، وأيُّ جدولٍ بلا `ENABLE`+`FORCE` خارج أربعة استثناءاتٍ مسمّاة بحجّتها يُسقط (46–71 · 117–123)، واستثناءٌ صار قوياً يُسقط أيضاً (126–145).
- `apps/api/test/rls-coverage.e2e-spec.ts`: كلُّ جدولٍ في `public` يحمل عمود `companyId` — **من الكتالوج لا من المخطّط** (84–95) — يلزمه `ENABLE`+`FORCE` (100–108)؛ **وكلُّ جدولٍ مفعَّلٍ عليه RLS يلزمه سياسةٌ واحدةٌ على الأقلّ** (111–127).
- السيرُ الخفيف (كلُّ دفع) يحمل حرّاساً نصّيين على نصّ الهجرات: `src/activities/rls-context.spec.ts:229-240` (`ENABLE` بلا `FORCE`) و`src/common/tenant/tenant-scope-coverage.spec.ts:87-127`.

**ما لا يُغطّى:**
1. **مضمونُ السياسة غيرُ مفحوص تعميماً**: الفحصُ عدٌّ فقط (`Number(p.policies) === 0` — e2e:125). سياسةٌ بـ`USING (true)` تمرّ. والقراءةُ الوحيدة لنصّ السياسة (`pg_get_expr(polqual)`) في `src/activities/rls-probe.live.spec.ts:115-146` **تطبع حكماً ولا توكّده** (التوكيدُ الوحيد عددُ الصفوف، 145) وعلى أربعة جداول مسمّاة.
2. **المشغّلات: لا جردَ عامّ.** في الهجرات **14** عبارةَ `CREATE TRIGGER` لـ**13** اسماً في **7** هجرات (`delegation_log` · `task_log` · `tasks` · `l0_cost_layers` · `identity_company` · `goods_receipts` · `marketing_consent`). الكتالوج يُقرأ لاثنين منها فقط (الخطوة ٣). والباقي:
   - مُثبَتٌ **بالسلوك** لا بالكتالوج: `marketing_consents` ملحقٌ فقط (`src/customers/marketing-consent.live.spec.ts:97-115`) · مشغّلُ اتّساق مصدر الحركة (`src/inventory/costing.live.spec.ts:246`) · `login_identities_company_matches_profile` (`src/auth/identity-company.live.spec.ts`) · وسجلّا التفويض والمهام بالسلوك أيضاً (`delegation-log.live.spec.ts:129-167` · `task-log.live.spec.ts:90-149`).
   - **لم أجد اختباراً يسمّيها** (بحثٌ بالاسم في `src` و`test` و`.github`): `tasks_touch_updated_at` · `tasks_stamp_created_at` · `company_users_identity_dies`. **والمسبارُ يرى**: البحثُ نفسُه وجد `login_identities_company_matches_profile` في `identity-company.live.spec.ts`. ⚠️ حدُّه: بحثٌ بالاسم لا يرى اختباراً سلوكياً لا يذكر الاسمَ ولا رسالتَه.
3. **`audit_logs` بلا مشغّلِ «ملحقٍ فقط»**: سياستُه `FOR ALL` ضمناً (`USING` و`WITH CHECK` — `prisma/migrations/20260807170000_audit_log/migration.sql:26-30`)، فالقاعدةُ تقبل `UPDATE`/`DELETE` داخل سياق المنشأة؛ منعُهما اليومَ **بغياب المسار** لا بالقاعدة. (الهجرةُ الثانية التي تمسّه `20260911130000_audit_log_survives_company_deletion` لا تُنشئ مشغّلاً ولا سياسة — بحثٌ بـ`policy|trigger|revoke|rule`.)
4. **«بعد كلِّ هجرة» بحدّه**: الوظيفةُ الثقيلة تعمل عند **فتح** الطلب (`opened/reopened/ready_for_review`) وعند الدفع إلى `main` (web-tests.yml:58-72)، **لا على كلِّ دفعٍ للطلب** (لا `synchronize` — 68-72)؛ هجرةٌ تُدفع بعد الفتح لا تُفحص إلا عند الدمج (والتعليق 55-57 يحيل إلى خطّاف الدمج `ق-٢٥٤`).
5. **الإنتاج بلا فحص بعد الهجرة**: الهجراتُ تُطبَّق عند إقلاع الحاوية (`apps/api/Dockerfile:78`)، و`deploy.sh:212` يطبع ذلك فقط — **لا قراءةَ `pg_class`/`pg_trigger` على القاعدة المنشورة بعد الترقية**؛ والسيرُ يفحص قاعدةً مبنيّةً من الصفر لا قاعدةً رُقّيت فوق بيانات.

---

## ٢) «سكربتاتُ Bash: تقف عند أوّل خطأ؟ وتُعاد بلا أثر؟ وبلا أسرار؟»

**الجرد: 14 سكربتاً متتبَّعاً** — بمسبارَين متطابقَين: `git grep` على سطرٍ أوّلٍ يبدأ بـ`#!`، وفحصُ رأس كلِّ ملفٍّ متتبَّع (الثاني يرى ما بلا امتداد: الخطّافات الثلاثة).

| السكربت | يقف عند أوّل خطأ | الإعادة | الأسرار |
|---|---|---|---|
| `.githooks/pre-commit` | لا `set -e`؛ مخارجُ صريحة (80 · 83). **يفتح عند العطل**: فشلُ `git diff --cached` ⇒ قائمةٌ فارغة ⇒ `exit 0` (20–21) | قراءةٌ فقط | لا سرّ. ⚠️ `for f in $staged` (26 · 48) يقسم الأسماءَ ذاتَ المسافة، فيفشل `git show` ويُتخطّى فحصُ المحتوى صامتاً (`|| continue` — 56) |
| `.githooks/pre-push` | لا `set -e`؛ يفتح بلا `origin/main` (28) | قراءةٌ فقط | لا سرّ |
| `.githooks/post-checkout` | لا `set -e`؛ فحوصٌ صريحة ويُعلن الفشل (106–110) | **بلا أثر**: خروجٌ مبكّر إن وُجد الاثنان (68–70)، وكلُّ إنشاءٍ مشروطٌ بالغياب (73 · 118) | ينسخ `.env.test.example` (قيمُ اختبار) ولا يولّد سرّاً (118–120) |
| `deploy.sh` | `set -euo pipefail` (25) + `die` | يُعاد: `pull --ff-only` (108) · `up -d --build` (138) · الحارسُ يقبل ما لم يتغيّر (176–188)؛ **لكن كلُّ تشغيلٍ يأخذ مقلباً جديداً** (132) | لا يطبع سرّاً؛ ملفُّ البيئة عبر `compose` وفحص البريد (81)، والأخيرُ يطبع `SMTP_FROM` وسجلّات DNS لا غير |
| `ops/backup/pre-deploy-dump.sh` | `set -euo pipefail` (21) | اسمٌ بالتزامٍ وختمِ زمن (41–42) و`tmp→mv` (43–59) فلا كتابةَ فوق مقلب؛ **ولا تدوير** — تتراكم في `./backups`. ولا اختبارَ يذكره (بحثٌ في `apps/api`: صفر؛ والبحثُ نفسُه وجد `policy-proof.sh` في `offsite-backup.spec.ts`) | لا يطبع سرّاً |
| `ops/deploy/recreate-guard.sh` | مكتبةٌ تُستورد فترث `deploy.sh:25` | دوالُّ نقيّة | — |
| `ops/deploy/recreate-guard.selftest.sh` | `set -uo pipefail` **بلا `-e` عمداً** (11) ليعيد خروجَ الكتلة | نقيّ (docker مزيَّف 46–63) | — |
| `ops/mail/mail-dns-check.sh` | مكتبة؛ ومسارُها المستقلّ (72–75) بمخارج صريحة (66) | قراءةُ DNS | لا سرّ |
| `docker/postgres-init-prod/01-create-app-role.sh` | `set -euo pipefail` (9) + `ON_ERROR_STOP` (10) | **غيرُ قابلٍ للإعادة** (`CREATE ROLE` بلا شرط — 11)، ويعمل مرّةً عند تهيئة قاعدةٍ فارغة (مربوطٌ على `/docker-entrypoint-initdb.d` — `docker-compose.prod.yml:20`) | كلمةُ المرور تُحقن في نصّ SQL (11) — لا تُطبع، **لكن `'` فيها يكسر العبارة** |
| `ops/backup/offsite-backup.sh` | `set -eu` (28) بلا `pipefail` (صدفة `sh`) + `fail()` صريح (59–65) | `restic cat config || restic init` (102)؛ لقطةٌ جديدة كلَّ تشغيل عمداً (104) والاحتفاظُ بـ`forget --prune` (114) | ينسخ `.env.production` داخل اللقطة المشفّرة **عمداً** (82–86)؛ ملفُّ الحال يحمل عنوانَ المستودع (54–56) |
| `ops/backup/restore-drill.sh` | `set -eu` (18) + `trap cleanup` (37–39) | اسمُ حاويةٍ وmktemp جديدان (29 · 33) | 🔴 **`cleanup` يحذف الحاوية وحدَها** (38)، فيبقى `DRILL_DIR` على القرص وفيه `env.production` والمقلب المستعادان (29 · 54). 🔴 والمفتاحُ الحقيقيّ `SECRETS_ENCRYPTION_KEY` يُمرَّر **قيمةً في سطر أمر `docker run`** (101 · 108) فيُرى في قائمة عمليات المضيف أثناء التشغيل |
| `ops/backup/check-freshness.sh` | `set -eu` (15)، مخارج 0/1/2 | قراءةٌ فقط | لا يطبع سرّاً |
| `ops/backup/check-repo-object.sh` | `set -eu` (21) | قراءةٌ فقط | ⚠️ `AWS_SECRET_ACCESS_KEY` يمرّ **وسيطاً لـ`openssl -macopt key:`** (50 · 77) فيُرى في قائمة العمليات؛ والمفتاحُ للقراءة فقط بنصّه (24) |
| `ops/backup/policy-proof.sh` | `set -eu` (20) + `trap` (51) | **يترك لقطةً رميّةً دائمة كلَّ تشغيل** لا يحذفها مفتاحُه (12–13 · 72) | يقرأ بلا `source` (27–45)، ويمرّر الأسماءَ بـ`-e` بلا قيم (48)، ويحجب ما يشبه مفتاحاً (57) — ومحروسٌ نصّياً (`offsite-backup.spec.ts:228-240`) |

**وشِيلٌ مضمَّن خارج الـ14:** مدخلُ خدمة النسخ في `docker-compose.prod.yml:166-219` (`set -eu` · `tmp→mv` · يُبقي 14 مقلباً) و`apps/api/Dockerfile:78` (`sh -c "… migrate deploy && node …"`). وفي السير قيمُ اختبارٍ مكتوبةٌ حرفاً ومسمّاةٌ بأنها ليست أسراراً (`web-tests.yml:162 · 181 · 187-201`).

**`shellcheck` في السير: لا.** البحثُ عن `shellcheck` في `.github` و`apps/api/src` و`apps/api/test` وملفّات `package.json` = **صفر**؛ والمسبارُ يرى: الكلمةُ نفسُها موجودةٌ في `deploy.sh:43` و`:47` توجيهاتٍ (`# shellcheck source=`) **لأداةٍ لا تُشغَّل**. ما يعمل بدلاً منها: حارسُ CRLF على `.githooks` (`web-tests-light.yml:134-159`) · `locale-gate.spec.ts` · تشغيلٌ فعليّ لكتلة الحارس ولفحص البريد (`deploy-recreate-guard.spec.ts:102` · `mail-dns-check.spec.ts:75-128`) · وتوكيداتٌ نصّية على سكربتات النسخ (`offsite-backup.spec.ts:45-281`).

---

## ٣) «وأنتحقّق من الفاتورة بمخطّطات الهيئة وقواعدها محلّياً قبل إرسالها؟»

**الجواب: لا للمخطّط ولا لقواعد Schematron.** نتحقّق محلّياً من **التوقيع والتجزئة والمجاميع** وعددٍ قليلٍ من قواعد `BR-KSA` مكتوبةٍ بيد.

**البحث:** لا ملفَّ `.xsd`/`.sch`/`.xsl`/`.xslt` متتبَّعاً (صفر)، والنمطُ نفسُه بإضافة `sql` يعيد **158** (الهجرات) — فالمسبارُ يرى. ولا ذكرَ لـ`schematron` ولا `xmllint`/`libxml`/`saxon` ولا لحزمة SDK في `apps/api/src` ولا `package.json`؛ و`xsd` لا يظهر إلا في **فضاءات الأسماء** (`invoice-xml.util.ts:205-208`) وتعليقٍ يقول إن ترتيب العناصر يتبع تسلسلَ XSD بالبناء (`:11`).

**ما يُفحص محلّياً قبل الإرسال** (`apps/api/src/zatca/zatca.service.ts`):
- قبل الختم: عنوانُ المشتري الكامل للقياسية (`BR-KSA-63` — 425–440) · معرّفُ المشتري البديل (`BR-KSA-81` — 441–444) · مشترٍ أجنبيٌّ برقمٍ سعوديّ (`BR-KSA-46` — 402–404) · سببُ الإعفاء لغير `S` (`BR-KSA-CL-04` — 473–477) · السطرُ القديم بصفرٍ بلا فئة (474) · **إعادةُ حساب المجاميع من البنود ورفضُ أيِّ فرق** (478–496).
- قبل الإرسال: إعادةُ تجزئة المستند المخزَّن ومقارنتُها بعمود `zatcaHash` **والتحقّقُ من توقيع ECDSA** (612–618).
- ⚠️ `verifySignedInvoice` (`ubl/xades.util.ts:341-359`) يتحقّق من التوقيع على `SignedInfo` **وحدَه**، مع أن تعليقه (337–340) يقول «يعيد حساب الملخّصَين»؛ والتعليقُ الأعلى يعترف بالحدّ (73–74). فالمقارنةُ بعمود القاعدة لا بقيمة `DigestValue` داخل المستند.
- عند التسجيل وحدَه: عيّناتٌ تُرسل **إلى الهيئة** (`/compliance/invoices` — `zatca-onboarding.service.ts:337` · `:428`) — تحقّقٌ بعيدٌ لمرّةٍ واحدة، لا محلّيٌّ لكلِّ فاتورة.

**ما تنشره الهيئة** (مقروءٌ 2026-09-26):
- صفحة تنزيل الـSDK: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx — دليلُ مستخدم ورابطُ تنزيل، وتذييلُها «آخر تحديث 28 مايو 2025». **لم تذكر محتوى الأداة، ولم أُنزّلها** (خارج إذن التوجيه). وصفحةُ الصندوق الرئيسة (`…/ComplianceEnablementToolbox/Pages/default.aspx`) عادت بلا محتوى.
- الإرشاداتُ الفنية المفصّلة الإصدار 2 (نوفمبر 2022، 81 صفحة): https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-Guideline.pdf — ص6: الـSDK أداةٌ تُنزَّل وتعمل **دون اتصال** تتحقّق من ملفّات XML للفاتورة والإشعارين وفق معايير الهيئة، ومن رمز QR، وتُدمج محلّياً أو تُشغَّل بسطر أوامر؛ ص11: بديلُها «مدقّقٌ على الويب»، **وعنوانُ القسم يجعلها «خطوةً إضافية»** لا شرطاً.
- معيارُ تنفيذ XML الإصدار 1.2 (2023-05-19، 72 صفحة): https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf — ص5: مرحلتا التحقّق **صياغيّةٌ** (سلامةُ XML **والتحقّقُ من مخطّط UBL 2.1**) ثم **مضمونيّة** (مجموعةٌ فرعية من قواعد EN 16931 ثم القواعد السعودية)؛ ص4: فصلٌ يعرض **ملفّات Schematron الفنية**؛ ص35 وما بعدها: القواعدُ `BR` و`BR-CO` و`BR-KSA`.

**الفجوة:** المرحلتان اللتان تنصّ عليهما الهيئة (مخطّطُ UBL وSchematron بقواعد EN 16931 والسعودية) **لا تُنفَّذ محلّياً**؛ نغطّي بيدٍ نحو خمس قواعد سعودية فقط. **وأثرُها ليس جودةً فقط**: المردودُ من الهيئة يُغلق ولا يُعاد توقيعُه (`zatca.service.ts:455-456` — لا `REJECTED` في الادّعاء)، فكلُّ ردٍّ كان يمكن كشفُه محلّياً **يستهلك موقعاً في السلسلة ويفرض مستنداً بديلاً**. وحدُّه معلَن: الأداةُ «خطوةٌ إضافية» بنصّ الإرشادات، فغيابُها ليس مخالفة.

---

## ٤) «كيف تُولَّد ملفّاتُ PDF، وأتدعم PDF/A-3 بملفٍّ مضمَّن؟ وأيُّ نوعيه تطلب الهيئة؟»

**في المستودع: لا يُولَّد PDF إطلاقاً.**
- لا مكتبةَ PDF في `apps/api/package.json` ولا `apps/web/package.json` ولا الجذر (بحثٌ عن `pdfkit|pdfmake|pdf-lib|jspdf|puppeteer|@react-pdf/renderer|html2pdf.js|pdfjs-dist|muhammara`: صفر).
- ظهورُ «PDF» الوحيد: قبولُ ملفٍّ مرفوعٍ بنوع `application/pdf` (`apps/api/src/files/files.service.ts:26` · `apps/web/src/api/files.ts:17`).
- إيصالُ الكاشير يُطبع بطباعة المتصفّح `window.print()` (`apps/web/src/pages/pos/PosPage.tsx:543` · `:631`) مقصوراً بـ`@media print` على `.print-receipt` (`apps/web/src/index.css:929-939`) — ورقٌ أو «حفظٌ كـPDF» من المتصفّح، **لا PDF/A-3 ولا XML مضمَّن**.
- **ولا مسارَ يسلّم المشتري XML فاتورته**: المستندُ الموقَّع لا يخرج إلا في أرشيف المنشأة الكامل (`src/export/company-archive.service.ts:210`)؛ ولا ذكرَ له في الواجهة (بحثٌ عن `signedXml|zatcaSignedXml` في `apps/web/src`: صفر، والبحثُ نفسُه وجد `qrPayload` في `api/invoices.ts`)؛ و`mail.send` له مستدعٍ واحد هو الاستعادة (`auth.service.ts:395`).

**ما تقوله الهيئة** (مقروءٌ 2026-09-26):
- **قرارُ التنفيذ** (ترجمةٌ غير رسمية، 35 صفحة): https://zatca.gov.sa/en/E-Invoicing/Introduction/LawsAndRegulations/Documents/20230519_E-Invoicing%20Implementation%20Resolution%20English.pdf — ص2–3: تُولَّد الفاتورة وإشعاراتُها **بصيغة XML أو PDF/A-3 (بـXML مضمَّن)** ويلزم مشاركتُها مع العميل؛ ص11 (الملحق 1): XML **إلزاميٌّ للتوليد والإرسال**، وPDF/A-3 نصُّه: «**PDF/A-3 with embedded XML file (optional human readable format …)**».
- **الإرشاداتُ المفصّلة الإصدار 2** (مايو 2023، 66 صفحة): https://zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-Invoicing_Detailed__Guideline.pdf — ص15: القياسيةُ تُرسل للإجازة **XML لا PDF/A-3**، وتُشارَك مع المشتري **XML أو PDF/A-3**؛ ص18: المبسّطةُ تُبلَّغ XML خلال 24 ساعة، ونسخةٌ مطبوعة للعميل أو أيُّ صيغةٍ مقروءة باتّفاق الطرفين؛ ص61: للقياسية يكفي XML إن قبله المشتري وقدر على معالجته؛ ص63: **إن أُرسلت PDF فـPDF/A-3 بـXML مضمَّن إلزاميّ**.
- **الإرشاداتُ الفنية** (نوفمبر 2022): ص47 — الإرسالُ إلى الهيئة بـXML لا بـPDF A/3.
- **معيارُ خصائص الأمان الإصدار 1.2** (27 صفحة): https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/20230519_ZATCA_Electronic_Invoice_Security_Features_Implementation_Standards_vF.pdf — ص12: ختمُ PDF/A-3 **بـPAdES** (ETSI EN 319 142-1) بمستوى **B-B**، والـXML يُرفق وفق **ISO 19005-3**؛ ص23: بنيةُ ختم PAdES.

**«أيُّ نوعيه تطلب الهيئة؟»** — بقراءتَين:
- **XML أم PDF/A-3؟** الإرسالُ إلى الهيئة **XML وحدَه**؛ والمشاركةُ مع المشتري **أيُّهما**؛ وPDF/A-3 **اختياريّ** — لكنه يصير **الشكلَ الإلزاميَّ لأيِّ PDF يُرسل**.
- **درجةُ المطابقة (3a/3b/3u)؟** **لا تحدّدها** الوثائقُ الخمس المقروءة: نمطٌ يطابق `PDF/A-3a|3b|3u` و`PAdES` و`ISO 19005` أعاد **صفراً** في أربعٍ منها، **ووجد `PAdES` و`ISO 19005` في معيار الأمان** — فالمسبارُ يرى، والصفرُ نفيٌ لا عمى.

**الفجوة:** المستودعُ يولّد XML ويرسله (مطابقٌ للإلزاميّ)، **لكن لا يسلّم المشتري XML فاتورته القياسية ولا PDF/A-3** — ومشاركتُها معه واجبةٌ بنصّ القرار (ص3) والإرشادات (ص15). و«حفظٌ كـPDF» من المتصفّح **لو أُرسل للمشتري لخالف** ص63.

---

## الشرطُ المسجَّل — «ومجمّعُ الاتصالات للقاعدة: شرطٌ يُسجَّل ليوم يُضاف، فسياقُ المنشأة يتعارض معه.»

**المقيس:**
- **كلُّ** `set_config` في الشيفرة بثالثٍ `true` (بعمر المعاملة): `tenant-prisma.service.ts:57 · 78 · 99` · `sequence-allocator.ts:126 · 139` · `audit/audit.service.ts:194` · `companies/create-company-account.ts:109` · `platform/platform-bootstrap.ts:30` (والبذرة والسكربتات مثلها). **صفرُ** `set_config(…, false)` و`SET SESSION` و`RESET`/`DISCARD`؛ و`SET LOCAL` في اختبارٍ وحده (`plan-cache-mode.live.spec.ts:59`). والمسبارُ يرى: البحثُ نفسُه وجد `pg_advisory_xact_lock`.
- كلُّ عملٍ بسياقٍ **معاملةٌ تفاعلية** (`tenant-prisma.service.ts:56-57`) أو **معاملةُ دفعة** (`audit.service.ts:193-195`).
- الأقفالُ الاستشارية: **بعمر المعاملة فقط** (`pos/pos.service.ts:349`). لا `LISTEN`/`NOTIFY`، ولا `WITH HOLD`، ولا جدولٌ مؤقّت إلا في اختبارٍ بـ`ON COMMIT DROP`.
- `plan_cache_mode = force_custom_plan` **على الدور** (`prisma/migrations/20260914100000_plan_cache_mode_custom/migration.sql:23`)، ومحروسٌ حيّاً (`plan-cache-mode.live.spec.ts:45-53`).
- Prisma 5.22 (`apps/api/package.json:38`) بعبارات محضَّرة؛ ومصدرٌ واحد `DATABASE_URL` للتشغيل **وللهجرات** (`schema.prisma:17-29` بلا `directUrl` · `Dockerfile:78`)؛ واتصالُه مباشرٌ على `postgres:5432` بدور `app_user` (`docker-compose.prod.yml:85`)؛ وعميلٌ ثانٍ للعدّاد بحدّ اتصالين (`sequence-allocator.ts:49 · 71-73`).

**الشروط — كلُّها معاً لا أحدُها:**
1. **نمطُ التجميع `transaction` أو `session` — ولا `statement` أبداً.** السياقُ بعمر المعاملة (أعلاه)، فنمطٌ يوزّع عباراتِ المعاملة على اتصالات يفصل `set_config` عن استعلامه **فتعود القراءةُ فارغةً بنجاح** تحت `FORCE`. ونمطُ `transaction` آمنٌ اليوم **لأن** لا `set_config(…, false)` ولا `SET` جلسةً — **فيُحرس ذلك قبل الإضافة** (حارسٌ يُسقط أيَّ `set_config` بثالثٍ غير `true` أو `SET` جلسة).
2. **العباراتُ المحضَّرة**: PgBouncer بـ`max_prepared_statements > 0` (صفحة الخصائص: https://www.pgbouncer.org/features.html — مقروءة 2026-09-26)، أو `pgbouncer=true` في العنوان لإصدارٍ أقدم (توثيق Prisma: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/pgbouncer — مقروءة 2026-09-26).
3. **الهجراتُ خارج المجمّع**: توثيقُ Prisma ينصّ أن محرّك المخطّط لا يدعم التجميع ويحتاج اتصالاً مباشراً؛ واليومَ `migrate deploy` يعمل بـ`DATABASE_URL` نفسِه (`Dockerfile:78`) ⇒ يلزم `directUrl` مباشرٌ في `schema.prisma` وعنوانٌ مباشرٌ لأمر الهجرة.
4. **المجمّعُ يدخل القاعدةَ بدور `app_user` نفسِه** (`NOBYPASSRLS` — `01-create-app-role.sh:11`) لا بدورٍ مفروضٍ غيرِه: وإلا تجاوز العزلَ دورٌ خارق (`CLAUDE.md §6.1`)، **وضاع إعدادُ `plan_cache_mode` المربوطُ بالدور** (الهجرة:23). والشاهدُ أن `plan-cache-mode.live.spec.ts` ومجسّاتِ العزل الحيّة **تمرّ على عنوان المجمّع** لا على المباشر.
5. **لا أقفالَ استشاريةً بمستوى الجلسة ولا `LISTEN`/`NOTIFY` ولا `WITH HOLD` في شيفرة التطبيق** — صحيحٌ اليوم (أعلاه)، ويُحرس.
6. **حجمُ المجمّع يسع مجموعَ Prisma + اتصالَي العدّاد لكلِّ نسخة API** (`sequence-allocator.ts:49`) — والمعاملاتُ التفاعلية تحتجز اتصالاً طوالها.

---

## أكبرُ فجوة

**لا يُسلَّم المشتري فاتورتَه القياسية بصيغةٍ تقبلها الهيئة (XML أو PDF/A-3)** — المستندُ الموقَّع لا يخرج إلا في أرشيف المنشأة، ولا PDF يُولَّد، والبريدُ لا يرسل فواتير؛ والمشاركةُ واجبةٌ بنصّ القرار (ص3) والإرشادات (ص15). وتليها: **لا تحقّقَ محلّياً بمخطّط UBL ولا Schematron** قبل ختمٍ لا رجعةَ فيه.
