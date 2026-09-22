# مراجعة كود Mad App، الجزء الرابع (لقطة 2026-09-19)

النطاق: الواجهة، المصادقة ودورة الرموز، التسجيل لدى الهيئة والتصدير والأرشفة، الاشتراكات. ثم الأسئلة الثلاثة. ثم العلاجات البنيوية الخمسة بتفصيل التنفيذ، وترتيب تنفيذ مقترح. الأرقام من لقطة 2026-09-19. مسارات الواجهة تحت `apps/web/src/`.

## ١. الواجهة

### ١.١ أرقام تُجمع في الشاشة بدل قراءتها من الخادم

- `pages/DashboardPage.tsx:46` و`:47` و`:50`: (الجزء الثالث) إيراد شامل الضريبة، مصروف يشمل الملغى، ذمم تتجاهل المقبوض الجزئي والإشعارات، والخادم يرسل `outstanding`.
- `pages/customers/CustomerDetailModal.tsx:11` و`:14` و`:17`: بطاقة العميل تحسب "المفوتر" و"المسدد" و"الرصيد" من قائمة الفواتير: المسدد = مجموع فواتير حالتها `PAID` كاملة (سند 500 على فاتورة 1000 يُحسب صفراً، وفاتورة عُلّمت `PAID` بيد تُحسب مسددة)، الرصيد = فواتير غير `PAID` كاملة (`PARTIAL` بقيمتها كلها)، ولا ذمم إيجار، ولا سندات على الحساب بلا تخصيص. إعادة الإنتاج: عميل بفاتورة 1000 وسند 400؛ البطاقة تقول مسدد 0 ورصيد 1000، والخادم يقول `outstanding` 600.
- `pages/suppliers/SupplierDetailModal.tsx:21` و`:23`: المسدد للمورد = مجموع `allocated` فقط؛ سند صرف بلا تخصيص لا يُحسب مسدداً، فرصيد المورد يبقى مرتفعاً بعد الدفع حتى يُخصص يدوياً.
- `pages/pos/PosPage.tsx:127` إلى `:129`: إجمالي الكاشير `subtotal × 0.15` بلا تدوير على البند، والخادم يدوّر صافي كل بند ثم الضريبة مرة واحدة (`common/money/totals.ts`). العميل يرى إجمالياً ويدفع عليه ثم تُحفظ فاتورة بإجمالي آخر بهللة، وفي `SPLIT` يرسل الكاشير أجزاءً تساوي إجمالي الشاشة فيُرد `pos_split_mismatch` (`pos.service.ts:64`) على سلة بأسعار ثلاثية الكسور. إعادة الإنتاج: ثلاثة بنود بسعر 0.335.
- `pages/invoices/InvoiceBuilderView.tsx:65` و`:66`، `pages/quotes/QuoteModal.tsx:41` و`:42`، `pages/invoices/DebitNoteModal.tsx:30` و`:31`: المعاينة بالخوارزمية نفسها غير المدوَّرة. `packages/shared/src/index.ts` لا يحمل دالة مجاميع، فالمنطق مكرر في الجهتين بطريقتين.
- `pages/accounts/AccountsPage.tsx:119`: مجموع كل مجموعة = مجموع `balance` لكل حساباتها بما فيها الحسابات الأم إن كان الدليل شجرياً بأرصدة على الأم؛ يُفحص المخطط، وإن كانت الأم تحمل رصيداً مجمعاً فالمجموع مضاعف.
- `pages/contracts/ContractDetailModal.tsx:229` و`:231`: معاينة التسوية عند الإلغاء تجمع `amount` الأقساط كاملة لا الباقي منها (تطابق الخادم في `contracts.service.ts:396`، والخطأ في الجهتين).
- `pages/hr/HrPage.tsx:110`: أيام الإجازة المعتمدة تُجمع من `r.days` القادم من الخادم؛ سليم، يُذكر للتمييز.

### ١.٢ رقم يُعرض بمعنى غير معناه

- `pages/reports/ReportsPage.tsx:530` و`:531` (رؤوس "رصيد مدين"/"رصيد دائن") مع `:546`: القيمة صافي حركة الفترة (`reports.service.ts:740`)، والرأس يقول رصيد.
- `pages/reports/ReportsPage.tsx:277`: "الميزانية غير متوازنة، تحقق من القيود المرحلة" تُعرض دائماً بعد أول بيع (الجزء الثالث)؛ الرسالة تتهم القيود والعطل في التقرير.
- `pages/reports/ReportsPage.tsx:325`: "صافي التغير في النقدية" وهو ليس تغير النقدية (`reports.service.ts:597`).
- `pages/reports/ReportsPage.tsx:483` و`:496`: "الرصيد الدفتري مقابل المعروض" والفرق يُلوَّن كتأخير (`badge overdue`) بينما مصدره قيد رسوم يدوي.
- `pages/invoices/InvoiceListView.tsx:119` مع `payments.service.ts:509`: مرشح "متأخرة" يعرض فقط ما مسّه سند بعد استحقاقه؛ فاتورة لم تُلمس تبقى "مستحقة" إلى الأبد. إعادة الإنتاج: فاتورة بتاريخ استحقاق أمس بلا سند؛ لا تظهر تحت "متأخرة".
- `lib/format.ts:4`: `fmt(undefined)` و`fmt(NaN)` تعيد `0.00`. أي حقل يسقط من الاستجابة يُعرض صفراً لا فراغاً ولا خطأ؛ الجدول يبدو مكتملاً وهو ناقص.
- `pages/payments/PaymentsPage.tsx:37`: "غير المخصص" = المبلغ ناقص مجموع التخصيصات، ولسند العكس يُعرض رقم سالب بلا وسم أنه عكس.

