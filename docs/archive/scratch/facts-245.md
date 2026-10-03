# التوجيه ٢٤٥ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ — موجة ض٥ مكدَّسة على docs/session-record-156
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
RECORD_COMMIT=13e4c6d
https://github.com/Arsant4x/mad-app/pull/508
#503 CLEAN head=9020615
#503 MERGED dca3da8
docs/session-record-157 rebased=685861b
#504 UNKNOWN head=dd98915
try=1 #504 state=CLEAN
#504 MERGED 3d0b34b
try=2 #505 state=CLEAN
#505 MERGED 4d390bd
# بوّابةُ الدمج رفضت أمرَ #505 مرّتين بتعذّر القراءة («تعذّر قراءة الطلبات المكدَّسة على feat/request-id … الفشل مُغلِق») لا بحكمٍ على الحال — والقراءةُ المستقلّة تعطي صفرَ طلبٍ مكدَّس والحصّةُ كاملة؛ فأُعيد الأمرُ كما هو (ق-١١٠٧) فمرّ في الثالثة
0
core remaining=5000 reset=1789965150
try=2 #506 state=CLEAN
#506 MERGED c9e575b
# بوّابةُ الدمج رفضت أمرَ #506 ثلاثاً بتعذّر القراءة (المكدَّسةُ · الملفّاتُ والتواريخ · ثم الحالةُ مع «error connecting to api.github.com») — انقطاعٌ في الاتصال لا حكمٌ على الحال؛ انتُظر حتى عاد الاتصال ثم أُعيد الأمرُ كما هو فمرّ
api reachable try=1
try=2 #507 state=CLEAN
#507 MERGED 3d93e8b
origin/main=3d93e8b
docs/session-record-157 rebased=e4c8ee9
35558270479 3d93e8b pending/ web-tests main
35558270490 3d93e8b in_progress/ web-tests-light main
35558226740 c9e575b completed/cancelled web-tests main
35558226620 c9e575b completed/success web-tests-light main
35557878857 4d390bd completed/success web-tests-light main
35557878919 4d390bd in_progress/ web-tests main
# ② النطاق الثاني — الكاشير (feat/money-text-2-pos من 3d93e8b)
# web tsc قبل تعديل PosPage: 5 أخطاء (TS2345 ×2 · TS2367 ×2 · TS2365) — كلها على variance/resultingQty
TSC_WEB_EXIT=0
Test Files  24 passed (24)
Tests      110 passed (110)
# إثباتٌ عكسي لحارس النصّ على الكاشير: Math.abs(closed.variance as unknown as number) حُقن وثبت هبوطه (cmp ≠ النسخة الاحتياطية)
pages/pos/PosPage.tsx:333 — Math.abs(closed.variance as unknown as number) (MoneyText)
GUARD_EXIT=1
RESTORED_EXACT
# الكاشيرُ حيّاً على clean (pos · pos-split · pos-cash-to-drawer · pos-shift-drawer · pos-offline · pos-offline-incidents · branches)
=== pos-245 EXIT=0 137 s ===
Test Suites: 7 passed, 7 total
Tests:       53 passed, 53 total
# محطّة api-unit بحدّ الذاكرة الخامل (900MB) على ذاكرةِ ts-jest الباردة بعد خمسة دمجات: 8 ملفّات في 8 دقائق (36–80 s لكلٍّ — العاملُ يُعاد تشغيلُه بعد كلِّ ملفّ) — أُوقفت وقُتل يتيماها (10452 · 19912) وثبت الصفر
jest node processes left = 0
# قياسُ القاعدة قبل الحكم على البطء: connect+first=175 ms second=4 ms — فالبطءُ في العامل لا في القاعدة
# ② النطاق الثالث — المقيس قبل البناء: الحقولُ الرقمية المحسوبة في ردود الفواتير والمدفوعات (لا Decimal فهي نصٌّ أصلاً)
# invoices.list: outstanding · creditedTotal | createWithinTx: stockFulfilment{totalCost · provisionalQty · belowZero[].resultingQty} | replacement: closure{amountMoved · returned[]{qty · cost}}
# payments.openInvoices: allocated · remaining | supplier-payments.openPurchases: allocated · credited · remaining | purchases.list: allocated · credited · remaining
# الواجهة: api/invoices.ts (outstanding · creditedTotal) · api/payments.ts (allocated · remaining) · api/supplierPayments.ts (allocated · remaining) · api/purchases.ts (allocated · credited · remaining)
# مواضعُ الحساب في الصفحات: CustomersPage:42 (+ outstanding) · PaymentModal:58 (Math.min remaining) · SupplierPaymentModal:23,28 (round2 remaining) · :48 (Math.min remaining)
# محطّة api-unit على mad_app_lc (عاملٌ واحد بلا حدّ خامل) — الساقطُ الوحيد بقايا lc المعروفة (dimension-coverage.live) كما في المحطّات السابقة
=== station-pos EXIT=1 332 s ===
Test Suites: 1 failed, 135 passed, 136 total
Tests:       1 failed, 874 passed, 875 total
https://github.com/Arsant4x/mad-app/pull/509
POS_COMMIT=e96b20a
# ② النطاق الثالث — الفواتيرُ والمدفوعات (feat/money-text-3-invoices مكدَّسٌ على feat/money-text-2-pos)
TSC_API_EXIT=0
TSC_WEB_EXIT=0
# إثباتٌ عكسي: (inv.outstanding as unknown as number) في CustomersPage — المترجمُ لا يراه (خطؤه الوحيد استيرادٌ غير مستعمل) والحارسُ يسقط
pages/customers/CustomersPage.tsx:44 — (map.get(inv.customerId) ?? 0) + (inv.outstanding as unknown as number) (MoneyText)
GUARD_EXIT=1
RESTORED_EXACT
Test Files  24 passed (24)
Tests      110 passed (110)
# الفواتيرُ والمدفوعات حيّاً على clean (14 ملفّاً): الساقطُ الوحيد توكيدٌ فاتني في المسح الأوّل (مسحٌ مقطوعٌ بـhead -30 — §8.7) purchase-edit-reversal:210 — remaining: 0 ⟵ '0.00'
=== inv-245 EXIT=1
Test Suites: 1 failed, 13 passed, 14 total
Tests:       1 failed, 82 passed, 83 total
# بعد التصحيح — الملفُّ وحده
=== inv-245b EXIT=0 41 s ===
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
# محطّة api-unit للنطاق الثالث — الساقطُ الوحيد بقايا lc المعروفة
=== station-inv EXIT=1 271 s ===
Test Suites: 1 failed, 135 passed, 136 total
Tests:       1 failed, 874 passed, 875 total
https://github.com/Arsant4x/mad-app/pull/510
INV_COMMIT=6373705
# ② النطاق الرابع — التقارير (feat/money-text-4-reports مكدَّسٌ على feat/money-text-3-invoices)
# المقيس: 12 مساراً في reports.controller · 64 حقلاً رقمياً في api/reports.ts (المالُ والنِّسَبُ منها تُحوَّل، والعدُّ يبقى) · 18 ملفّاً حيّاً يقرأ /reports/
TSC_API_EXIT=0
# tsc الواجهة بعد المرآة وقبل الصفحات: 6 أخطاء (مقارناتٌ وMath.abs) في ReceivablesAgingSection وReportsPage — أُصلحت بـnum0
TSC_WEB_EXIT=0
# إثباتٌ عكسي على ReportsPage:356 — (b.netIncome as unknown as number) >= 0: المترجمُ يمرّ (TSC_ON_BREAK_EXIT=0) والحارسُ يسقط — **ومعه موضعان حقيقيان لم أرهما**: السالبُ الأحادي على نصّ
pages/reports/ReportsPage.tsx:301 — -cash.receivablesChange (MoneyText)
pages/reports/ReportsPage.tsx:322 — -cash.fixedAssetChange (MoneyText)
pages/reports/ReportsPage.tsx:356 — (b.netIncome as unknown as number) >= 0 (MoneyText)
GUARD_EXIT=1
RESTORED_EXACT
# بعد إصلاح الموضعين بـ-num0(…):
Test Files  24 passed (24)
Tests      110 passed (110)
# وحداتُ المال بعد percent()
Test Suites: 4 passed, 4 total
Tests:       46 passed, 46 total
# التقاريرُ حيّاً على clean (18 ملفّاً + note-deadline.spec الوحدة التقطها النمط): الساقطُ الوحيد توكيدٌ على المجموع بلا Number (inventory-write-offs:196)
=== rep-245 EXIT=1 262 s ===
Test Suites: 1 failed, 18 passed, 19 total
Tests:       1 failed, 142 passed, 143 total
# بعد التصحيح — الملفُّ وحده
=== rep-245b EXIT=0 42 s ===
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
# محطّة api-unit للنطاق الرابع — الساقطُ الوحيد بقايا lc المعروفة
=== station-rep EXIT=1 511 s ===
Test Suites: 1 failed, 135 passed, 136 total
Tests:       1 failed, 874 passed, 875 total
https://github.com/Arsant4x/mad-app/pull/511
REP_COMMIT=09766ea
35562248211 6373705 completed/success web-tests-light feat/money-text-3-invoices
35562248190 6373705 completed/success web-tests feat/money-text-3-invoices
35560756409 e96b20a completed/success web-tests-light feat/money-text-2-pos
35560756384 e96b20a completed/success web-tests feat/money-text-2-pos
35558270490 3d93e8b completed/success web-tests-light main
35558270479 3d93e8b completed/success web-tests main
35558226740 c9e575b completed/cancelled web-tests main
35558226620 c9e575b completed/success web-tests-light main
35557878919 4d390bd completed/success web-tests main
35557878857 4d390bd completed/success web-tests-light main
35557700744 3d0b34b completed/success web-tests main
# ⚠️ ملاحظةٌ على المحطّات: التوقيتُ يتذبذب بالذاكرة الحرّة (332 s · 271 s · 511 s) — الساقطُ في الثلاث بقايا lc نفسُها
# الحزمة الثانية — القياس قبل البناء (ق-١٢٤٣): الأرقامُ التي تجمعها الشاشةُ من بيانات الخادم ولا يرسلها الخادم
# مسحُ reduce() في apps/web/src (pages/components/layout بلا اختبارات): 33 موضعاً في 17 ملفّاً — منها حقائقُ معروضة (لا معايناتُ نماذج):
# DashboardPage: revenue (مجموعُ إجماليات الفواتير شاملةَ الضريبة، موقَّعةً للدائن) · expense (إجماليات المشتريات شاملةَ الضريبة) · net · receivables (فواتيرُ غير PAID بكامل إجماليها — المسدَّدُ جزئياً يُعدّ كاملاً) · السلسلةُ الشهرية (6–24 شهراً من الإجماليات)
# CustomerDetailModal: totalBilled (إجماليات موقَّعة) · totalPaid (فواتير PAID فقط — الجزئيُّ لا يُحسب) · balance (غيرُ PAID بكامله)
# CustomersPage: balanceByCustomer (مجموعُ outstanding لكل عميل — من قائمة الفواتير كلِّها)
# SupplierDetailModal: totalBilled · totalPaid (مجموعُ allocated) · totalDue — بمرشّح تاريخٍ في الشاشة
# PaymentsPage: allocatedOf(p) (مجموعُ تخصيصات كلِّ سند)
# AccountsPage: مجموعُ الأرصدة لكل نوع حساب
# ClaimsSection: outstanding (مجموعُ المطالبات المفتوحة) · DepositsSection: heldTotal (المحجوزُ لدى المنشأة)
# ContractDetailModal: المسدَّدُ والمتبقّي لكل قسط (من دفعاته) — والمقترَحُ للقبض منه
# معايناتُ نماذج (تبقى في الشاشة بحقّ — أرقامُ إدخالٍ قبل الحفظ): InvoiceBuilder · JournalBuilder · QuoteModal · DebitNoteModal · PaymentModal/SupplierPaymentModal (التوزيع) · PosPage (السلة) · DepositsSection.deducted · ContractDetailModal (معاينةُ التسوية وسطورُها)
# عدٌّ لا مال (يُعلَن ولا يُبنى هنا): HrPage.approvedDays · TrashPage.total · InvoiceListView (فرزٌ بالإجمالي)
# الحزمة الثانية — البناء: GET /reports/dashboard · GET /customers/:id/summary + outstanding في القائمة · GET /suppliers/:id/summary?from&to · allocatedTotal/unallocated على سندَي القبض والصرف · GET /accounts/summary · gross/settled/remaining على أقساط العقد + claimsOutstanding + depositsHeld (في كل ردٍّ يعيد العقد)
TSC_API_EXIT=0
TSC_WEB_EXIT=0
# حرّاسُ القراءة الجامعة والترقيم والترتيب التامّ والتدوير والمال
Test Suites: 8 passed, 8 total
Tests:       72 passed, 72 total
# vitest بعد إعادة كتابة CustomersPage.test (كان يحرس الجمعَ في الشاشة — صار يحرس أن المعروضَ رقمُ الخادم)
Test Files  24 passed (24)
Tests      110 passed (110)
# الحارسُ الحيّ الجديد screen-reads-server-computes.e2e-spec على clean — سبعُ مراحل بجوابٍ معلوم
=== srv-245 EXIT=0 85 s ===
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
# إثباتٌ عكسي: الإيرادُ شاملَ الضريبة (×1.15) يسقط ① — والكسرُ ثبت هبوطُه بـcmp ثم أُعيد الملفُّ بايتاً بايتاً
=== srv-245-break EXIT=1 52 s ===
    Expected: "1000.00"
    Received: "1150.00"
