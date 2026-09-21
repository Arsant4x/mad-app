# حالة SPEC المشتقّة من الاختبارات — تقريرٌ مولَّد، لا يُحرَّر بيد

> يولّده `apps/api/scripts/spec-status.ts` من `SPEC.md` ومن الوسوم `[SPEC N.N]` في أسماء الاختبارات.
> **الحالة تُشتقّ ولا تُكتب** (قرار المالك 2026-09-03). والحارس `spec-tags.spec.ts` يُسقط الحزمة حين تختلف الوثيقة عن الشيفرة.

| القياس | العدد |
|---|---|
| بنود SPEC | 281 |
| منها في جداولٍ لها عمودُ حالة | 187 |
| تقول الوثيقة ✅ | 95 |
| لها اختبارٌ موسومٌ يعمل (مشتقّةً ✅) | 91 |
| ✅ في الوثيقة بلا اختبارٍ موسوم (دَينٌ معلَن في spec-untested.json) | 4 (منها 4 معلَنة) |
| اختبارٌ يثبتها والوثيقة تقول غير ✅ (تخلّف SPEC) | 0 |
| اختباراتٌ موسومة / كل الاختبارات | 223 / 1787 |

| # | البند | الوثيقة | المشتقّة | الاختبارات التي تثبته |
|---|---|---|---|---|
| 1.1 | تسجيل دخول آمن (argon2) | ✅ | ✅ | `api/test/auth-selfservice.e2e-spec.ts` :: [SPEC 1.1] resets by token: single-use, kills old password and old sessions (e2e)<br>`api/test/auth-selfservice.e2e-spec.ts` :: [SPEC 1.1] rejects an expired token outright (e2e) |
| 1.2 | عزل المنشآت بطبقتين (App + RLS) | ✅ | ✅ | `api/src/common/tenant/rls-coverage.live.spec.ts` :: [SPEC 1.2] ⭐ كل جدول مستأجر يحمل `ENABLE` و`FORCE` — من كتالوج القاعدة (حيّ)<br>`api/src/purchases/purchase-lines.live.spec.ts` :: [SPEC 1.2] ⭐ ③ والعزل: بندُ منشأةٍ لا يُقرأ من سياق منشأةٍ أخرى (حيّ)<br>`api/test/composite-fk-guard.e2e-spec.ts` :: [SPEC 1.2] ① every composite relation in the schema is a two-column NO ACTION constraint in the catalog — and vice versa (e2e)<br>`api/test/composite-fk-guard.e2e-spec.ts` :: [SPEC 1.2] ② batch 1 sample — banks.branchId → branches: a foreign company\'s branch is refused by the composite key, its own is accepted (e2e)<br>`api/test/composite-fk-guard.e2e-spec.ts` :: [SPEC 1.2] ③ batch 2 sample — invoice_lines.invoiceId → invoices: a foreign company\'s invoice is refused, its own is accepted (e2e)<br>`api/test/composite-fk-guard.e2e-spec.ts` :: [SPEC 1.2] ④ batch 3 sample — journal_lines.journalEntryId → journal_entries: a foreign company\'s entry is refused, its own is accepted (e2e)<br>`api/test/composite-fk-guard.e2e-spec.ts` :: [SPEC 1.2] ⑤ batch 4 sample — units.propertyId → properties: a foreign company\'s property is refused, its own is accepted (e2e)<br>`api/test/supplier-payments.e2e-spec.ts` :: [SPEC 1.2] a supplier payment is invisible to another company (e2e) |
| 1.3 | قوالب صلاحيات (نماذج) | ✅ | ✅ | `api/src/delegations/me-permissions.spec.ts` :: [SPEC 1.3] ⭐ شاشةٌ مسموحة بلا تفصيل أفعال ⇒ **كل** أفعالها لا صفر (وحدة)<br>`api/src/delegations/me-permissions.spec.ts` :: [SPEC 1.3] التفصيل الصريح يضيّق إلى ما فيه وحده (وحدة)<br>`api/src/delegations/me-permissions.spec.ts` :: [SPEC 1.3] ⭐ لا تخترع زوجاً ترفضه `isActionAllowed` — ولا تُسقط زوجاً تقبله (وحدة) |
| 1.4 | حسابات موظفين بصلاحيات محدودة | ✅ | ✅ | `api/test/company-user-deactivation.e2e-spec.ts` :: [SPEC 1.4] ① the employee works before deactivation (e2e)<br>`api/test/company-user-deactivation.e2e-spec.ts` :: [SPEC 1.4] ② after deactivation the very next request is refused, and the session cannot be refreshed (e2e)<br>`api/test/company-user-deactivation.e2e-spec.ts` :: [SPEC 1.4] ③ re-activation does not revive the old session — its refresh token was revoked, and a fresh login is required (e2e)<br>`api/test/owner-templates.e2e-spec.ts` :: [SPEC 1.4 1.5] that template governs the employee it is assigned to (e2e)<br>`api/test/permission-actions.e2e-spec.ts` :: [SPEC 1.4] a view-only employee reads contracts but cannot create one (e2e)<br>`api/test/permission-actions.e2e-spec.ts` :: [SPEC 1.4] a view+add employee gets past the guard on create (reaches validation, not 403) (e2e) |
| 1.5 | حراسة الشاشات (ScreenGuard) | ✅ | ✅ | `api/test/owner-templates.e2e-spec.ts` :: [SPEC 1.4 1.5] that template governs the employee it is assigned to (e2e)<br>`api/test/sector-screens.e2e-spec.ts` :: [SPEC 1.5] ⭐④ التطبيق يُرشِّح — والعنوان المباشر يُرفض بـ403 لا 404 (e2e)<br>`api/test/sector-screens.e2e-spec.ts` :: [SPEC 1.5] ⭐⑥ موظفٌ يعمل على شاشة ثم يُعطَّل نشاطها — يُرفض في **الطلب التالي** بلا إعادة دخول (e2e) |
| 1.6 | لوحة المطوّر (إدارة الاشتراكات) | ✅ | ⬜ (دَين معلَن) | ⚠️ لوحة المطوّر (إدارة الاشتراكات) — لا اختبار يمرّ بمسار PLATFORM_ADMIN أو حارس اللوحة أو تعديل اشتراكٍ من مدير؛ اختبارات دورة حياة الاشتراك (company-status.util.spec.ts) تثبت 15.1 و15.2 لا اللوحة. يلزم اختبار. |
| 1.7 | التسجيل الذاتي للعميل | ✅ | ✅ | `api/test/auth-selfservice.e2e-spec.ts` :: [SPEC 1.7 15.7] registers a merchant with an immediate session, a trial, and full isolation (e2e)<br>`api/test/auth-selfservice.e2e-spec.ts` :: [SPEC 1.7] refuses a taken username (e2e) |
| 1.8 | OTP: تسجيل · جهاز جديد · عملية حساسة | ⬜ | ⬜ | — |
| 1.9 | قفل المستخدم (User Lock) للكاشير | ⬜ | ⬜ | — |
| 1.10 | وضع الدعم الفني بإذن العميل + سجل | ✅ | ✅ | `api/test/support-access.e2e-spec.ts` :: [SPEC 1.10] no consent, no entry — with or without the header (e2e)<br>`api/test/support-access.e2e-spec.ts` :: [SPEC 1.10] the owner approves → read opens, writes stay closed (e2e)<br>`api/test/support-access.e2e-spec.ts` :: [SPEC 1.10] 🔴 the scope is enforced: outside it 403, undeclared routes 403, the shell 200 (e2e)<br>`api/test/support-access.e2e-spec.ts` :: [SPEC 1.10] every support request lands in the owner-visible log, named and reasoned (e2e)<br>`api/test/support-access.e2e-spec.ts` :: [SPEC 1.10] 🔴 a second platform admin cannot enter on another admin\'s consent (e2e) |
| 1.11 | **جديد (v20):** تذاكر دعم داخلية للعميل (قسم · أولوية · مسؤول · حالة) — مختلفة عن 1.10 (تل | ✅ | ✅ | `api/test/tasks.e2e-spec.ts` :: [SPEC 1.11] ⭐⑪ تعليقٌ بلا انتقال — سطرٌ في السجل لا يغيّر الحالة، لطرفَي المهمّة وحدهما (e2e) |
| 2.1 | بيانات المنشأة (اسم · ضريبي · سجل · عنوان) | ✅ | ✅ | `api/test/company-profile.e2e-spec.ts` :: [SPEC 2.1] updates and reads back company A profile (e2e)<br>`api/test/company-profile.e2e-spec.ts` :: [SPEC 2.1] stores the national address as separate parts, not one line (e2e)<br>`api/test/company-profile.e2e-spec.ts` :: [SPEC 2.1] rejects an invalid VAT number (not 15 digits / wrong prefix-suffix) (e2e)<br>`api/test/company-profile.e2e-spec.ts` :: [SPEC 2.1] يقبل تعديلاً جزئياً بلا legalName — ويترك الاسم كما هو (e2e) |
| 2.2 | شعار المنشأة | ✅ | ✅ | `api/test/company-profile.e2e-spec.ts` :: [SPEC 2.2 11.3] attaches an uploaded logo, serves it back, and clears it on request (e2e) |
| 2.3 | العنوان الوطني (7 حقول رسمية) | 🟨 | ⬜ | — |
| 2.4 | **الفروع — المستوى 2** | ✅ | ✅ | `api/test/branches.e2e-spec.ts` :: [SPEC 2.4] lets the owner see every branch (e2e)<br>`api/test/branches.e2e-spec.ts` :: [SPEC 2.4] rejects a duplicate branch name within the company (e2e) |
| 2.5 | مخزون مستقل لكل فرع | 🟨 | ⬜ | — |
| 2.6 | صندوق نقدي مستقل لكل فرع | ✅ | ⬜ (دَين معلَن) | ⚠️ صندوق نقدي مستقل لكل فرع — payments.e2e-spec.ts:194 يرفع رصيد صندوقٍ واحد ولا expect يقرأ bank.branchId ولا فرعٌ ثانٍ بصندوقٍ ثانٍ يثبت الاستقلال. يلزم اختبارٌ بفرعَين. |
| 2.7 | الموظف ينتمي لفرع ولا يرى غيره | 🟨 | ⬜ | — |
| 2.8 | تقرير لكل فرع + مجمَّع للمالك | ✅ | ✅ | `api/test/branches.e2e-spec.ts` :: [SPEC 2.8] reports revenue per branch and a consolidated total that includes unassigned rows (e2e)<br>`api/test/branches.e2e-spec.ts` :: [SPEC 2.8] shows a restricted employee only their own branch in the report (e2e) |
| 2.9 | نقل بضاعة بين الفروع | 🟨 | ⬜ | — |
| 2.10 | شريط حالة: الفرع · الصندوق · انتهاء الاشتراك | ⬜ | ⬜ | — |
| 3.1 | دليل الحسابات | ✅ | ✅ | `api/src/accounts/default-chart.spec.ts` :: [SPEC 3.1] لا رمز مكرر، ولكل حساب نوع صالح (وحدة) |
| 3.2 | شجرة حسابات هرمية (رئيسي/فرعي) | ⬜ | ⬜ | — |
| 3.3 | القيود اليومية (مزدوجة ومتوازنة) | ✅ | ✅ | `api/test/journal-tenant-isolation.e2e-spec.ts` :: [SPEC 3.3] rejects an unbalanced manual entry and never touches balances (e2e)<br>`api/test/journal-tenant-isolation.e2e-spec.ts` :: [SPEC 3.3] posts a balanced manual entry to account balances, then reverses on delete (e2e)<br>`api/test/payments.e2e-spec.ts` :: [SPEC 3.3 7.3 7.5] posts a balanced entry (debit cash / credit A-R) and raises the branch cash box (e2e) |
| 3.4 | الترحيل التلقائي من الفواتير | ✅ | ✅ | `api/test/default-chart.e2e-spec.ts` :: [SPEC 3.4] فاتورة أول يوم تُرحَّل — 1200 مديناً و4100/2200 دائنَين (e2e)<br>`api/test/invoice-purchase-auto-posting.e2e-spec.ts` :: [SPEC 3.4 4.4] posts a new invoice to A/R, revenue, and VAT, then reverses on delete (e2e) |
| 3.5 | منع تعديل/حذف قيد مرحَّل | 🟨 | ⬜ | — |
| 3.6 | **السنة المالية** | ✅ | ✅ | `api/test/fiscal-period-lock.e2e-spec.ts` :: [SPEC 3.6] generates twelve monthly periods, all open, starting from the given date (e2e)<br>`api/test/fiscal-period-lock.e2e-spec.ts` :: [SPEC 3.6] starts the twelve periods at a non-January start date and rolls into the next year (e2e) |
| 3.7 | **إقفال الفترات ومنع القيد فيها** | ✅ | ✅ | `api/src/fiscal/period-lock-tz.live.spec.ts` :: [SPEC 3.7] ① المسار اليدوي — createJournalEntry مباشرةً (حيّ)<br>`api/src/fiscal/period-lock-tz.live.spec.ts` :: [SPEC 3.7] ② مسار الفاتورة — postInvoiceEntry (حيّ)<br>`api/src/fiscal/period-lock-tz.live.spec.ts` :: [SPEC 3.7] ⑤ والبوابة نفسها ترفض التاريخ المنزاح (حيّ)<br>`api/test/fiscal-year-delete-guard.e2e-spec.ts` :: [SPEC 3.7] ① refuses to delete a year that still has a closed period — and the lock survives the attempt (e2e)<br>`api/test/fiscal-year-delete-guard.e2e-spec.ts` :: [SPEC 3.7] ② deletes once every period is reopened — a calendar that locks nothing may go (e2e) |
| 3.8 | أرصدة افتتاحية مرحَّلة | 🟨 | ⬜ | — |
| 3.9 | **العملات المتعددة + سعر الصرف** | 🟨 | ⬜ | — |
| 3.10 | فروق العملة (ربح/خسارة) | 🟨 | ⬜ | — |
| 3.11 | قيود الإقفال السنوي التلقائية | ⬜ | ⬜ | — |
| 3.12 | **الأصول الثابتة والإهلاك** | ⬜ | ⬜ | — |
| 4.1 | سجل العملاء | ✅ | ✅ | `api/test/customer-trash-guards.e2e-spec.ts` :: [SPEC 4.1] ① عميلٌ له عقدٌ حيّ لا يُحذف — 409 تسمّي الأرشفةَ مخرجاً (e2e)<br>`api/test/customers-tenant-isolation.e2e-spec.ts` :: [SPEC 4.1] creates, rejects duplicate name, updates, and deletes a customer scoped to company A only (e2e)<br>`api/test/customers-tenant-isolation.e2e-spec.ts` :: [SPEC 4.1] refuses to delete a customer that still has invoices (e2e) |
| 4.2 | كشف حساب العميل | ✅ | ✅ | `api/test/ledger-statement.e2e-spec.ts` :: [SPEC 4.2] ④ the customer statement reads the party dimension across accounts and closes on the receivable the aging reports (e2e) |
| 4.3 | حد الائتمان | ✅ | ✅ | `api/test/credit-limit.e2e-spec.ts` :: [SPEC 4.3] ② والحدُّ يمنع — والرسالةُ تحمل الحدَّ والقائمَ والمطلوب لا كلمةَ «تجاوزت» (e2e) |
| 4.4 | الفواتير وبنودها | ✅ | ✅ | `api/test/invoice-outstanding.e2e-spec.ts` :: [SPEC 4.4] a partly paid invoice reports its REMAINING amount, not its total (e2e)<br>`api/test/invoice-purchase-auto-posting.e2e-spec.ts` :: [SPEC 3.4 4.4] posts a new invoice to A/R, revenue, and VAT, then reverses on delete (e2e)<br>`api/test/invoices-tenant-isolation.e2e-spec.ts` :: [SPEC 4.4 6.1] computes invoice totals server-side from lines, ignoring any client-submitted amounts (e2e) |
| 4.5 | المقبوضات والسداد الجزئي | 🟨 | ⬜ | — |
| 4.6 | الذمم المدينة وأعمارها | 🟨 | ⬜ | — |
| 4.7 | CRM (إدارة علاقات) | ⬜ | ⬜ | — |
| 4.8 | المبيعات المستهدفة والعمولات | ⬜ | ⬜ | — |
| 4.9 | عروض الأسعار | ⬜ | ⬜ | — |
| 4.10 | **صفةُ المشتري ومعرّفُه البديل وبلدُه — ونوعُ الفاتورة منها** *(فردٌ · مؤسّسةٌ فردية · شخص | ✅ | ✅ | `api/test/customer-kind.e2e-spec.ts` :: [SPEC 4.10] ① the kind is required and declared — no silent default; the alternative id is a pair with a listed scheme, the country a code (e2e)<br>`api/test/customer-kind.e2e-spec.ts` :: [SPEC 4.10] ② a customer from before the build is refused a document by name until its kind is declared — then it is invoiced (e2e)<br>`api/test/customer-kind.e2e-spec.ts` :: [SPEC 4.10] ③ the type follows the kind (م٥٣) and the document carries the alternative id with its scheme and the buyer country (BR-KSA-14 · BT-55) (e2e) |
| 5.1 | سجل الموردين | ✅ | ✅ | `api/test/suppliers-purchases-tenant-isolation.e2e-spec.ts` :: [SPEC 5.1] creates a supplier, rejects a duplicate name, and keeps it invisible to company B (e2e)<br>`api/test/suppliers-purchases-tenant-isolation.e2e-spec.ts` :: [SPEC 5.1 6.1] computes purchase tax/total server-side, isolates it from company B, and blocks supplier deletion while it exists (e2e) |
| 5.2 | فواتير المشتريات | ✅ | ✅ | `api/src/purchases/purchase-lines.live.spec.ts` :: [SPEC 5.2] ⭐ ① شراءٌ ببندين — مخزنيٍّ وخدميٍّ — يُحفظ ويُقرأ (حيّ) |
| 5.3 | المدفوعات والذمم الدائنة | ✅ | ✅ | `api/test/default-chart.e2e-spec.ts` :: [SPEC 5.3] مشترى أول يوم يُرحَّل — 5300 مديناً و2100 دائناً (e2e)<br>`api/test/invoice-purchase-auto-posting.e2e-spec.ts` :: [SPEC 5.3] posts a new purchase to its expense account, VAT, and A/P using the default expense account when no category matches (e2e)<br>`api/test/supplier-payments.e2e-spec.ts` :: [SPEC 5.3 10.3] 1,000 purchase → 400 payment (600 · PARTIAL) → 600 payment (0 · PAID) → reversal (600 · PARTIAL): 2100 and the cash-flow report follow every step (e2e) |
| 5.4 | استثناء من الضريبة (`excludeFromVat`) | ✅ | ✅ | `api/test/purchase-vat-amortize.e2e-spec.ts` :: [SPEC 5.4] an excluded purchase never reduces the VAT owed, and is reported apart (e2e)<br>`api/test/purchase-vat-amortize.e2e-spec.ts` :: [SPEC 5.4] stores excludeFromVat on the purchase itself (e2e) |
| 5.5 | مصروف مؤجَّل/تأسيس (`amortize`) | ✅ | ✅ | `api/test/incorporation-report.e2e-spec.ts` :: [SPEC 5.5] counts only establishment purchases, grouped by line item (e2e)<br>`api/test/incorporation-report.e2e-spec.ts` :: [SPEC 5.5] labels an amortized item with its period, and counts it (e2e)<br>`api/test/purchase-vat-amortize.e2e-spec.ts` :: [SPEC 5.5] amortization is establishment-only, and needs a month count (e2e) |
| 5.6 | أوامر الشراء | ⬜ | ⬜ | — |
| 5.7 | الاستلامُ المستقلّ — جزئيٌّ · حسابٌ وسيط | ✅ | ✅ | `api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ① الضمنيُّ افتراضاً: استلامٌ كامل بتاريخ الشراء برقم GR، وقيدان، والوسيطُ يتصافى، والمطابقةُ صفر (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ② `receiveNow: false`: فاتورةٌ بلا رفّ — لا طبقة، والوسيطُ مدينٌ بما فُوتر ولم يُستلم، والمطابقةُ تعدّه (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ③ الاستلامُ الجزئيّ ثم المكمِّل: الطبقةُ بتاريخ الوصول، والمكمِّلُ يرحّل الفرقَ — 3 × 0.333 تتصافى بلا هللة (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ④ الحدودُ المسمّاة: فوق المتبقّي · خدميّ · من شراءٍ آخر · مكرَّر · على إشعار — ولا يُكتب شيء (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ⑤ الإلغاءُ عكسٌ لا محو: الطبقةُ تُفرَغ بحركةٍ خارجة والقيدُ يُعكس والمطابقةُ صفر — ولا يُلغى ما استُهلك، وبنودُ الشراء مجمَّدةٌ حتى يُعكس المسجَّل (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ⑥ إشعارُ المورّد على سطرٍ لم يُستلم كاملاً أو استُلم على مرّتين يُردّ مسمّىً — حدٌّ معلَن لا صامت (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ⑦ العزل: منشأةٌ أخرى لا ترى الاستلامَ ولا تسجّله ولا تُلغيه — 404 لا 403 (e2e)<br>`api/test/goods-receipts.e2e-spec.ts` :: [SPEC 5.7] ⑧ القائم: صفوفُ ما قبل البناء تُكتب من حركاتها بالهجرة نفسِها (حالةٌ معلومة في معاملةٍ تُرجَع)، وقيدُ استلامها يُكتب حين يُعاد ترحيلُ شرائها (e2e) |
| 5.8 | التكاليفُ المحمَّلة — توزيعُ فاتورةٍ خدمية على طبقاتٍ مسمّاة | ✅ | ✅ | `api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ① توزيعٌ بالقيمة على استلامٍ واحد قبل أي استهلاك: كلُّه إلى الرفّ، والتكلفةُ تزيد بنصيبها، ومصروفُ الفئة يُعاد تصنيفُه (e2e)<br>`api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ② الفرقُ الثاني: تكلفةٌ تصل بعد بيع بعضِ الطبقة — حصّةُ المستهلَك إلى 5100 الآن، والرفُّ بالجديد، وما يُباع بعدها يخرج بها (e2e)<br>`api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ③ إرساليةٌ على استلامين: التوزيعُ بالقيمة بأوزان سطور الاستلام، والأخيرُ يحمل بقيّةَ التدوير (e2e)<br>`api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ④ الحدودُ المسمّاة: سطرٌ مخزنيّ · سطرٌ وُزِّع · طبقةٌ من استلامٍ مُلغى · مجموعٌ يدويّ مخالف · طبقةٌ مكرَّرة · بلا طبقات (e2e)<br>`api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ⑤ الإلغاءُ عكسٌ لا محو: التكلفةُ تُعاد والقيدُ يُعكس ويُسمح بتوزيعٍ جديد — ويُرفض بعد استهلاكٍ لاحق (e2e)<br>`api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ⑥ التجميد: شراءٌ خدميّ وُزِّع لا يُعدَّل ولا يُلغى، واستلامٌ على طبقته توزيعٌ لا يُعكس (e2e)<br>`api/test/landed-costs.e2e-spec.ts` :: [SPEC 5.8] ⑦ العزل: منشأةٌ أخرى لا ترى التوزيعَ ولا توزّع (e2e) |
| 6.1 | حساب ضريبة القيمة المضافة | ✅ | ✅ | `api/src/common/money/rounding.spec.ts` :: [SPEC 6.1] ⭐ حدّ IEEE-754 لا يخدعه: 1.005 تعطي 1.01 لا 1.00 — وكذلك على المقادير الكبيرة (وحدة)<br>`api/src/common/money/rounding.spec.ts` :: [SPEC 6.1] ⭐ متناظرٌ حول الصفر: الإشعار الدائن يردّ ما حصّلته الفاتورة بالضبط (وحدة)<br>`api/src/common/money/totals.spec.ts` :: [SPEC 6.1] ⭐ subtotal + taxTotal === total بالضبط، وsubtotal === Σ صوافي البنود، وtaxTotal === Σ ضريبة النِّسَب (وحدة)<br>`api/src/common/money/totals.spec.ts` :: [SPEC 6.1] ⭐ التناظر: إشعارٌ دائن ينفي البنود يعطي نفيَ المجاميع بالضبط — لا هللةٌ تبقى (وحدة)<br>`api/src/common/money/totals.spec.ts` :: [SPEC 6.1] ⑧ الوعاءُ بالمفتاح الثلاثي: بندان بصفرٍ بفئتين (Z · E) صفّان في التفصيل لا صفّ — وبندا O بسببين صفّان (وحدة)<br>`api/test/invoices-tenant-isolation.e2e-spec.ts` :: [SPEC 4.4 6.1] computes invoice totals server-side from lines, ignoring any client-submitted amounts (e2e)<br>`api/test/obligations-tenant-isolation.e2e-spec.ts` :: [SPEC 6.1] computes a VAT declaration from real invoice/purchase data for the given quarter (e2e)<br>`api/test/suppliers-purchases-tenant-isolation.e2e-spec.ts` :: [SPEC 5.1 6.1] computes purchase tax/total server-side, isolates it from company B, and blocks supplier deletion while it exists (e2e) |
| 6.2 | الإقرار الضريبي | 🟨 | ⬜ | — |
| 6.3 | **ZATCA المرحلة 1 (QR)** | 🟨 | ⬜ | — |
| 6.4 | **ZATCA المرحلة 2 (الربط والتوقيع)** | 🟨 | ⬜ | — |
| 6.5 | فاتورة ضريبية مبسطة | 🟨 | ⬜ | — |
| 6.6 | إظهار المبلغ بالريال مع سعر الصرف | 🟨 | ⬜ | — |
| 6.7 | تنزيل الفاتورة PDF | ⬜ | ⬜ | — |
| 6.8 | تبديل لغة الفاتورة (عربي/إنجليزي) | ⬜ | ⬜ | — |
| 6.9 | **الالتزامات الحكومية** (رسوم · تراخيص · اشتراكات) | ✅ | ✅ | `api/test/obligations-tenant-isolation.e2e-spec.ts` :: [SPEC 6.9] auto-seeds the standard 9-item checklist across 3 entities on first read, idempotently (e2e)<br>`api/test/obligations-tenant-isolation.e2e-spec.ts` :: [SPEC 6.9] toggles an obligation done/undone (e2e) |
| 6.10 | تنبيه قرب انتهاء الترخيص/السجل | ⬜ | ⬜ | — |
| 6.11 | جدولة الالتزامات المتكررة | ⬜ | ⬜ | — |
| 6.12 | الزكاة وضريبة الدخل | ⬜ | ⬜ | — |
| 7.1 | حسابات بنكية متعددة | ✅ | ✅ | `api/test/banks-tenant-isolation.e2e-spec.ts` :: [SPEC 7.1] creates a bank account for company A, invisible/unreachable by B, and posts a delta entry when the opening balance is edited (e2e)<br>`api/test/transactions-tenant-isolation.e2e-spec.ts` :: [SPEC 7.1 7.2] leaves the bank balance to the ledger and stays invisible to company B (e2e) |
| 7.2 | الحركات البنكية | ✅ | ✅ | `api/test/transactions-tenant-isolation.e2e-spec.ts` :: [SPEC 7.1 7.2] leaves the bank balance to the ledger and stays invisible to company B (e2e) |
| 7.3 | الصندوق النقدي | ✅ | ✅ | `api/test/contract-cashbox-payment.e2e-spec.ts` :: [SPEC 7.3] a cash receipt naming a box raises that box balance (e2e)<br>`api/test/payments.e2e-spec.ts` :: [SPEC 3.3 7.3 7.5] posts a balanced entry (debit cash / credit A-R) and raises the branch cash box (e2e)<br>`api/test/pos.e2e-spec.ts` :: [SPEC 7.3] closes the shift computing the variance itself — and blocks further sales (e2e) |
| 7.4 | التسوية البنكية | ✅ | ✅ | `api/test/bank-reconciliation.e2e-spec.ts` :: [SPEC 7.4] ① the overview reads the statement side (manual lines only) against the ledger side, and suggests the equal-amount line within ±3 days (e2e)<br>`api/test/bank-reconciliation.e2e-spec.ts` :: [SPEC 7.4] ② matching is one-to-one with equal amounts — the fee cannot take the deposit line, the deposit can (e2e)<br>`api/test/bank-reconciliation.e2e-spec.ts` :: [SPEC 7.4] ③ a statement line with no ledger is posted with a chosen counterparty — the entry lands on the bank ledger and the mirror, and the line is matched (e2e)<br>`api/test/bank-reconciliation.e2e-spec.ts` :: [SPEC 7.4] ④ closing through a date needs no pending statement lines, then locks the bank account for entries and unmatching on or before it (e2e)<br>`api/test/bank-reconciliation.e2e-spec.ts` :: [SPEC 7.4] ⑤ another company sees nothing (e2e) |
| 7.5 | صندوق مستقل لكل فرع | ✅ | ✅ | `api/test/payments.e2e-spec.ts` :: [SPEC 3.3 7.3 7.5] posts a balanced entry (debit cash / credit A-R) and raises the branch cash box (e2e) |
| 7.6 | **ترحيلُ البنك إلى الأستاذ** *(حسابٌ لكل بنك في نطاقه · القبضُ والصرفُ والإيجارُ على البنك | ✅ | ✅ | `api/test/bank-account-link.e2e-spec.ts` :: [SPEC 7.6] ① إنشاءُ بنكٍ يُنشئ حسابَه في الدليل — في أحد نطاقات البنوك، وباسمه (e2e) |
| 7.7 | **إيداعُ الدرج في البنك عبر «نقدٍ في الطريق»** *(مستندٌ مرقَّم `CD` · مدين `1190` / دائن ا | ✅ | ✅ | `api/test/cash-deposits.e2e-spec.ts` :: [SPEC 7.7] ① a deposit leaves the drawer for 1190 — numbered CD, an auto entry, and the two ledgers say so (e2e)<br>`api/test/cash-deposits.e2e-spec.ts` :: [SPEC 7.7] ② a deposit above what the drawer holds is refused by the drawer balance — named (e2e)<br>`api/test/cash-deposits.e2e-spec.ts` :: [SPEC 7.7] ③ the bank statement confirms it through reconciliation with the exact amount — 1190 clears, the bank ledger and mirror move, the document closes (e2e)<br>`api/test/cash-deposits.e2e-spec.ts` :: [SPEC 7.7] ④ voiding an in-transit deposit is a reversal that returns the cash to the drawer (e2e)<br>`api/test/cash-deposits.e2e-spec.ts` :: [SPEC 7.7] ⑤ another company sees nothing (e2e) |
| 7.8 | **تسويةُ الشبكة `1251`** *(مستندٌ مرقَّم `NS` يطالب بسندات القبض بالشبكة في مدًى · الإجمال | ✅ | ✅ | `api/test/network-settlements.e2e-spec.ts` :: [SPEC 7.8] ① a manual network receipt lands on 1251 — not 1000 — and the open list carries it with its ledger amount (e2e)<br>`api/test/network-settlements.e2e-spec.ts` :: [SPEC 7.8] ② the settlement claims the period, gross from the ledger, net to the bank, fee and its VAT in their month — and 1251 clears (e2e)<br>`api/test/network-settlements.e2e-spec.ts` :: [SPEC 7.8] ③ nothing open, fee above gross, and a backwards period are refused by name — and a claimed receipt is not claimed twice (e2e)<br>`api/test/network-settlements.e2e-spec.ts` :: [SPEC 7.8] ④ a settlement matched by the bank statement cannot be voided; unmatched, its void is a reversal that reopens the receipts (e2e)<br>`api/test/network-settlements.e2e-spec.ts` :: [SPEC 7.8] ⑤ another company sees nothing (e2e) |
| 8.1 | المنتجات والأصناف | ✅ | ✅ | `api/test/inventory-tenant-isolation.e2e-spec.ts` :: [SPEC 8.1 8.10] flags low and out-of-stock status based on Product.minStock, and allows going negative as a soft warning only (e2e)<br>`api/test/products-tenant-isolation.e2e-spec.ts` :: [SPEC 8.1] auto-generates a barcode when none is given, and keeps the product invisible to and unreachable by company B (e2e) |
| 8.2 | المستودعات | ✅ | ✅ | `api/test/inventory-tenant-isolation.e2e-spec.ts` :: [SPEC 8.2 8.10] computes on-hand quantity live from IN/OUT/TRANSFER/ADJUSTMENT movements, with no stored balance (e2e)<br>`api/test/inventory-tenant-isolation.e2e-spec.ts` :: [SPEC 8.2] blocks deleting a warehouse that still has stock movements (e2e)<br>`api/test/pos.e2e-spec.ts` :: [SPEC 8.2 8.10] deducts branch-warehouse stock inside the sale — untracked lines are skipped explicitly (e2e) |
| 8.3 | حركات المخزون | ✅ | ✅ | `api/src/inventory/quantity-precision.live.spec.ts` :: [SPEC 8.3] ⭐ 100.125 تُخزَّن كما هي — لا 100.13 (حيّ) |
| 8.4 | الجرد | 🟨 | ⬜ | — |
| 8.5 | **حد أدنى/أقصى لكل فرع** | ⬜ | ⬜ | — |
| 8.6 | تنبيه المخزون المنخفض | 🟨 | ⬜ | — |
| 8.7 | إعادة التعبئة التلقائية | ⬜ | ⬜ | — |
| 8.8 | التنبؤ بالطلب | ⬜ | ⬜ | — |
| 8.9 | مواقع المنتجات داخل المستودع | ⬜ | ⬜ | — |
| 8.10 | عرض المخزون عبر كل الفروع | ✅ | ✅ | `api/test/inventory-tenant-isolation.e2e-spec.ts` :: [SPEC 8.2 8.10] computes on-hand quantity live from IN/OUT/TRANSFER/ADJUSTMENT movements, with no stored balance (e2e)<br>`api/test/inventory-tenant-isolation.e2e-spec.ts` :: [SPEC 8.1 8.10] flags low and out-of-stock status based on Product.minStock, and allows going negative as a soft warning only (e2e)<br>`api/test/pos.e2e-spec.ts` :: [SPEC 8.2 8.10] deducts branch-warehouse stock inside the sale — untracked lines are skipped explicitly (e2e) |
| 8.11 | **تواريخ الصلاحية + أرقام التشغيلة** | 🟨 | ⬜ | — |
| 8.12 | تنبيه قرب انتهاء الصلاحية | 🟨 | ⬜ | — |
| 8.13 | **ربط باركود GS1 (مركز الترقيم السعودي)** | ⬜ | ⬜ | — |
| 8.14 | الأرصدةُ الافتتاحية بالطبقات — إعلانُ رصيد الرفّ بتكلفته وتاريخ اقتنائه، وقيدٌ مقابل `3900 | ✅ | ✅ | `api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ① الإعلان: طبقاتٌ بتاريخ الاقتناء لا الإعلان، وقيدٌ واحد 1300/3900 بتاريخ الافتتاح، مختومٌ بمن أعلن، و«بلا سند» معلَناً (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ② FIFO: استلامٌ لاحق أغلى ثم إخراجٌ يفوق الافتتاح — الافتتاحُ يُستهلك أوّلاً بتكلفته (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ③ المؤقّت: بيعٌ سبق الإعلان يُسوّيه الافتتاحُ بالكاتب القائم وقيدِ فرقٍ بتاريخ اليوم (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ④ الحدودُ المسمّاة: متتبَّعٌ بلا دفعة (ولا يُكتب شيء) · اقتناءٌ بعد الافتتاح · تاريخُ افتتاحٍ ثانٍ · صنفٌ تحرّك قبل الافتتاح (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ⑤ مصدرٌ واحد لرصيد 1300: الرصيدُ الافتتاحيُّ لحساب المخزون من شاشة الحسابات يُرفض (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ⑥ قفلُ الفترة شرطٌ لا تفصيل: فترةُ الافتتاح مقفلة ⟵ يُرفض ولا يبقى رأسٌ ولا حركة (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ⑦ الإلغاءُ عكسٌ لا محو: غيرُ المستهلَك يُعكس بحركةٍ وقيد، والمستهلَكُ يُرفض، والعامُّ لا يمسّ حركةَ الافتتاح؛ والعزل (e2e)<br>`api/test/opening-stock.e2e-spec.ts` :: [SPEC 8.14] ⑧ القائم: كتلةُ العدّ في الهجرة تُعاد على الحقيقة في معاملةٍ تُرجَع، والتقريرُ يعدّ طبقاتِ التسوية خارج المجموع ولا يحوّلها (e2e) |
| 9.1 | سجل الموظفين | ✅ | ✅ | `api/test/employees-tenant-isolation.e2e-spec.ts` :: [SPEC 9.1] creates an employee for company A, invisible and unreachable by company B (e2e) |
| 9.2 | **الرواتب** | ⬜ | ⬜ | — |
| 9.3 | **تكامل مُدد** | ⬜ | ⬜ | — |
| 9.4 | الحضور والانصراف | ✅ | ✅ | `api/test/attendance.e2e-spec.ts` :: [SPEC 9.4] records a check-in, and refuses a second one for the same day (e2e)<br>`api/test/attendance.e2e-spec.ts` :: [SPEC 9.4] checkout lands on the same row (e2e)<br>`api/test/attendance.e2e-spec.ts` :: [SPEC 9.4] the day sheet filters by date (e2e) |
| 9.5 | الإجازات (طلب · موافقة · رصيد) | ✅ | ✅ | `api/test/leaves.e2e-spec.ts` :: [SPEC 9.5] creates a request with inclusive days and defaults to pending (e2e)<br>`api/test/leaves.e2e-spec.ts` :: [SPEC 9.5] refuses an inverted date range and an overlapping period (e2e)<br>`api/test/leaves.e2e-spec.ts` :: [SPEC 9.5] approves once, and a second decision is refused; balance reflects the approval (e2e) |
| 9.6 | تحليل تكلفة الرواتب | ⬜ | ⬜ | — |
| 9.7 | العمولات | ⬜ | ⬜ | — |
| 9.8 | تتبّع المتقدمين للوظائف (ATS) | ⬜ | ⬜ | — |
| 10.1 | الميزانية العمومية | ✅ | ⬜ (دَين معلَن) | ⚠️ الميزانية العمومية — reports-tenant-isolation.e2e-spec.ts:162 يوكّد بنية الردّ لا رقماً محسوباً ولا معادلة الميزانية. يلزم اختبارٌ يرحّل قيداً ويقيس أثره. |
| 10.2 | قائمة الدخل | ✅ | ✅ | `api/test/reports-tenant-isolation.e2e-spec.ts` :: [SPEC 10.2] a journal entry posted for company A shows up in A's income statement but never in B's (e2e) |
| 10.3 | التدفق النقدي | ✅ | ✅ | `api/test/supplier-payments.e2e-spec.ts` :: [SPEC 5.3 10.3] 1,000 purchase → 400 payment (600 · PARTIAL) → 600 payment (0 · PAID) → reversal (600 · PARTIAL): 2100 and the cash-flow report follow every step (e2e) |
| 10.4 | ميزان المراجعة | ✅ | ✅ | `api/test/opening-balance-entries.e2e-spec.ts` :: [SPEC 10.4] carries the opening amounts into the trial balance, which stays balanced (e2e)<br>`api/test/trial-balance.e2e-spec.ts` :: [SPEC 10.4] balances by construction and honors the period filter (e2e)<br>`api/test/trial-balance.e2e-spec.ts` :: [SPEC 10.4] honors the branch filter — the branchless entry disappears (e2e) |
| 10.5 | **لوحة تحكم بمؤشرات** | 🟨 | ⬜ | — |
| 10.6 | **مقارنة بالفترة السابقة (+18%)** | ⬜ | ⬜ | — |
| 10.7 | أعلى المنتجات مبيعاً | ⬜ | ⬜ | — |
| 10.8 | متوسط قيمة الطلب | ⬜ | ⬜ | — |
| 10.9 | سجل نشاط حيّ (Activity Feed) | ⬜ | ⬜ | — |
| 10.10 | لوحة تحكم مخصصة لكل نشاط | ⬜ | ⬜ | — |
| 10.11 | مقارنة بين السنوات المالية | ⬜ | ⬜ | — |
| 10.12 | تصدير XML · XLS · CSV · PDF | 🟨 | ⬜ | — |
| 10.13 | **مراقبة أداء الفريق** (من يرد ومن يتجاهل) | ⬜ | ⬜ | — |
| 10.14 | متوسط زمن الرد ووقت الإغلاق | ⬜ | ⬜ | — |
| 10.15 | معدل تحويل الفرص لكل موظف | ⬜ | ⬜ | — |
| 10.16 | **الأستاذ العام وكشف الحساب** *(دفترُ كلِّ حسابٍ أو بُعدٍ برصيدٍ افتتاحيٍّ وجارٍ ومصدرِ كل | ✅ | ✅ | `api/test/ledger-statement.e2e-spec.ts` :: [SPEC 10.16] ① a debit-normal account: opening before the range by aggregation, rows inside it with a running balance and the source document (e2e)<br>`api/test/ledger-statement.e2e-spec.ts` :: [SPEC 10.16] ② receivables: the invoice then the receipt, in date order, each with its document (e2e)<br>`api/test/ledger-statement.e2e-spec.ts` :: [SPEC 10.16] ③ a credit-normal account runs on its own side, and a manual entry names itself as the source (e2e)<br>`api/test/ledger-statement.e2e-spec.ts` :: [SPEC 10.16] ⑤ refuses a ledger without a filter and a statement with two parties — and the other company sees nothing (e2e)<br>`api/test/ledger-statement.e2e-spec.ts` :: [SPEC 10.16] ⑥ exports both as CSV with a BOM and the same columns (e2e) |
| 11.1 | **طبقة تخزين الملفات (MinIO)** | ✅ | ✅ | `api/test/files-tenant-isolation.e2e-spec.ts` :: [SPEC 11.1] uploads a file and namespaces its key under the uploading company (e2e)<br>`api/test/files-tenant-isolation.e2e-spec.ts` :: [SPEC 11.1] rejects a disallowed file type (e2e)<br>`api/test/files-tenant-isolation.e2e-spec.ts` :: [SPEC 11.1] issues a short-lived download URL to the owning company (e2e) |
| 11.2 | مرفقات العقود | ✅ | ✅ | `api/test/contract-attachments.e2e-spec.ts` :: [SPEC 11.2] uploads a document and lists it back (e2e)<br>`api/test/contract-attachments.e2e-spec.ts` :: [SPEC 11.2] hands back a short-lived signed download URL (e2e)<br>`api/test/contract-attachments.e2e-spec.ts` :: [SPEC 11.2] deletes the attachment (e2e) |
| 11.3 | شعار المنشأة | ✅ | ✅ | `api/test/company-profile.e2e-spec.ts` :: [SPEC 2.2 11.3] attaches an uploaded logo, serves it back, and clears it on request (e2e) |
| 11.4 | مرفقات المطالبات | ✅ | ✅ | `api/test/purchase-attachments.e2e-spec.ts` :: [SPEC 11.4] uploads a founding-invoice document and lists it (e2e)<br>`api/test/purchase-attachments.e2e-spec.ts` :: [SPEC 11.4] serves a signed download URL that actually returns the bytes (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 11.4] claim attachments: upload → list → signed download URL → delete (e2e) |
| 11.5 | نماذج التسليم الموقَّعة | ✅ | ✅ | `api/test/contract-handovers.e2e-spec.ts` :: [SPEC 11.5 16.15] stamps the signing time from the server clock, not the caller (e2e)<br>`api/test/contract-handovers.e2e-spec.ts` :: [SPEC 11.5 16.15] refuses every change to a signed form (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 11.5 16.15] handover photos: attach to an item, then signing locks add AND remove (16.15) (e2e) |
| 11.6 | **استيراد عقد من PDF بالذكاء الاصطناعي** | ⬜ | ⬜ | — |
| 12.1 | سجل العمليات (Audit Log) | ✅ | ✅ | `api/test/audit-log.e2e-spec.ts` :: [SPEC 12.1 12.2] records a change automatically, as a readable Arabic sentence (e2e)<br>`api/test/audit-log.e2e-spec.ts` :: [SPEC 12.1] records an edit distinctly from the creation (e2e)<br>`api/test/audit-log.e2e-spec.ts` :: [SPEC 12.1] is append-only — no endpoint can alter or remove an entry (e2e) |
| 12.2 | عرض التغييرات بشكل مفهوم (لا JSON) | ✅ | ✅ | `api/test/audit-log.e2e-spec.ts` :: [SPEC 12.1 12.2] records a change automatically, as a readable Arabic sentence (e2e)<br>`api/test/sector-screens.e2e-spec.ts` :: [SPEC 12.2] ⭐⑤ التغيير مسجَّل في سجل التدقيق بالأسماء العربية (e2e) |
| 12.3 | **سجل الوصول — من اطّلع على ماذا** | 🟨 | ⬜ | — |
| 12.4 | العميل يرى سجل الوصول بنفسه | 🟨 | ⬜ | — |
| 12.5 | تشفير الحقول الحساسة (هوية · IBAN · رواتب) | ⬜ | ⬜ | — |
| 12.6 | سلة المحذوفات والأرشيف | ✅ | ✅ | `api/test/archive.e2e-spec.ts` :: [SPEC 12.6] archives a customer out of the list, and back (e2e)<br>`api/test/trash.e2e-spec.ts` :: [SPEC 12.6] a deleted record leaves the list but lands in the trash, still named (e2e)<br>`api/test/trash.e2e-spec.ts` :: [SPEC 12.6] restores it intact (e2e) |
| 12.7 | النسخ الاحتياطي والاستعادة | 🟨 | ⬜ | — |
| 13.1 | **تذكيرات تلقائية للاستحقاقات** | 🟨 | ⬜ | — |
| 13.2 | **تحديد أيام التذكير (قبل/بعد الاستحقاق)** | ✅ | ✅ | `api/test/rent-reminders.e2e-spec.ts` :: [SPEC 13.2] defaults to a sensible policy without creating a row (e2e)<br>`api/test/rent-reminders.e2e-spec.ts` :: [SPEC 13.2] drops the instalment out of the queue once chased, and back in after the silence period (e2e)<br>`api/test/rent-reminders.e2e-spec.ts` :: [SPEC 13.2] leaves instalments outside the notice window alone (e2e) |
| 13.3 | **تحديد من يصله التنبيه (مدير · محاسب · كلاهما)** | ⬜ | ⬜ | — |
| 13.4 | **عتبة التصعيد بالأيام + مستلم التصعيد** | ✅ | ✅ | `api/test/escalation.e2e-spec.ts` :: [SPEC 13.4] escalates nothing until the company asks for it (e2e)<br>`api/test/escalation.e2e-spec.ts` :: [SPEC 13.4 13.5] raises one notification per arrear past the threshold (e2e) |
| 13.5 | إشعارات داخل النظام | ✅ | ✅ | `api/test/escalation.e2e-spec.ts` :: [SPEC 13.4 13.5] raises one notification per arrear past the threshold (e2e)<br>`api/test/escalation.e2e-spec.ts` :: [SPEC 13.5] counts unread, and marking read is what stops the count (e2e)<br>`api/test/warranty-expiry.e2e-spec.ts` :: [SPEC 13.5] warns only about cover lapsing soon — not far-off, not already-expired (e2e) |
| 13.6 | وحدة رسائل SMS | ⬜ | ⬜ | — |
| 13.7 | إشعارات بالبريد الإلكتروني | ⬜ | ⬜ | — |
| 13.8 | إشعارات دفع للتطبيق (تسويقية) | ⬜ | ⬜ | — |
| 13.9 | **الرسائل والقوالب الجاهزة** (نصوص قابلة للتخصيص) | ✅ | ✅ | `api/test/rent-reminders.e2e-spec.ts` :: [SPEC 13.9] queues an overdue instalment with the message already rendered (e2e)<br>`api/test/rent-reminders.e2e-spec.ts` :: [SPEC 13.9] keeps a record of what was actually said (e2e)<br>`api/test/scripts-tenant-isolation.e2e-spec.ts` :: [SPEC 13.9] creates, edits, and deletes a message template (e2e) |
| 13.10 | متغيّرات في القالب (اسم العميل · المبلغ · التاريخ) | 🟨 | ⬜ | — |
| 13.11 | إرسال جماعي للعملاء | ⬜ | ⬜ | — |
| 13.12 | قنوات متعددة (واتساب · SMS · بريد) | ⬜ | ⬜ | — |
| 14.1 | **قائمة مهام موحّدة (صيانة · دفعات · عقود)** | ⬜ | ⬜ | — |
| 14.2 | أولوية المهمة (عاجل · مرتفع · عادي) | ✅ | ✅ | `api/test/tasks.e2e-spec.ts` :: [SPEC 14.2] ⭐⑩ الأولويةُ من قائمةٍ مغلقة — تُحفظ وتُعرض للمكلَّف، والمخترَعةُ تُرفض، والافتراضُ عادي (e2e) |
| 14.3 | حالة المهمة (مفتوح · قيد التنفيذ · مكتمل) | ⬜ | ⬜ | — |
| 14.4 | **المهام المتكررة** | ⬜ | ⬜ | — |
| 14.5 | تعيين المهمة لموظف | ⬜ | ⬜ | — |
| 14.6 | أوامر الشغل | ⬜ | ⬜ | — |
| 15.1 | حالة الاشتراك (نشط · مجمَّد · موقوف) | ✅ | ✅ | `api/src/common/tenant/company-status.util.spec.ts` :: [SPEC 15.1 15.2] stays ACTIVE while subscription has not ended (وحدة)<br>`api/src/common/tenant/company-status.util.spec.ts` :: [SPEC 15.1 15.2] transitions ACTIVE -> FROZEN once past subEnd (وحدة)<br>`api/src/common/tenant/company-status.util.spec.ts` :: [SPEC 15.1] transitions FROZEN -> STOPPED after the 30-day grace period (وحدة) |
| 15.2 | تاريخ انتهاء الاشتراك | ✅ | ✅ | `api/src/common/tenant/company-status.util.spec.ts` :: [SPEC 15.1 15.2] stays ACTIVE while subscription has not ended (وحدة)<br>`api/src/common/tenant/company-status.util.spec.ts` :: [SPEC 15.1 15.2] transitions ACTIVE -> FROZEN once past subEnd (وحدة)<br>`api/src/common/tenant/company-status.util.spec.ts` :: [SPEC 15.2] never auto-changes a company with no subscription end date (e.g. the developer template) (وحدة) |
| 15.3 | **اختيار النشاط عند التسجيل** | ⬜ | ⬜ | — |
| 15.4 | **نماذج مخصصة تظهر حسب النشاط** | ⬜ | ⬜ | — |
| 15.9 | ✅ **محسوم (2026-08-12)** — نموذج «رئيسي + إضافية». التفصيل تحت الجدول. | ⬜ | ⬜ | — |
| 15.5 | **تسعير شهري/سنوي حسب النشاط** | ⬜ | ⬜ | — |
| 15.6 | باقات جاهزة أو باقة يصممها العميل | ⬜ | ⬜ | — |
| 15.7 | تجربة مجانية | ✅ | ✅ | `api/test/auth-selfservice.e2e-spec.ts` :: [SPEC 1.7 15.7] registers a merchant with an immediate session, a trial, and full isolation (e2e) |
| 15.8 | تسعير معلن وشفاف | ⬜ | ⬜ | — |
| 30.1 | **نوعان:** مرتجع مبيعات ⇒ **إشعار دائن** · مرتجع مشتريات ⇒ **إشعار مدين** | ✅ | ✅ | `api/test/supplier-notes.e2e-spec.ts` :: [SPEC 30.1] ② إعادةُ ٤ إلى المورّد بإشعاره الدائن — تخرج من طبقتها الأصلية، والذمّةُ والمدخلاتُ والإقرارُ تنخفض بإشارتها (e2e) |
| 30.2 | **مرتبط بفاتورة أصلية إلزاماً** — لا مرتجع معلّق | ✅ | ✅ | `api/test/returns-wave-a.e2e-spec.ts` :: [SPEC 30.2] سطرُ المرتجع يشير إلى سطرٍ من الفاتورة الأصلية نفسها — لا من فاتورةٍ أخرى (e2e) |
| 30.3 | **إرجاع جزئي** مدعوم | ✅ | ✅ | `api/test/returns-wave-a.e2e-spec.ts` :: [SPEC 30.3] إرجاعٌ جزئي يعيد جزءه — ولا يُرجَع عبر إشعاراتٍ متتابعة أكثر ممّا بِيع (e2e) |
| 30.4 | **سليمة** → تعود للمخزون المتاح | ✅ | ✅ | `api/test/returns-wave-a.e2e-spec.ts` :: [SPEC 30.4] إشعارٌ دائن كامل يعيد البضاعة السليمة إلى الرفّ ويعكس تكلفتها بقيدٍ مستقل (e2e) |
| 30.5 | **تالفة** → مصروف تلف **بسبب إلزامي** | ✅ | ✅ | `api/test/inventory-write-offs.e2e-spec.ts` :: [SPEC 30.5] السبب إلزاميّ ويُقرأ من مصدره — والرمز المجهول يُرَدّ باسمه (e2e)<br>`api/test/inventory-write-offs.e2e-spec.ts` :: [SPEC 30.5] التسجيل لا يمسّ المخزون ولا الدفتر — والاعتماد هو الحدث، بقيدٍ بلا ضريبة (e2e) |
| 30.6 | **قابلة للإصلاح** → مخزون «قيد الفحص» **غير متاح للبيع** | ⬜ | ⬜ | — |
| 30.7 | **صلاحية منفصلة للتالف** — الكاشير يسجّل المرتجع **ولا يقرّر التلف** | 🟨 | ⬜ | — |
| 30.8 | الردّ **نقداً أو رصيداً** — وإن كانت الفاتورة **غير مسدَّدة فالخصم منها إلزاماً** | ✅ | ✅ | `api/test/returns-wave-a.e2e-spec.ts` :: [SPEC 30.8] لا ردٌّ نقدي على إشعارٍ لفاتورةٍ غير مسدَّدة — الخصم منها إلزاميّ (e2e)<br>`api/test/returns-wave-a.e2e-spec.ts` :: [SPEC 30.8] الفاتورة المسدَّدة: سندُ ردٍّ مستقل مربوطٌ بالإشعار، بمبلغٍ سالب ورقمٍ RFD — ومرةً واحدة (e2e) |
| 30.9 | **تقرير مرتجعات وتلف:** كم أُرجع · كم تلف · **ومن سجّله** | ✅ | ✅ | `api/test/returns-wave-a.e2e-spec.ts` :: [SPEC 30.9] تقرير المرتجعات: كم أُرجع · كم عاد إلى الرفّ وبأي تكلفة · كم رُدّ · ومن سجّله (e2e) |
| 30.10 | 🔴 **طابور المزامنة الأوفلاين يشمل الإشعارات** — مربوطاً بمهلة **24 ساعة** | ⬜ | ⬜ | — |
| 30.11 | 🔴 **الإشعار يمرّ بمسار `zatca.service` كاملاً** — ختم · عدّاد · سلسلة تجزئة. **لا مسار مخ | ✅ | ✅ | `api/test/zatca-credit-notes.e2e-spec.ts` :: [SPEC 30.11] a credit note takes an ordinary position in the one hash chain (e2e) |
| 16.1 | العقارات والوحدات | ✅ | ✅ | `api/test/contract-customer-link.e2e-spec.ts` :: [SPEC 16.1] ① عميلان بالاسم نفسِه بعقدين لا يندمجان — وهاتفُ كلٍّ محفوظ ومشتقٌّ على عقده (e2e)<br>`api/test/property-coordinates.e2e-spec.ts` :: [SPEC 16.1 16.17] stores coordinates on create and returns them in the list (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 16.1] roomDetails: stored on create, editable, returned in reads (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 16.1] bulk creation: prefix+count, all-or-nothing on collision with named clashes (e2e) |
| 16.2 | العقود وجداول الدفعات | ✅ | ✅ | `api/test/contract-renewal.e2e-spec.ts` :: [SPEC 16.2 16.10] creates a linked follow-on contract and leaves the original intact (e2e)<br>`api/test/contracts-tenant-isolation.e2e-spec.ts` :: [SPEC 16.2 16.6] creates a contract, generates an even installment schedule, and rejects an overlapping contract on the same unit (e2e)<br>`api/test/contracts-tenant-isolation.e2e-spec.ts` :: [SPEC 16.2 16.5] cancelling a contract shrinks its end date and cancels future unpaid installments while leaving already-due ones alone (e2e) |
| 16.3 | الأقساط والسداد الجزئي | ✅ | ✅ | `api/test/installment-partial-settlement.e2e-spec.ts` :: [SPEC 16.3] ① دفعةٌ جزئية ⇒ PARTIAL لا PAID — ويبقى في التذكيرات، ونسبةُ التحصيل تقرأ المقبوضَ لا القسطَ كلَّه (e2e) |
| 16.4 | الحجوزات بعربون | ✅ | ⬜ (دَين معلَن) | ⚠️ الحجوزات بعربون — الحجز مُثبَت (reservations-tenant-isolation.e2e-spec.ts:52) والعربون يُرسَل بلا أي expect عليه ولا أثرٍ محاسبي. يلزم اختبارٌ على العربون. |
| 16.5 | إلغاء العقد وتقصير المدة | ✅ | ✅ | `api/test/contract-cancellation-settlement.e2e-spec.ts` :: [SPEC 16.5 16.9] computes "all" from every installment still unpaid from the cancel date (e2e)<br>`api/test/contracts-tenant-isolation.e2e-spec.ts` :: [SPEC 16.2 16.5] cancelling a contract shrinks its end date and cancels future unpaid installments while leaving already-due ones alone (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 16.5] cancellation settlement lines: mismatch refused, matching lines stored on the contract (e2e) |
| 16.6 | منع الحجز المزدوج للوحدة | ✅ | ✅ | `api/test/contracts-tenant-isolation.e2e-spec.ts` :: [SPEC 16.2 16.6] creates a contract, generates an even installment schedule, and rejects an overlapping contract on the same unit (e2e)<br>`api/test/reservations-tenant-isolation.e2e-spec.ts` :: [SPEC 16.6] reserves a vacant unit and rejects a second active reservation on the same unit (e2e)<br>`api/test/reservations-tenant-isolation.e2e-spec.ts` :: [SPEC 16.6] rejects a contract on a reserved unit under a different name, but converts the reservation when the name matches (e2e) |
| 16.7 | **نوعا التأمين (إيجار / المنشأة)** | ✅ | ✅ | `api/test/contract-deposits.e2e-spec.ts` :: [SPEC 16.7] books a received deposit as a liability, not as revenue (e2e)<br>`api/test/contract-deposits.e2e-spec.ts` :: [SPEC 16.7] keeps the two deposit types independent (e2e)<br>`api/test/contract-deposits.e2e-spec.ts` :: [SPEC 16.7] refunds the whole amount when there is nothing to deduct (e2e) |
| 16.8 | التصرف بالتأمين ببنود (نوع · مبلغ · سبب) | ✅ | ✅ | `api/test/contract-deposits.e2e-spec.ts` :: [SPEC 16.8] splits a settlement across receivable, income and cash (e2e)<br>`api/test/contract-deposits.e2e-spec.ts` :: [SPEC 16.8] refuses deductions larger than the deposit (e2e)<br>`api/test/contract-deposits.e2e-spec.ts` :: [SPEC 16.8] rejects a deduction with no reason and a non-positive deposit (e2e) |
| 16.9 | تسوية إلغاء العقد (مبلغ/دفعات/الكل) | ✅ | ✅ | `api/test/contract-cancellation-settlement.e2e-spec.ts` :: [SPEC 16.9] posts an agreed amount to other income, never to rent (e2e)<br>`api/test/contract-cancellation-settlement.e2e-spec.ts` :: [SPEC 16.9] computes the settlement from the next N unpaid installments (e2e)<br>`api/test/contract-cancellation-settlement.e2e-spec.ts` :: [SPEC 16.5 16.9] computes "all" from every installment still unpaid from the cancel date (e2e) |
| 16.10 | **التجديد كعقد «قادم مؤكَّد»** | ✅ | ✅ | `api/test/contract-renewal.e2e-spec.ts` :: [SPEC 16.2 16.10] creates a linked follow-on contract and leaves the original intact (e2e)<br>`api/test/contract-renewal.e2e-spec.ts` :: [SPEC 16.10] marks a future renewal UPCOMING, not DUE (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 16.10] upcoming contract flips the unit to 'upcoming' — stronger than a plain reservation (e2e) |
| 16.11 | رقم عقد يدوي عند التجديد | ✅ | ✅ | `api/test/contract-renewal.e2e-spec.ts` :: [SPEC 16.11] accepts a manually supplied contract number and rejects a duplicate (e2e) |
| 16.12 | ترحيل التأمين للعقد المجدَّد | ✅ | ✅ | `api/test/contract-renewal.e2e-spec.ts` :: [SPEC 16.12] carries a held deposit onto the renewal without posting anything (e2e) |
| 16.13 | المطالبات (Claims) | ✅ | ✅ | `api/test/contract-claims.e2e-spec.ts` :: [SPEC 16.13] becomes a receivable the moment it is raised, credited to other income (e2e)<br>`api/test/contract-claims.e2e-spec.ts` :: [SPEC 16.13] clears the receivable into cash when collected (e2e)<br>`api/test/contract-claims.e2e-spec.ts` :: [SPEC 16.13] reverses the income when a claim is written off, and keeps the record (e2e) |
| 16.14 | نماذج الاستلام والتسليم | ✅ | ✅ | `api/test/contract-handovers.e2e-spec.ts` :: [SPEC 16.14] starts as a draft with its items and meter readings (e2e)<br>`api/test/contract-handovers.e2e-spec.ts` :: [SPEC 16.14] lets a draft be edited, replacing the item list wholesale (e2e)<br>`api/test/contract-handovers.e2e-spec.ts` :: [SPEC 16.14] keeps delivery and receipt as separate forms on the same lease (e2e) |
| 16.15 | قفل النموذج بعد التوقيع + ختم زمني | ✅ | ✅ | `api/test/contract-handovers.e2e-spec.ts` :: [SPEC 11.5 16.15] stamps the signing time from the server clock, not the caller (e2e)<br>`api/test/contract-handovers.e2e-spec.ts` :: [SPEC 11.5 16.15] refuses every change to a signed form (e2e)<br>`api/test/realestate-completion.e2e-spec.ts` :: [SPEC 11.5 16.15] handover photos: attach to an item, then signing locks add AND remove (16.15) (e2e) |
| 16.16 | التقبيل (Key Money) | ✅ | ✅ | `api/test/contract-key-money.e2e-spec.ts` :: [SPEC 16.16] books key money received as income, not as a refundable deposit (e2e)<br>`api/test/contract-key-money.e2e-spec.ts` :: [SPEC 16.16] capitalizes key money paid instead of expensing it in one month (e2e)<br>`api/test/contract-key-money.e2e-spec.ts` :: [SPEC 16.16] keeps both directions on the same contract as separate records (e2e) |
| 16.17 | خريطة العقارات | ✅ | ✅ | `api/test/property-coordinates.e2e-spec.ts` :: [SPEC 16.1 16.17] stores coordinates on create and returns them in the list (e2e)<br>`api/test/property-coordinates.e2e-spec.ts` :: [SPEC 16.17] adds coordinates to a property that had none (e2e) |
| 16.18 | **الصيانة: من البلاغ حتى الإغلاق** ✅ (v20) · mad-app ✅ | — | — | — |
| 16.19 | أولوية البلاغ (عاجل · مرتفع · عادي) ✅ (v20) · mad-app ✅ | — | — | — |
| 16.20 | **تذكيرات تحصيل الإيجار التلقائية** ✅ (v20) · mad-app ✅ | — | — | — |
| 16.21 | تصعيد التأخير للمدير العام بعد X يوم ✅ · mad-app ✅ | — | — | — |
| 16.22 | **معدل الإشغال** (مشغول/شاغر/محجوز) · mad-app ✅ | — | — | — |
| 16.23 | **نسبة التحصيل في الوقت المحدد** · mad-app ✅ | — | — | — |
| 16.24 | العقود المنتهية خلال 30/60/90 يوم · mad-app ✅ | — | — | — |
| 16.25 | الضمانات ✅ (v20) · mad-app ✅ | — | — | — |
| 16.26 | العروض العقارية · mad-app ✅ | — | — | — |
| 16.27 | استيراد عقد من PDF بالذكاء الاصطناعي · mad-app ✅ | — | — | — |
| 16.28 | أهلية الإجراء القضائي (إيجار) · mad-app ✅ | — | — | — |
| 16.29 | **جديد (v20):** كاميرات مراقبة مرتبطة بعقار/وحدة/فرع + عرض مباشر من صفحة الموقع · mad-app  | — | — | — |
| 17.1 | خريطة الطاولات (متاح · مشغول · طلب جديد) | — | — | — |
| 17.2 | **الصالات المتعددة** فوق الطاولات | — | — | — |
| 17.3 | شاشة النادل والطلبات | — | — | — |
| 17.4 | حالات الطلب (جديد · تحضير · جاهز · سُلّم) | — | — | — |
| 17.5 | **QR على الطاولة → الطلب من الجلسة** | — | — | — |
| 17.6 | رقم الطاولة مضمَّن في QR | — | — | — |
| 17.7 | **حجز الطاولات مسبقاً** | — | — | — |
| 17.8 | **إدارة طوابير الانتظار** | — | — | — |
| 17.9 | تذكرة المطبخ («بدون بصل») | — | — | — |
| 17.10 | توجيه الطباعة حسب القسم (ساخن/بارد) | — | — | — |
| 17.11 | الوصفات وتكلفة الطبق | — | — | — |
| 17.12 | **تخصيص الأوقات** (فطور/غداء) | — | — | — |
| 17.13 | **الطلب المجدول** | — | — | — |
| 17.14 | **الطلب من السيارة (Curbside)** | — | — | — |
| 17.15 | الاستلام من الفرع | — | — | — |
| 17.16 | فواتير معلَّقة | — | — | — |
| 17.17 | تقييم الخدمة بعد الطلب | — | — | — |
| 18.1 | ملفات المرضى | — | — | — |
| 18.2 | إنشاء وصفة طبية إلكترونية | — | — | — |
| 18.3 | سجل الوصفات | — | — | — |
| 18.4 | الاسم العلمي مقابل التجاري + بدائل | — | — | — |
| 18.5 | تعليمات الاستخدام وتكرار الصرف | — | — | — |
| 18.6 | التشخيص والإجراء الطبي | — | — | — |
| 18.7 | **تكامل نفيس (nphies)** — تأمين | — | — | — |
| 18.8 | **تكامل وصفتي (Wasfaty)** | — | — | — |
| 18.9 | **تكامل رصد (RSD)** — تتبّع الأدوية | — | — | — |
| 18.10 | المواعيد (عيادات) | — | — | — |
| 18.11 | التحاليل والنتائج (مختبرات) | — | — | — |
| 19.1 | نقاط البيع (POS) ✅ (v20 — وردية كاملة: فتح/إغلاق/جرد نقدي) | — | — | — |
| 19.2 | شاشة أصناف بتبويبات وشبكة ✅ (v20) | — | — | — |
| 19.3 | كوبونات الخصم | — | — | — |
| 19.4 | فتح درج النقدية · إعادة طباعة | — | — | — |
| 19.5 | الباركود ومسحه 🟨 (v20 — توليد/طباعة باركود فقط، لا مسح بالكاميرا) | — | — | — |
| 19.6 | أسعار الجملة مقابل التجزئة | — | — | — |
| 19.7 | برنامج الولاء والنقاط | — | — | — |
| 19.8 | **بطاقة ولاء في Apple/Google Wallet** | — | — | — |
| 19.9 | رصيد كاش باك | — | — | — |
| 19.10 | العضويات | — | — | — |
| 20.1 | الغرف وأنواعها | — | — | — |
| 20.2 | الحجوزات والليالي | — | — | — |
| 20.3 | تسجيل الدخول والخروج | — | — | — |
| 20.4 | خدمات إضافية على الغرفة | — | — | — |
| 21.1 | أسطول المركبات/المعدات | — | — | — |
| 21.2 | حالة المركبة (متاح · بالطريق · بالورشة) | — | — | — |
| 21.3 | عقود التأجير وفتراتها | — | — | — |
| 21.4 | أوامر التشغيل (مفتوحة · مغلقة) | — | — | — |
| 21.5 | تتبّع السائقين وإحصاءاتهم | — | — | — |
| 21.6 | جدولة الصيانة | — | — | — |
| 21.7 | معارض البيع (أرقام هيكل · نقل ملكية) | — | — | — |
| 22.1 | القضايا/المشاريع ومراحلها | — | — | — |
| 22.2 | الفوترة بالساعة | — | — | — |
| 22.3 | أوامر العمل | — | — | — |
| 22.4 | المستندات المرتبطة بالقضية | — | — | — |
| 23.1 | الحجز الإلكتروني 24/7 | — | — | — |
| 23.2 | تقويم المواعيد لكل موظفة | — | — | — |
| 23.3 | الخدمات وأسعارها ومدتها | — | — | — |
| 23.4 | عمولات الموظفين | — | — | — |
| 23.5 | تطبيق جوال للعميلات | — | — | — |
| 23.6 | الاشتراكات (باقات خدمات) | — | — | — |
| 24.1 | حجوزات التذاكر | — | — | — |
| 24.2 | **ربط Amadeus · Galileo · Sabre** | — | — | — |
| 24.3 | تقارير معتمدة من هيئة الزكاة | — | — | — |
| 25.1 | أوامر التصنيع | — | — | — |
| 25.2 | قائمة المواد (BOM) | — | — | — |
| 25.3 | تكلفة الإنتاج | — | — | — |
| 26.1 | **منيو/متجر عام حسب النشاط** | — | — | — |
| 26.2 | صفحة لكل فرع | — | — | — |
| 26.3 | سلة الشراء والدفع الإلكتروني | — | — | — |
| 26.4 | **موقع وتطبيق باسم العميل وهويته** | — | — | — |
| 26.5 | منتجات رقمية ودورات وحجوزات | — | — | — |
| 26.6 | التقسيط (تمارا · تابي) | — | — | — |
| 26.7 | متوافق مع متطلبات وزارة التجارة | — | — | — |
| 27.1 | نقاط البيع (كاشير) ✅ (v20) · **mad-app ✅** — كاشير كامل (ورديات/أوفلاين idempotent/دفع مقس | — | — | — |
| 27.2 | QR من الطاولة | — | — | — |
| 27.3 | **مركز الاتصال** (طلب هاتفي + رابط دفع) | — | — | — |
| 27.4 | تطبيقات التوصيل (هنقرستيشن...) | — | — | — |
| 27.5 | منصات التجارة (سلة...) | — | — | — |
| 27.6 | **مصدر الطلبية مسجَّل في كل طلب** · mad-app 🟨 للقناة الحيّة (posShiftId/paymentMethod/cli | — | — | — |
| 27.7 | توجيه الطلب تلقائياً للفرع الصحيح 🟨 (v20 — كل طلب يحمل branchId من سياق الوردية/الطاولة،  | — | — | — |
| 28.1 | **ZATCA (فاتورة)** | 🟨 | ⬜ | — |
| 28.2 | **واثق (Wathq)** *(بند جديد)* | ⬜ | ⬜ | — |
| 28.3 | **مُدد** | ⬜ | ⬜ | — |
| 28.4 | **إيجار (Ejar)** | ⬜ | ⬜ | — |
| 28.5 | نفيس (nphies) | ⬜ | ⬜ | — |
| 28.6 | وصفتي (Wasfaty) | ⬜ | ⬜ | — |
| 28.7 | رصد (RSD) | ⬜ | ⬜ | — |
| 28.8 | GS1 مركز الترقيم السعودي | ⬜ | ⬜ | — |
| 28.9 | وزارة التجارة | ⬜ | ⬜ | — |
| 28.10 | يسر (Yesser / GSB) | ⬜ | ⬜ | — |
| 28.11 | **Moyasar** (أو بديل مرخَّص من ساما) | — | — | — |
| 28.12 | **Lean Technologies** (أو Tarabut) | — | — | — |
| 28.13 | تمارا / تابي | — | — | — |