### ١.٣ شاشات تسقط أو تعرض بيانات ناقصة بلا تنبيه

- لا معالج أخطاء عام: `api/client.ts` يعترض 401 فقط (`:101`)، ولا `toast` ولا تسجيل لبقية الأخطاء، و`components/ErrorBoundary.tsx` يلتقط أخطاء العرض لا رفض الوعود.
- 18 صفحة تحمّل بياناتها بـ `Promise.all(...).then(...).finally(...)` بلا `catch`: `DashboardPage.tsx:22`، `invoices/InvoicesPage.tsx`، `contracts/ContractsPage.tsx`، `reports/ReportsPage.tsx`، `journal/JournalPage.tsx`، `transactions/TransactionsPage.tsx`، `customers/CustomersPage.tsx`، `suppliers/SuppliersPage.tsx`، `inventory/StockLevelsPage.tsx`، `inventory/StockMovementsPage.tsx`، `properties/PropertiesPage.tsx`، `units/UnitsPage.tsx`، `maintenance/MaintenancePage.tsx`، `branches/BranchesPage.tsx`، `settings/SettingsPage.tsx`، `companyUsers/CompanyUsersPage.tsx`، `warranties/WarrantiesPage.tsx`، `developer/DeveloperPanelPage.tsx`. عند 500 أو مهلة أو `P2028` من الخادم: `loading` يصير `false` والقوائم تبقى فارغة، فتُعرض "لا توجد فواتير" أو لوحة بأصفار. إعادة الإنتاج: أوقف الخادم بعد الدخول وافتح أي صفحة منها.
- `pages/settings/CashDrawersCard.tsx:33` و`:36`، `pages/settings/IntegrationsCard.tsx:37`، `pages/settings/SupportAccessCard.tsx:28`، `pages/reports/ReceivablesAgingSection.tsx:41` و`:42`: `.catch(() => {})` صريح؛ قائمة الفروع أو العملاء في مرشح الأعمار تبقى فارغة بلا كلمة.
- `pages/DashboardPage.tsx:22`: يجلب كل الفواتير وكل المشتريات (`GET /invoices` بلا صفحات، `invoices.service.ts:120`) ليجمع منها؛ عند عشرة آلاف فاتورة تتعدى المعاملة خمس ثوانٍ فيعود 500، فتُعرض لوحة بأصفار (البند السابق). اللوحة الأولى هي أول ما ينكسر بالنمو.
- `pages/invoices/InvoiceListView.tsx` و`pages/purchases`: القوائم كاملة في الذاكرة ثم `Pager` في الشاشة؛ الصفحات وهمية.

### ١.٤ صلاحيات تفترضها الشاشة ولا يفحصها الخادم، والعكس

- `pages/branches/BranchesPage.tsx:14` (`canManage = actorType === 'COMPANY'`) مقابل `branches.controller.ts` بلا `@RequiresScreen` ولا فحص مالك: الشاشة تخفي الأزرار عن الموظف، والخادم يقبل `POST /branches` منه.
- `pages/companyProfile/CompanyProfilePage.tsx:19` (`canEdit`) مقابل `company-profile.controller.ts` `@Patch()` بلا فحص: الموظف يعدل `vatNumber` بطلب مباشر.
- `pages/settings/SettingsPage.tsx:524` إلى `:527` (الأدراج والتكاملات والدعم للمالك فقط) مقابل `cash-drawers.controller.ts` و`integrations.controller.ts` بلا شاشة: الأولى بلا فحص خادم، الثانية تُفحص في الخدمة (يُتحقق).
- العكس: `auth/PermissionsContext.tsx:134` تعرّف `can(screen, action)` ولا تستعملها إلا `components/AssignTaskButton.tsx:46`. كل أزرار الإنشاء والتعديل والحذف في الصفحات تظهر لموظف يملك `view` فقط، ويملأ النموذج ثم يقرأ 403. الخادم يفحص (`@RequiresAction`) والشاشة لا تعرف.
- `pages/invoices/InvoicesPage.tsx:241` (`canSubmitToZatca` للمالك) مقابل `zatca.service.ts:155` `assertIsCompanyOwner`: متطابقان، يُذكر للتمييز.
- `routes/ScreenGuard.tsx:14` يحرس الشاشات بـ `canSee`؛ المتحكمات بلا `@RequiresScreen` (`currencies`، `branches`، `cash-drawers`، `company-profile`، `files`، `activities`) تقبل من كل الشاشات، فالحارس في الواجهة أضيق من الخادم.

## ٢. المصادقة ودورة الرموز