RESTORED_EXACT
# الحزمة الثالثة — القياس (ق-١٢٤٤) بمسبارٍ مُصادَق (يجد invoices.customerId→customers، ولا يجد مفتاحاً إلى companies/login_identities)
rlsTables(clean)=84 fks(clean)=152 fromTables=60 toTables=44 compositeReadyTargets=0
rlsTables(dev)=78 fks(dev)=133
# العدُّ الأوّل بدور app_user أعطى صفراً في كل جدول (عدٌّ خارج السياق يرى الغياب) — أُعيد بدور المدير على mad_app:
referencing rows on dev (sum over 60 from-tables, distinct)=114351
# مسوّدةُ الهجرة المولَّدة (لا تُكتب في المستودع ولا تُطبَّق): 43 فهرساً فريداً · 151 مفتاحاً مركّباً · permission_templates مستثنى (companyId فارغٌ للقوالب العامّة)
targets=43 compositeFks=151 lines=203
# محطّة api-unit للحزمة الثانية (المرّة الأولى): ساقطان — بقايا lc + حارسٌ نصّيّ (no-word-classification) أدان توصيفَ نوعٍ `classification: string;` في withComputedFigures — §8.21 (الحارسُ يقرأ الشكل): أُعيدت الكتابة بـPick<Contract, …>
=== station-srv EXIT=1
Test Suites: 2 failed, 134 passed, 136 total
Tests:       2 failed, 873 passed, 875 total
# الحارسُ وحده بعد التصحيح
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
# الاختباراتُ الحيّة للوحدات الممسوسة بالحزمة الثانية على clean (25 ملفّاً: العقود · العملاء · المورّدون · السندات · الدليل · التقارير · الترقيم · الحارسُ الجديد)
=== srv2-245 EXIT=0 261 s ===
Test Suites: 25 passed, 25 total
Tests:       146 passed, 146 total
https://github.com/Arsant4x/mad-app/pull/512
SRV_COMMIT=8bf2e33
RECORD_RESULTS_COMMIT=6a2b0b8
35567834622 8bf2e33 completed/success web-tests-light feat/screen-reads-server-computes
35567834574 8bf2e33 completed/success web-tests feat/screen-reads-server-computes
35564558854 09766ea completed/success web-tests feat/money-text-4-reports
35564558764 09766ea completed/success web-tests-light feat/money-text-4-reports
