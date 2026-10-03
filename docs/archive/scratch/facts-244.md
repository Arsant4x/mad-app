# التوجيه ٢٤٤ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ — موجة ذ٥ مكدَّسة على docs/session-record-155، والخامسة في §8.14
docs/session-record-156
COMMIT=2a6bb37
https://github.com/Arsant4x/mad-app/pull/503
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
# دمجُ الثلاثة الوثائقية بالترتيب
#494 OPEN CLEAN head=0bd6ca0
#494 MERGED 5973d0b
#501 CLEAN head=3b90ede
#501 MERGED 6cf2d12
#502 CLEAN head=6f2b65f
#502 MERGED 25bee74
origin/main=25bee74
docs/session-record-156 rebased=09bdafa
# ③-أ إزالةُ DELETE /files — الحارسُ الحيّ على lc ثم الإثباتُ بالعكس (المسارُ يُعاد من main ⟵ 204 بدل 404)
=== files-244 EXIT=0 161 s ===
Tests:       7 passed, 7 total
break landed: DELETE /files route restored from main
=== files-244-break EXIT=1 41 s ===
Tests:       1 failed, 6 passed, 7 total
    expected 404 "Not Found", got 204 "No Content"
restored byte-exact (route removed)
# ③-ب المولِّد: packages/shared/src/permissions.ts مرسومٌ من screens.ts (24 × 7 = 168) — الحارسُ مُثبَتٌ بالعكس بحالتين
كُتب D:\mad-app\packages\shared\src\permissions.ts (215 سطراً).
168
break landed (hand edit appended)
    × ⭐ ما على القرص = ما يُرسَم من المصدر الآن — حرفاً
permissions.ts restored byte-exact
break landed (screen added to source without regenerating)
Tests:       2 failed, 1 passed, 3 total
screens.ts restored = HEAD
COMMIT=dd98915
# محطةُ ③ الأولى سقطت بنفاد ذاكرة V8 بعد 94 مجموعة (الذاكرةُ الحرّة 309 MB — خادمُ جلسةٍ أخرى ومعاينتُها قائمان) — وليست شهادةً على الشيفرة؛ أُعيدت بحدٍّ لذاكرة العامل
=== station-1w EXIT=134 503 s ===
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
      ▶ كلفةُ البصمة: 124.7 م.ث · والمرجع 17.0 م.ث ⇒ 7.3× (السقف 6×)
# محطةُ ③ بعاملٍ واحد وحدِّ ذاكرةٍ للعامل (--workerIdleMemoryLimit=900MB) — 132 مجموعة (131 + حارسُ المولِّد)؛ الساقطُ الوحيد بقايا mad_app_lc
=== station-1w EXIT=1 574 s ===
Test Suites: 1 failed, 131 passed, 132 total
Tests:       1 failed, 842 passed, 843 total
https://github.com/Arsant4x/mad-app/pull/504
# ④ x-request-id — وحدةٌ بلا قاعدة (200 · 404 مسمّى · 404 مسار · 500 خام · رفضُ الوارد غير الصالح · قبولُ الصالح) وحارسُ توصيلٍ على main.ts وe2e على lc
Tests:       6 passed, 6 total
=== request-id-244 EXIT=0 51 s ===
Tests:       9 passed, 9 total
 ✓ src/lib/apiError.test.ts (9 tests)