- `auth/auth.service.ts:151` إلى `:157` مع `api/client.ts:73`: الرمز المتجدد أحادي الاستعمال، وإعادة استعماله تبطل كل جلسات الهوية. مشاركة الوعد في `client.ts:85` تمنع السباق داخل علامة تبويب واحدة فقط؛ تبويبان يُعاد تحميلهما معاً (أو تطبيق مثبت وتبويب) يرسلان الكوكي نفسه في اللحظة نفسها، الثاني يُقرأ "معاد استعماله" فتُبطل الجلستان وتُطرد كل الأجهزة. إعادة الإنتاج: افتح تبويبين، اترك 15 دقيقة، أعد تحميلهما معاً.
- `auth/auth.service.ts:163` ثم `buildSessionFromIdentity`: الإبطال والإصدار في كتابتين بلا معاملة؛ سقوط الثانية (مهلة قاعدة) يترك المستخدم بلا رمز صالح ويظهر له "انتهت الجلسة" بلا سبب.
- `auth/auth.service.ts:204`: `logout` يبطل الرمز المقدم فقط؛ لا "تسجيل الخروج من كل الأجهزة"، ولا عرض للجلسات.
- `company-users/company-users.service.ts:139`: المالك يغير كلمة مرور الحساب الفرعي ولا تُبطل رموزه المتجددة (`refresh_tokens` لا تُمس). موظف غادر وغُيّرت كلمته يبقى داخلاً 30 يوماً ما لم يُجمَّد. `resetPassword` (`auth.service.ts:290` تقريباً) تبطلها، والمسار الثاني لا.
- `.env.production.example:16`: `JWT_REFRESH_TTL=30d` مع الدوران عند كل تجديد؛ الرمز المتجدد يتجدد بلا سقف مطلق، فجلسة نشطة لا تنتهي أبداً. لا `absoluteExpiresAt` على `refresh_tokens`.
- `auth/auth.controller.ts:24`: حد 10 محاولات بالدقيقة لكل IP و`app.set('trust proxy', 1)` (`main.ts:28`)؛ صحيح خلف وكيل واحد. `ThrottlerModule.forRoot` (`app.module.ts:90`) بتخزين في الذاكرة، فالحد يتضاعف بعدد نسخ الخادم، ولا قفل على الحساب نفسه: 10 محاولات × كل IP على اسم مستخدم واحد.
- `auth/auth.service.ts:129` و`:432`: تأخير كلمة وهمية لمنع تمييز الحسابات بالزمن؛ سليم، يُذكر للتمييز.
- `auth/auth.service.ts:322` تقريباً `deliverPasswordReset`: لا بريد إلا للمالك (`actorType === 'COMPANY'`)؛ الموظف الذي ينسى كلمته لا مسار له إلا المالك، وهذا مقصود على الأرجح لكن الشاشة `pages/ResetPasswordPage.tsx` لا تقوله.
- وضع الدعم (`tenant.guard.ts:48` إلى `:75`): مقيد بمنحة معتمدة ومنتهية الأجل وطالبها وحده و`GET` فقط وسجل دخول. سليم بنيوياً، مع الملاحظة السابقة أن `GET /files/download-url` إخراج ملفات.

## ٣. التسجيل لدى الهيئة والتصدير والأرشفة

- `zatca/zatca-onboarding.service.ts:413` إلى `:419` (تعليق) و`prisma/schema.prisma` `ZatcaCredential`: لا حقل لانتهاء الشهادة ولا قراءة لـ `notAfter` ولا تنبيه؛ الشهادة الإنتاجية تنتهي (سنة عادة) وأول علامة هي رفض كل الفواتير. الدين معلن في التعليق، والأثر أن كل مبيعات يوم كامل تُرد قبل أن يعرف أحد.
- `zatca/zatca-onboarding.service.ts:307` إلى `:392` `runComplianceChecks`: ست عينات بسلسلة `PIH` مستقلة، ثم الإنتاج يبدأ من `MAX(zatcaIcv)` على الفواتير (`hash-chain.util.ts:60`) أي 1. صحيح.
- `zatca/zatca-onboarding.service.ts:159` و`:171`: `start` يُرفض إن وُجدت شهادة إنتاجية، فلا مسار لإعادة التسجيل بعد انتهاء الشهادة إلا تدخل يدوي في القاعدة.
- `export/export.service.ts:60` و`:106`: التصدير الكامل في معاملة واحدة بلا `timeout` مخصص (5 ثوانٍ) ويُعاد `JSON` واحداً في الاستجابة؛ منشأة بمئة ألف صف تتجاوز المهلة أو الذاكرة. إعادة الإنتاج: `GET /export` على منشأة التطوير الكبيرة.
- `export/export-scope.ts:28`: `IntegrationConnection` تُصدَّر بحقل `credentials` مشفراً بمفتاح الخادم؛ لا يفيد العميل ويسرّب شكل السر إلى الأرشيف المحفوظ حتى `retainUntil`. يُضاف إلى `EXPORT_EXCLUSIONS` أو يُقنَّع.
- `export/company-archive.service.ts:210`: ملفات `XML` الموقعة تُسمى برقم الفاتورة `safeName(no)`؛ رقمان متطابقان بعد تنظيف المحارف (نادر) يتداخلان.
- `personal-data-erasure.service.ts:120` مع `company-archive.service.ts:162`: الأرشيف يُنتج قبل المحو ويبقى حتى نهاية الاحتفاظ بهواتف ممحوة من القاعدة (الجزء الثالث).

## ٤. الاشتراكات

- `subscription/subscription.service.ts:74` إلى `:93` مع `dto/renew-subscription.dto.ts` (`@Max(36)`): `POST /subscription/renew` يمدد الاشتراك حتى 36 شهراً بلا دفع ولا سجل دفع، ويعيد الحالة `ACTIVE`، والشاشة `pages/subscription/SubscriptionPage.tsx:98` تسميه "تجديد الاشتراك". التعليق يقول الدفع خطوة مؤجلة؛ أثره اليوم أن كل مالك يجدد لنفسه مجاناً بلا حد على التكرار. إعادة الإنتاج: اضغط "تجديد 36 شهر" ثلاث مرات.
- `common/tenant/company-status.util.ts:33` و`auth.service.ts:181` تقريباً: حالة `FROZEN`/`STOPPED` تُقيَّم عند الدخول والتجديد فقط؛ جلسة مفتوحة لا تُجمَّد حتى ينتهي رمز الوصول (15 دقيقة) ثم يعيد الحارس القراءة. مقبول، يُذكر للدقة.
- `subscription.service.ts:74`: `assertOwner` يفحص `actorType` ولا يفحص `status !== 'CLOSED'` هنا؛ الحارس يمنعه (`tenant.guard.ts:129`). سليم بطبقة واحدة.

## ٥. الأسئلة الثلاثة

### الرقم الذي يُبنى عليه قرار ولا يطابق الدفتر

بترتيب الأثر:
١. `DashboardPage.tsx:46` و`:50`: إيراد وذمم اللوحة.
٢. `CustomerDetailModal.tsx:14` و`:17`: مسدد ورصيد العميل قبل منح ائتمان أو ملاحقة.
٣. `ReportsPage.tsx:546`: "رصيد" ميزان المراجعة.
٤. `ReportsPage.tsx:325`: "صافي التغير في النقدية".
٥. `InvoiceListView.tsx:119`: قائمة "متأخرة" ناقصة، والملاحقة تُبنى عليها.
٦. `SupplierDetailModal.tsx:23`: مسدد المورد بلا السندات غير المخصصة، فيُدفع مرتين.
٧. `PosPage.tsx:129`: إجمالي الشاشة يخالف الفاتورة بهللة، والدرج يُسوَّى على الفاتورة.
٨. `lib/format.ts:4`: أي رقم ناقص يُعرض صفراً.

### ما يعمل في الشاشة ولا يعمل في الخادم أو العكس

- الشاشة تحسب والخادم يحسب بطريقة أخرى: المجاميع (`InvoiceBuilderView`، `QuoteModal`، `DebitNoteModal`، `PosPage`) مقابل `computeDocumentTotals`؛ الذمم (`Dashboard`، `CustomerDetailModal`) مقابل `outstandingOf`؛ التسوية (`ContractDetailModal:229`) مقابل `resolveSettlementAmount` (متطابقان في الخطأ).
- الشاشة تخفي والخادم يقبل: `BranchesPage:14`، `CompanyProfilePage:19`، `SettingsPage:524`.
- الخادم يمنع والشاشة تعرض: كل أزرار `add`/`edit`/`delete` لموظف بـ `view` (`PermissionsContext:134` غير مستعملة).
- الشاشة ترشح والخادم لا يحدّث: "متأخرة".
- الشاشة تعرض `Pager` والخادم يرسل الكل.
- الشاشة تقول "تجديد الاشتراك" والخادم يمدد بلا دفع.

### شاشات تفترض صلاحية لا يفحصها الخادم

`BranchesPage`، `CompanyProfilePage`، `SettingsPage` (الأدراج)، وكل ما يمر بـ `currencies` و`activities` و`files` (لا شاشة في الواجهة تخفيها أصلاً، والخادم لا يفحصها؛ الصلاحية مفترضة في الطرفين ومفحوصة في أيهما لا).

## ٦. العلاجات البنيوية بتفصيل التنفيذ

### ٦.١ العزل بمفتاح مركب

**الحصر**: 85 نموذجاً مستأجراً و146 علاقة بين نموذجين مستأجرين (محسوبة من `schema.prisma`). ليس كلها تحتاج مفتاحاً مركباً؛ التي تحتاجه هي التي يصل معرّفها من جسم الطلب أو من مستند آخر. من القائمة الكاملة:

الأهداف التي تُحقن من الطلب (المرحلة الأولى، 12 جدولاً):
`customers` (تشير إليها `invoices`، `payments`، `quotes`، `contracts`، `journal_lines`)، `suppliers` (`purchases`، `supplier_payments`، `warranties`، `journal_lines`)، `products` (`invoice_lines`، `purchase_lines`، `quote_lines`، `stock_movements`، `inventory_layers`، `stock_batches`، `inventory_write_offs`)، `warehouses` (`stock_movements` بعمودين، `goods_receipts`، `inventory_layers`، `inventory_write_offs`، `branches`)، `banks` (`payments`، `supplier_payments`، `rent_payments`، `bank_transactions`)، `accounts` (`journal_lines`، `banks`، `cash_drawers`، `journal_entries.openingForAccountId`)، `branches` (15 مرجعاً)، `units` و`properties` (`contracts`، `reservations`، `maintenance_requests`، `warranties`، `journal_lines`)، `contracts` (10 مراجع)، `contract_installments` (`rent_payments`، `rent_accruals`، `rent_reminders`)، `invoices` (`payment_allocations`، `pos_payments`، `quotes.convertedInvoiceId`، `invoices.relatedInvoiceId`، `invoices.replacesInvoiceId`، `payments.refundsInvoiceId`)، `purchases` (`supplier_payment_allocations`، `goods_receipts`، `landed_cost_distributions`، `purchase_attachments`).

المرحلة الثانية (تُملأ من الخادم لا من الطلب، تُغلق بالدالة لا بالمفتاح): `employees`، `business_activities`، `leave_types`، `egs_units`، `cash_drawers`، `pos_shifts`، `inventory_layers`، `stock_movements`.

**شكل الهجرة** (مثال `invoices.customerId`):