Tests:       33 passed, 33 total
# الإثباتُ بالعكس لحارس التوصيل: الوسيطُ بعد helmet ⟵ يسقط باسمه
break landed (middleware after helmet)
    × app.use(requestIdMiddleware) يسبق app.use(helmet (5 ms)
Tests:       1 failed, 8 passed, 9 total
main.ts restored byte-exact
COMMIT=ac8fdd4
# محطةُ ④ — 132 مجموعة (الساقطُ الوحيد بقايا mad_app_lc)
=== station-1w EXIT=1 343 s ===
Test Suites: 1 failed, 131 passed, 132 total
Tests:       1 failed, 848 passed, 849 total
https://github.com/Arsant4x/mad-app/pull/505
# ① — تصحيحٌ على الموجز: `/admin/processing-agreement` ليس مصفوفةً عارية — معالجُه `overview()` (consent.controller.ts:54-61) يعيد كائناً؛ ومصنِّفُ الموجز (`list-shape.mjs`) قرأ **أوّلَ نداءِ خدمةٍ في المعالج** (`listSubProcessors` ⟵ `findMany`) لا **ما يعيده المعالج** — فالعدُّ الصحيح **42 لا 43**؛ وبقيّةُ الاثنتين والأربعين قُرئ إرجاعُ كلٍّ منها بالعين عند تحويلها
    return { subProcessors, versions, acceptances, noticeDays: ConsentService.NOTICE_DAYS };
param-less GET = 92 {"array":60,"other":24,"envelope":8}
# ① الاثنتان والأربعون محوَّلةٌ كلُّها — الحارسُ الساكن (list-routes-paged) وحارسُ الوحدة (paged.util) بعد التحويل
Tests:       14 passed, 14 total
# الإثباتُ بالعكس للحارس الساكن: إسقاطُ `@Query()` من `listTypes` ⟵ يسقط باسم المسار
break landed (listTypes without @Query)
    +   "/leaves/types ⟵ leaves/leaves.controller.ts#listTypes — @Query() نوعُه «لا شيء»",
Tests:       1 failed, 2 passed, 3 total
leaves.controller.ts restored byte-exact
# ① الحارسُ الحيّ على mad_app_lc (قاعدةٌ مملوءة) — الخمسةُ خضراء بعد رفع مهلة الدفعة (42 نداءً متتابعاً تجاوزت سقفَ الخمس ثوانٍ: 6011 ms في المحاولة الأولى — سقفٌ لا بطء، والمهلةُ للدفعة لا للنداء)
=== paged-244b EXIT=0 38 s ===
Tests:       5 passed, 5 total
    [paged-lists] بلا page: أبطأُ خمسة — /invoices 3157ms · /quotes 953ms · /payments 712ms · /units 363ms · /pos/shifts 348ms
    [paged-lists] مع page: أبطأُ خمسة — /warehouses 296ms · /units 294ms · /inventory/stock-levels 206ms · /accounts 179ms · /invoices 132ms
# ① أثرُ القائمة البيضاء (forbidNonWhitelisted في main.ts:47): مفتاحُ استعلامٍ غيرُ مُعلَن على المسارات الاثنين والأربعين صار يُردّ 400 بعد أن كان يُتجاهَل — وهو سلوكُ كلِّ مسارٍ ذي DTO في المشروع (`/inventory/movements` مثلاً)؛ قِيس مَن يرسل مفاتيح: الواجهةُ ترسل includeArchived · date · employeeId · fromCode/toCode · status · customerId · supplierId · propertyId · actorId/screen/entityId/from/to/limit — كلُّها مُعلَنة؛ والاختباراتُ 18 موضعاً كلُّها مُعلَنة (e2e-query-scan.mjs)
hits = 18
# ① `/warranties/cover` — `propertyId` صار واجباً (كان يُقرأ بلا تحقّق فيمرّ فارغاً وتعيد الخدمةُ ضماناتِ المنشأة كلَّها في التاريخ): لا مستهلكَ له في الواجهة ولا في الاختبارات قبل هذا الحارس (grep على apps/web/src و apps/api/test = 0)
# ① `pagedFindMany` يستنتج الصفَّ من `findMany` بوسائطه الافتراضية — الضمائمُ في الصفّ وقتَ التشغيل لا في نوعه (قِيس: TS2345 على `replacedBy` في الفواتير)؛ فالفواتيرُ والمنشآت على `listOrPage` بنداءاتٍ مكتوبة
src/invoices/invoices.service.ts(200,41): error TS2345: Argument of type '{ subtotal: Decimal; taxTotal: Decimal; total: Decimal; currency: string; exchangeRate: Decimal; id: string; companyId: string; no: string; customerId: string; ... 38 more ...; updatedAt: Date; }' is not assignable to parameter of type '{ docType: string; status: string; total: Decimal; id: string; zatcaStatus: string; replacedBy: { id: string; } | null; }'.
# ① الحزمةُ الكاملة على mad_app_clean أُوقفت بعد 8 دقائق: 10 ملفّات من 261 والذاكرةُ الحرّة 346 MB (خادمُ جلسةٍ أخرى ومعاينتُها على المضيف) — وسقوطٌ واحد بسقف الخمس ثوانٍ في goods-receipts ⑤ (POST /purchases — لا صلةَ له بالترقيم)؛ فاليتامى قُتلوا وتُحقّق منهم بالعدّ، ويُقاس ما له صلة (89 ملفّاً تقرأ أحدَ المسارات) بمجموعةٍ ممثِّلة على القاعدة النظيفة، والحزمةُ الكاملة في السير
FAIL test/goods-receipts.e2e-spec.ts (35.284 s)
    thrown: "Exceeded timeout of 5000 ms for a test.
left = 0
free MB = 3369
# ① المجموعةُ الممثِّلة (37 ملفّاً) على mad_app_clean في عمليةٍ واحدة (--runInBand بكومة 1536 م.ب) — 14 خضراء ثم نفادُ كومة V8 (حدُّ الأداة لا الشيفرة: الملفّاتُ تتراكم في عمليةٍ واحدة)؛ فأُعيد الباقي على دفعتين بكومة 2800 م.ب
=== subset-244 EXIT=134 166 s ===
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
PASS test/payments.e2e-spec.ts (29.149 s)
PASS test/quotes.e2e-spec.ts (9.415 s)
PASS test/integrations.e2e-spec.ts (6.858 s)
PASS test/pos.e2e-spec.ts (11.618 s)
PASS test/supplier-payments.e2e-spec.ts (12.293 s)
PASS test/tasks.e2e-spec.ts (7.711 s)
PASS test/support-access.e2e-spec.ts (8.004 s)
PASS test/sector-screens.e2e-spec.ts (6.214 s)
PASS test/leaves.e2e-spec.ts (6.196 s)
PASS test/audit-log.e2e-spec.ts (5.79 s)
PASS test/maintenance.e2e-spec.ts (10.196 s)
PASS test/structural-wave.e2e-spec.ts (9.204 s)
PASS test/cash-drawers.e2e-spec.ts (9.908 s)
PASS test/owner-templates.e2e-spec.ts (17.137 s)
# ① باقي المجموعة الممثِّلة على mad_app_clean بكومة 2800 م.ب — دفعتان (15 + 11 ملفّاً، ومعها goods-receipts وحدَها فخضرّت: سقوطُها الأوّل سقفٌ تحت ضغط الذاكرة لا عطل) — الأربعون خضراء
=== subset-244-b EXIT=0 105 s ===
=== subset-244-c EXIT=0 107 s ===
Test Suites: 15 passed, 15 total
Tests:       91 passed, 91 total
Test Suites: 11 passed, 11 total
Tests:       38 passed, 38 total
PASS test/goods-receipts.e2e-spec.ts (15.622 s)
Ran all test suites matching /obligations-tenant-isolation|manual-movements-costing|customers-tenant-isolation|tenant-guard-default-closed|banks-tenant-isolation|employees-tenant-isolation|products-tenant-isolation|scripts-tenant-isolation|suppliers-purchases-tenant-isolation|property-coordinates|goods-receipts/i.
# ① محطةُ api-unit على lc (133 مجموعة) — الساقطان: بقايا lc (dimension-coverage.live كما في المحطّات السابقة) وحارسٌ لم أكن أعرفه (§8.25): stable-page-order (ق-٣٥٦) — كلُّ استعلامٍ مصفَّح ينتهي ترتيبُه بحقلٍ فريد `id`، وقد قرأ `skip:` في paged.util.ts بلا `id` في الترتيب — والعلّةُ حقيقية لا نصّية: صفحتان متتاليتان بترتيبٍ على الاسم وحدَه قد تكرّران صفّاً وتُسقطان آخر عند التعادل
=== station-1w EXIT=1 722 s ===
FAIL src/journal/dimension-coverage.live.spec.ts (44.219 s)
FAIL src/common/stable-page-order.spec.ts
Test Suites: 2 failed, 131 passed, 133 total
Tests:       2 failed, 852 passed, 854 total
    +   "common/pagination/paged.util.ts:19",
    +   "common/pagination/paged.util.ts:33",
    +   "common/pagination/paged.util.ts:48",
# ① العلاج: الاستعلامُ المصفَّح يُختم بـ`id` — `pagedFindMany` تكتبه حرفاً (`orderBy: [...orderList(orderBy), { id: idDirection(orderBy) }]` باتجاه المستدعي إن ختم به)، و`listOrPage` في الفواتير والمنشآت بترتيبٍ مكتوبٍ ينتهي بـ`id`، ومصادرُ `pageArray` السبعةُ خُتمت (accounts · warehouses · units · integrations · inventory/provisional · stock-levels بمفتاحَي الصفّ · tasks بـ`ORDER BY "createdAt" DESC, "id" DESC` · warranties/cover)؛ ونافذةُ الأداة `offset/limit` لا `skip/take` كي لا يقرأ الحارسُ النصّيُّ حقلَ نوعٍ استعلاماً — الحرّاسُ الثلاثة (pagination + stable-page-order) والحارسُ الحيّ على clean
TSC_EXIT=0
Test Suites: 3 passed, 3 total
Tests:       18 passed, 18 total
=== paged-244c EXIT=0 40 s ===
Tests:       5 passed, 5 total
# ① محطةُ api-unit على lc بعد العلاج — 133 مجموعة، الساقطُ الوحيد بقايا lc
=== station-1w EXIT=1 338 s ===
FAIL src/journal/dimension-coverage.live.spec.ts (45.245 s)
Test Suites: 1 failed, 132 passed, 133 total
Tests:       1 failed, 854 passed, 855 total
COMMIT=c520d77
https://github.com/Arsant4x/mad-app/pull/506
# ② الأساس: `common/money/text.ts` (money/qty/rate/percent بدقّة SCALE — وأُضيف EXCHANGE_RATE=6 وPERCENT=2 إلى الجدول ودوراهما في rounding.spec على 18 عموداً من المخطَّط) + الواجهة `lib/money.ts` (MoneyText·QtyText·RateText·PercentText و num/num0/sumMoney) + الحارسُ الشجريّ `moneyTextGuard.test.ts` (مدقّقُ الأنواع على tsconfig.app.json — يُسقط + - * / % < > <= >= والسالبَ الأحادي وMath.* على حقلٍ مُعلَنٍ بأحد الأنواع، ويرى عبر as/()/!)
Tests:       46 passed, 46 total
      Tests  3 passed (3)
# الإثباتُ بالعكس للحارس الشجريّ على الشجرة الحقيقية: `declaration.netVat + declaration.purchasesStandardVat` — المترجمُ يمرّ (وصلٌ لا جمع) والحارسُ يسقط باسم الملفّ والسطر
break landed (netVat + purchasesStandardVat — concat compiles)
TSC_ON_BREAK_EXIT=0 (0 = المترجم لا يرى الوصل)
+   "pages/obligations/VatDeclarationPage.tsx:192 — declaration.netVat + declaration.purchasesStandardVat (MoneyText)",
      Tests  1 failed | 2 passed (3)
VatDeclarationPage.tsx restored byte-exact
# ② النطاقُ الأوّل — الإقرارُ الضريبيّ: الخادمُ يخرج مبالغَه نصّاً بخانتين على حدّ الاستجابة (25 حقلاً بما فيها الخانات وقسمُ الإيجار وصافي «قُدِّم») والحسابُ داخله رقمٌ بالمصدر الواحد؛ والمرآةُ `api/obligations.ts` بـ`MoneyText`؛ والصفحةُ تقرأ بـ`num0`/`sumMoney` (المترجمُ أمسك `>`/`!==` على نصٍّ ورقم، والحارسُ الشجريُّ يمسك `+` الذي لا يراه المترجم)؛ والاختباراتُ الثمانية القارئة للإقرار على clean
=== decl-244 EXIT=0 86 s ===
Test Suites: 8 passed, 8 total
Tests:       56 passed, 56 total
# الإثباتُ بالعكس لأساس النصّ: `toFixed` الخام بلا `roundTo` ⟵ يسقط على 1.005 (حدّ IEEE-754 الذي أُصلح في كنسة التدوير)
break landed (raw toFixed without roundTo)
    Expected: "1.01"
    Received: "1.00"
Tests:       1 failed, 7 passed, 8 total
text.ts restored byte-exact
# الواجهة كلُّها (vitest) والمترجم بعد النطاق الأوّل
 Test Files  24 passed (24)
      Tests  108 passed (108)
TSC_WEB_EXIT=0
# ② محطةُ api-unit على lc (132 مجموعة على هذا الفرع) — الساقطُ الوحيد بقايا lc
=== station-1w EXIT=1 845 s ===
FAIL src/journal/dimension-coverage.live.spec.ts (52.034 s)
Test Suites: 1 failed, 131 passed, 132 total
Tests:       1 failed, 847 passed, 848 total
COMMIT=a3b2728
https://github.com/Arsant4x/mad-app/pull/507
RECORD_COMMIT=9020615
# حالُ الطلبات الخمسة بعد الدفع — الأربعةُ الشيفريةُ CLEAN وسيرُها الثقيلُ (web-tests: الحزمةُ الكاملة db-integration + api-unit + vitest + playwright) والخفيفُ أخضران على رؤوسها
#504 feat/permissions-shared state=CLEAN head=dd98915
#505 feat/request-id state=CLEAN head=ac8fdd4
#506 feat/paged-lists state=CLEAN head=c520d77
#507 feat/money-text-1 state=CLEAN head=a3b2728
35538920041 a3b2728 completed/success web-tests feat/money-text-1
35538919999 a3b2728 completed/success web-tests-light feat/money-text-1
35537124722 c520d77 completed/success web-tests feat/paged-lists
35537124707 c520d77 completed/success web-tests-light feat/paged-lists
35531813944 ac8fdd4 completed/success web-tests feat/request-id
35531813838 ac8fdd4 completed/success web-tests-light feat/request-id
35531084352 dd98915 completed/success web-tests-light feat/permissions-shared
35531084319 dd98915 completed/success web-tests feat/permissions-shared
35556572931 9020615 completed/success
#503 state=CLEAN