```sql
-- ١) مفتاح مرجعي مركب على الهدف: يجعل (companyId, id) قابلاً للإشارة إليه
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_key" UNIQUE ("companyId", "id");
-- ٢) على المصدر: المفتاح الأجنبي القديم يُستبدل بمركب
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customerId_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_same_company_fkey"
  FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

للأعمدة الاختيارية (`branchId`، `bankId`، `unitId`) `MATCH SIMPLE` الافتراضي يقبل `NULL` في أحد العمودين، وهذا المطلوب. قبل الهجرة استعلام فحص يُدرج في `ops/`:

```sql
SELECT i.id FROM invoices i JOIN customers c ON c.id = i."customerId" WHERE c."companyId" <> i."companyId";
```

يُنفَّذ على كل زوج قبل الهجرة؛ صف واحد يوقف النشر.

**في Prisma**: `@@unique([companyId, id])` على الهدف، والعلاقة `@relation(fields: [companyId, customerId], references: [companyId, id])`. Prisma يولّد المفتاح المركب من هذا التعريف مباشرة، فلا يلزم `SQL` يدوي إلا لتغيير الاسم. الحقول `companyId` تصبح جزءاً من العلاقة، فيتوقف `tenantScopeExtension` عن الحاجة لحقنها في `create` (تبقى للقراءة).

**ما ينكسر**:
- `Prisma.ModelUncheckedCreateInput` يبقى، لكن كل `create` يمرر `customerId` وحده يعمل ما دام `companyId` في الجسم؛ نمط `data: { companyId, customerId }` قائم في كل الخدمات، فالكسر التركيبي صفر تقريباً.
- الجداول التي تحمل علاقتين إلى الهدف نفسه (`stock_movements.warehouseId` و`toWarehouseId`) تحتاج مفتاحين مركبين بالعمود `companyId` نفسه؛ مسموح.
- `PermissionTemplate` ثنائي النطاق (`companyId` فارغ للعام) لا يدخل هذه الحزمة.
- `journal_lines` بخمسة أبعاد اختيارية: خمسة مفاتيح مركبة على جدول كبير؛ الكلفة فهارس إضافية (كل مفتاح مركب يحتاج فهرساً على `(companyId, customerId)` إلخ). مقبول، ويغلق `resolveParty` الذي يُفرغ الطرف بصمت.
- الاختبارات التي تربط عبر المنشآت عمداً (لا وجود لها حسب الفحص).
- الهجرة على قاعدة حية: `ADD CONSTRAINT ... NOT VALID` ثم `VALIDATE CONSTRAINT` في خطوة ثانية لتجنب قفل الجدول الطويل.

**الطبقة الثانية** (تُنفَّذ أولاً لأنها أرخص): دالة واحدة في `common/tenant/resolve-owned.util.ts`:

```ts
export async function resolveOwned<T extends keyof TenantDelegates>(tx, model: T, id: string, select?) {
  const row = await (tx[model] as any).findUnique({ where: { id }, select: select ?? { id: true } });
  if (!row) throw new NotFoundException(MSG[`${model}_not_found`]);
  return row;
}
```

تُستدعى لكل معرّف من `dto` قبل الكتابة. الحارس: قاعدة `ESLint` على الشجرة ترفض أي `create({ data: { ...Id: dto.` بلا استدعاء `resolveOwned` لنفس المعرّف في الدالة نفسها. المفتاح المركب يحرس ما يفوت الدالة.

### ٦.٢ نسخة واحدة تُقرأ

الأزواج بأسمائها، وأيها يُلغى وأيها يبقى مشتقاً:

| المخزَّن | الأصل | القرار |
|---|---|---|
| `accounts.balance` | مجموع `journal_lines` | يبقى **مشتقاً للفرز فقط**، ويُعاد حسابه بمهمة ليلية `UPDATE accounts SET balance = (SELECT ...)`، ويُمنع من كل تقرير (`balanceSheet`، `bankDifference`، `AccountsPage`) بحارس على الشجرة: لا `select: { balance }` خارج `accounts.service` |
| `banks.balance` | حساب البنك في الدفتر | **يُلغى**. الشاشة تقرأ رصيد الحساب المرتبط |
| `bank_transactions` (المرآة) | `journal_lines` على حساب البنك | **يُلغى كمرآة**، ويبقى الجدول لسطور كشف البنك المستوردة فقط (عندها تصير "التسوية" حقيقية) |
| `invoices.status` (`PAID`/`PARTIAL`/`OVERDUE`) | `payment_allocations` + `dueDate` | يبقى مشتقاً، **بمشغّل قاعدة** على `payment_allocations` (`AFTER INSERT/UPDATE/DELETE`) يعيد الحساب، ويُحذف من `UpdateInvoiceDto`؛ `OVERDUE` يُحسب عند القراءة من `dueDate` لا يُخزن |
| `installments.status` و`baseAccruedGross/Net/Tax` و`baseRecognized` | `rent_accruals` + `rent_payments` | الأربعة تبقى مشتقة **بمشغّل** على `rent_accruals` و`rent_payments`؛ يُمنع تحديثها من الشيفرة |
| `products.cost` | آخر `inventory_layers.unitCost` | يبقى مشتقاً للبطاقة، يُكتب من `createLayerFromMovement` وحدها |
| كمية المخزون (مجموع `stock_movements`) | `inventory_layers.qtyRemaining` + الاستهلاك المؤقت | الأصل هو الطبقات؛ الكمية تُشتق `SUM(qtyRemaining) - SUM(provisional open)` في `view` مادية `stock_levels` تُحدَّث بمشغّل، وتُحذف `computeStockQuantities` |
| `companies.status` (`FROZEN`/`STOPPED`) | `subEnd` + `frozenAt` | يبقى مشتقاً، يُحسب في الحارس عند كل طلب (قائم) وتُحذف الكتابة عند الدخول |
| `invoices.zatcaStatus` | جواب الهيئة | أصل. و`outbox_events.status` مشتق منه: صف الطابور يُختم `SENT` بقراءة حالة الفاتورة لا بنجاح النداء |
| `contracts.tenant` و`contracts.phone` | `customers.name/phone` | **يُلغى النسخ** (`customers.service.ts:61`)؛ العقد يقرأ العميل بالعلاقة، ويحتفظ بـ `tenantNameAtSigning` لغرض العقد المطبوع فقط |
| `pos_shifts.variance` | `pos_payments` + `openingFloat` + `declaredClosing` | يبقى مخزناً لأنه واقعة (ما أُعلن)، ويُحسب المتوقع عند القراءة |
| `document_sequences.last` | `MAX(no)` | أصل (صحيح)؛ يُلغى `highestSequenceOf` كبذرة بعد أول تشغيل |
| `purchases.status` (`PAID`) | `supplier_payment_allocations` | كالفواتير |

القاعدة الحاكمة: كل عمود في العمود الأول يُصنَّف في تعليق واحد `/** derived: source = ..., writer = ... */` على المخطط، وحارس على `dmmf` يقرأ التعليق ويرفض أي `update`/`create` لهذا الحقل خارج الكاتب المعلن (بالشجرة عبر `ESLint`، لا بالنص).

### ٦.٣ لا شبكة داخل معاملة: نمط الطابور عندنا

الحالي: `outbox.service.ts:111` يفتح معاملة، يقرأ، يطالب، يستدعي المرسل (شبكة + معاملات متداخلة)، يختم، يلتزم. الصحيح في أربع خطوات، كل خطوة معاملة قصيرة أو بلا معاملة:

```ts
// ① مطالبة قصيرة ملتزمة، صف واحد، قفل بلا انتظار
const [row] = await prisma.$queryRaw`
  UPDATE outbox_events SET status = 'DISPATCHING', "leaseUntil" = now() + interval '90 seconds',
         attempts = attempts + 1, "workerId" = ${workerId}
  WHERE id = (SELECT id FROM outbox_events
              WHERE status IN ('PENDING','DISPATCHING') AND "availableAt" <= now()
                AND ("leaseUntil" IS NULL OR "leaseUntil" < now())
              ORDER BY "availableAt" FOR UPDATE SKIP LOCKED LIMIT 1)
  RETURNING id, "companyId", type, payload, attempts`;
// ② الإرسال خارج أي معاملة، بمهلة
await zatca.deliverIssued(row.companyId, invoiceId, { signal: AbortSignal.timeout(20_000) });
// ③ الختم بكتابة مشروطة بالمستأجر والمالك
UPDATE outbox_events SET status='SENT', "sentAt"=now() WHERE id=$1 AND "workerId"=$2;
// ④ عند السقوط: PENDING مع availableAt = now() + backoff، أو FAILED بعد MAX_ATTEMPTS، بنفس الشرط
```

مع خمسة شروط خاصة بالهيئة:
- **الترتيب داخل وحدة الإصدار**: ZATCA تطلب `ICV` متتابعاً و`PIH` من السابق. فالمطالبة تُقيَّد بـ `egsUnitId` وتُنفَّذ واحدة في اللحظة لكل وحدة: `pg_advisory_xact_lock(hashtext('egs:' || egsUnitId))` في خطوة ①، ولا تُطالَب فاتورة `n+1` قبل أن تُختم `n` بجواب (`CLEARED`/`REJECTED`). هذا يحل تفرع `PIH` (الجزء الثاني) بالبنية لا بالحظ.
- **حجز `ICV`/`PIH` في معاملة قصيرة**: `claimAndBuild` (`zatca.service.ts:312`) يبقى معاملة، لكنها لا تحتوي توقيعاً ولا شبكة؛ `PIH` من الفاتورة ذات `ICV - 1` على الوحدة (`ORDER BY zatcaIcv DESC LIMIT 1` بلا شرط حالة).
- **التوقيع خارج المعاملة** ثم كتابة `STAMPED` مشروطة بـ `zatcaStatus = 'SUBMITTING' AND zatcaIcv = $icv`.
- **`fetch` بمهلة** `AbortSignal.timeout(20_000)` في `report` (`zatca.service.ts:582`) و`runComplianceChecks` و`requestProductionCertificate`.
- **حالة الهيئة أصل**: الطابور يُختم `SENT` عندما تصير الفاتورة `CLEARED`/`REJECTED` أياً كان من كتبها.

الحارس: قاعدة `ESLint` "لا `fetch`/`axios`/`this.zatca.*`/`this.files.*` داخل رد نداء ممرر إلى `runInTenantContext` أو `$transaction`". تُكتب بمحدد `AST` واحد وتُطبق على `outbox`، `zatca`، `attachments`، `deletion-requests`. و`withTransactionProbe` (`nested-transaction-probe.ts`) يتحول من "يبلغ" إلى "يرمي" في الاختبار و`NODE_ENV !== 'production'`.

ينطبق النمط نفسه على: `rent-accrual.service.ts:37` (معاملة لكل منشأة، لا شبكة لكن عشر دقائق)، `personal-data-erasure.service.ts:104` (كنس)، `pos.service.ts:263` (البيع يصير: معاملة واحدة تكتب الفاتورة والسند والوردية و`clientSaleId` معاً، ثم الختم خارجها ويُكتب بشرط).

### ٦.٤ الحرّاس النصية: إلى أين يذهب كل واحد

من 67 ملفاً، بالأسماء:

**إلى قيد في القاعدة** (يُحذف الحارس بعد الهجرة):
- `contracts/no-name-linking.spec.ts` ⟵ `UNIQUE (companyId, name)` على `customers`؟ لا، الاسم ليس فريداً في الواقع؛ البديل الصحيح `resolveOwned` والمفتاح المركب (٦.١)، ويُحذف الحارس.
- `common/count-numbering.spec.ts` ⟵ `document_sequences` قائم؛ يُحذف بعد حصر `retryOnUniqueConflict` على قيد `no` وحده.
- `common/bank-mirror.spec.ts` ⟵ يُلغى مع إلغاء المرآة (٦.٢).
- `tasks/task-model.spec.ts` ⟵ `CHECK` و`tasks_status_closed_list` قائمة؛ يُحذف.
- `common/writeoff-reasons.spec.ts`، `common/purchase-categories.spec.ts` ⟵ جدول مرجعي أو `enum` في القاعدة بدل خريطة في الشيفرة.
- `activities/sectors*.spec.ts` (أربعة ملفات) ⟵ `enum` واحد في المخطط تُشتق منه القائمة، يُحذف التطابق النصي.
- `common/batches/declared-limits.spec.ts` ⟵ `CHECK` على الأعمدة.

**إلى قاعدة على الشجرة (`ESLint` بـ `@typescript-eslint/utils`، أو `dependency-cruiser` للاستيراد)**:
- `common/import-direction.spec.ts`، `common/moved-paths.spec.ts` ⟵ `dependency-cruiser` بملف قواعد.
- `common/tenant/tenant-scope-coverage.spec.ts`، `common/model-parent-declared.spec.ts`، `common/migration-rls-read.spec.ts` ⟵ حارس على `Prisma.dmmf` (بيانات لا نص) يقارن النماذج بـ `TENANT_SCOPED_MODELS` وبكتالوج `pg_policies` الحي.
- `common/branch-read-declared.spec.ts`، `common/branch-from-request-checked.spec.ts`، `common/guard-reads-declared.spec.ts`، `common/company-user-reads-in-context.spec.ts` ⟵ قاعدة `ESLint` واحدة: "استدعاء `findMany`/`findFirst` على نموذج يحمل `branchId` داخل خدمة بلا `branchFilter` في `where` يُرفض ما لم يحمل تعليق `// scope: company-wide because ...`". التعليق يُقرأ من الشجرة (`getCommentsBefore`)، فيسقط نصف الحارس الذي لا يرى العقود: القاعدة تُطبق على الخدمة لا على وجود العمود، وتُلزم `contracts.service` بإعلان.
- `common/external-text-storable.spec.ts`، `common/null-safe-negation.spec.ts`، `common/stable-page-order.spec.ts`، `common/posting-gates-attached.spec.ts`، `journal/rent-revenue-single-source.spec.ts`، `journal/writeoff-posting.spec.ts`، `invoices/credit-limit.guards.spec.ts`، `delegations/delegations.guards.spec.ts`، `tasks/tasks.guards.spec.ts`، `tasks/task-visibility.spec.ts`، `zatca/egs-unit.spec.ts`، `zatca/sync-stamp.spec.ts`، `zatca/issue-time.spec.ts`، `pos/offline-incidents.spec.ts`، `contracts/no-word-classification.spec.ts`، `common/sequence-from-counter.spec.ts`، `common/sequence-port-sealed.spec.ts`، `accounts/code-band-collision.spec.ts`، `common/code-bands-registered.spec.ts` ⟵ كل واحد قاعدة `no-restricted-syntax` بمحدد، أو قاعدة مخصصة قصيرة. الميزة: تُبلَّغ في المحرر، وتُستثنى بتعليق موضعي مسجَّل.
- `common/no-silent-skip.spec.ts` ⟵ `eslint-plugin-jest/no-disabled-tests` + قاعدة ترفض `describe.skip` المشروط، وتُستبدل الحرّاس الحية بـ `test.skip` صريح عند غياب القاعدة **مع** فشل في CI إن لم تُنفَّذ (قائم في السير).

**إلى اختبار سلوك**:
- `common/money/rounding.spec.ts`، `common/settlement/settlement.util.spec.ts`، `common/units/units.spec.ts`، `common/relative-cost.util.spec.ts` ⟵ هي اختبارات سلوك أصلاً، تُبقى وتُحذف منها أي قراءة للمصدر.
- `accounts/default-chart.spec.ts`، `companies/company-defaults.spec.ts`، `companies/create-company-account.spec.ts` ⟵ إنشاء منشأة على قاعدة حية وفحص الناتج.
- `delegations/delegation-log.spec.ts`، `delegations/me-permissions.spec.ts` ⟵ منح وسحب على قاعدة حية وقياس `forActor`.
- `activities/sector-guard.spec.ts`، `activities/rls-context.spec.ts`، `activities/primary-activity.spec.ts` ⟵ طلب `HTTP` لشاشة خارج القطاع يعود 403.
- `companies/company-movement.spec.ts`، `common/subprocessor-consent.spec.ts`، `common/support-entry-live-grant.spec.ts` ⟵ تدفق كامل على قاعدة حية.

**يبقى نصياً** (لا شجرة له): `common/ci-split.spec.ts`، `common/deploy-recreate-guard.spec.ts`، `common/live-guard-precheck.spec.ts`، `common/locale-gate.spec.ts`، `common/migrations-announce.spec.ts`, `common/offsite-backup.spec.ts`، `common/prisma-client-fingerprint.spec.ts`، `common/scheduler-registered.spec.ts`، `common/bank-drawer-tests-isolated.spec.ts`، `common/probe-two-cases.spec.ts`، `common/clean-run-verdict.spec.ts`، `common/no-id-scan.spec.ts` (يحرس نصاً في الواجهة)، `activities/screen-labels.spec.ts`، `auth/off-system-template-migration.live.spec.ts`، `common/plan-cache-mode.live.spec.ts`. 15 ملفاً، وهي حرّاس على ملفات إعداد أو سير.

الحصيلة: 8 إلى القاعدة، 32 إلى الشجرة، 12 إلى السلوك، 15 تبقى. الترتيب: الشجرة أولاً لأن قاعدة واحدة تغطي أربعة حرّاس، ثم السلوك، ثم القاعدة مع الهجرات.

### ٦.٥ عدّاد الإعلانات

**ما يُعد**: كل ما يحوّل ثغرة إلى استثناء معلن: `TENANT_SCOPE_EXCEPTIONS` (11)، `BORROWED_FROM_EXPOSED` (3)، `EXPORT_EXCLUSIONS` (1)، `KNOWN_WEAK` في الحارس الحي، تعليقات `SCOPE_DECLARATION` (53)، `DEFERRAL_REASON`، تعليقات "دَين معلن" الحرة.

**البنية**: ملف واحد `src/common/declarations.ts`:

```ts
export const DECLARATIONS = [
  { id: 'D-001', file: 'common/tenant/tenant-scope-exceptions.ts', key: 'AccountDeletionRequest',
    kind: 'isolation', reason: 'ENABLE بلا FORCE لأن الإدارة تقرأ بلا سياق',
    owner: 'platform', since: '2026-08-07', expires: '2026-12-31',
    proof: 'test/deletion-requests.e2e-spec.ts#admin-reads-all' },
  ...
] as const;
```

وكل موضع في الشيفرة يشير إلى معرّفه: `// @declared D-001`. القاعدة على الشجرة: أي تعليق `SCOPE_DECLARATION` أو مدخل في `TENANT_SCOPE_EXCEPTIONS` بلا `@declared D-xxx` يُرفض.

**تاريخ الانتهاء والاختبار الذي يسقط**: `common/declarations.spec.ts`:
1. لكل مدخل: `expires >= today` وإلا يسقط باسم المدخل و`owner`؛ التمديد تعديل صريح في `git blame` لا صمت.
2. لكل مدخل: ملف `proof` موجود ويحتوي `describe` باسم المعرّف؛ فالإعلان مربوط باختبار يثبت أن الأثر محدود بما قيل.
3. العدّاد: `expect(DECLARATIONS.length).toBeLessThanOrEqual(BASELINE)` حيث `BASELINE` رقم مكتوب في الملف؛ رفعه يظهر في المراجعة. وفي CI: `git diff origin/main -- src/common/declarations.ts | grep '^+.*id:'` يُعلَّم في الطلب ويطلب موافقة مالك.
4. عند إغلاق الدين: المدخل يُحذف والاختبار الذي كان `proof` يتحول إلى إثبات القاعدة (كما فعلتم مع `CompanyUser`).

**ما يحدث لما هو معلن اليوم**: الـ 53 تعليقاً على القراءات الكلية تُقلَّص: `reports.service` ثلاثة، والبقية تُقاس هل الحجة قائمة. توقعي أن نصفها يذهب بمجرد تطبيق قاعدة الشجرة على الخدمة لا العمود (٦.٤).

## ٧. ترتيب التنفيذ الذي أراه

يختلف عن ترتيبي في التقارير السابقة لأن المعيار هنا الكلفة مقابل ما يُغلق:

١. **رفض افتراضي في الحارس** (`tenant.guard.ts:188`): يوم واحد. يغلق الفئة كلها من القسم ٣ في الجزء الثالث.
٢. **`resolveOwned` + قاعدة الشجرة له**: ثلاثة أيام. يغلق حقن المعرّفات في كل `create` دون هجرة.
٣. **الأرقام في الواجهة من الخادم**: أسبوع. اللوحة وبطاقة العميل والمورد و`fmt` و`catch` عام مع `toast`. لأن هذا ما يراه المالك يومياً، وكل ما بعده لا يُرى.
٤. **الطابور والهيئة** (٦.٣): أسبوع. لأن الفشل فيه نظامي لا داخلي.
٥. **نسخة واحدة تُقرأ** للأزواج الثلاثة الأولى (`accounts.balance` للقراءة، `banks.balance` يُلغى، `invoices.status` بمشغّل): أسبوعان.
٦. **المفاتيح المركبة** للأهداف الاثني عشر (٦.١): أسبوع مع الفحص قبل الهجرة. متأخرة لأن ② تغطي المسارات القائمة، والمفتاح للمستقبل.
٧. **الحرّاس النصية** (٦.٤): أسبوعان، تُنفَّذ بالتوازي لأنها لا تمس الإنتاج.
٨. **العدّاد** (٦.٥): يومان بعد أن تستقر ٧.

المجموع نحو ثمانية أسابيع لشخص واحد، أو أربعة لاثنين لأن ٣ و٧ مستقلان عن البقية.

## ما لم يُغطَّ

من 98 ملف صفحة في `pages/` فُحصت بالأدوات كلها ويدوياً 14 (اللوحة، الفواتير، الكاشير، العملاء، الموردين، العقود، التقارير، الحسابات، المدفوعات، الإعدادات، الفروع، الملف، الاشتراك، الموارد البشرية). الباقي بالنمط نفسه على الأرجح. `zatca/ubl/` (بناء المستند والتوقيع) لم يُراجع حرفاً؛ يحتاج مراجعاً يعرف `UBL 2.1` ومتطلبات الهيئة تفصيلاً.
