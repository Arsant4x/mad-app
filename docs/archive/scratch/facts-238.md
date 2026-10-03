# facts-238 — تُكتب لحظةَ وقوع كلِّ رقم
# السجلّ قبل التنفيذ
docs/session-record-150
0819ae3
#489
Tests:       15 passed, 15 total
ق-١١٩٤
ق-١٢٠٠
ق-١٢٠١
# الدمج
#487
9645d0b
#488
91a7f83
33e08eb
# ④ شكل P2002 المقيس
meta={"modelName":"Account","target":null}
(not available)
Tests:       6 passed, 6 total
# ① الحارس المغلق افتراضياً
[إعلان] 296 مساراً · شاشة 235 · للمالك 32 · لكلّ فاعل 28 · قشرة 1
⛔ 27 مساراً تحت TenantGuard بلا إعلانٍ كافٍ
Tests:       7 passed, 7 total
PATCH /activities/primary
# ③ المهلة
946 ms
ZATCA_HTTP_TIMEOUT_MS
# السبعُ المتأثّرة بعد ⑦ و② على lc (zatca-chain-7c)
Test Suites: 7 passed, 7 total
Tests:       64 passed, 64 total
72 s
# tsc على apps/api بعد الحزمة
TSC EXIT=0
# الوحدات المتأثّرة (egs-unit · sync-stamp · retry-on-conflict.util · tenant-guard-declared · local-day)
Test Suites: 5 passed, 5 total
Tests:       30 passed, 30 total
# قياسُ حارس test/ قبل الإصلاح (local-day على الجذرين)
⛔ 7 استدعاءً لدالّةِ يومٍ محلّيةٍ بلا استثناءٍ ولا إعلان:
test/contract-cancellation-settlement.e2e-spec.ts:36
test/deletion-requests.e2e-spec.ts:391
test/receivables-exposure.e2e-spec.ts:38
test/stock-expiry.e2e-spec.ts:30
test/subscription.e2e-spec.ts:28
test/warranty-expiry.e2e-spec.ts:54
# حارس test/ بعد الإصلاح — local-day على الجذرين
Tests:       7 passed, 7 total
# الملفّات الستّة المتأثّرة على lc (local-day-test-6 — سبعُ مجموعات: النمطُ التقط src/deletion-requests/personal-data-erasure.spec أيضاً)
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
# قياسُ رقم المراجعة «67 حارساً نصّياً» على الشجرة (ق-١١٩٥ — يُقاس لا يُنقل)
spec files under src: 128
specs reading files (readFileSync): 76
specs parsing an AST (createSourceFile): 5
text-only readers: 72
reads .ts code as text: 61
reads migrations/sql: 6
other (md/yml/json/…): 5
AST guards: src/common/branch-read-declared.spec.ts src/common/local-day.spec.ts src/common/strict-gate.spec.ts src/common/support-entry-live-grant.spec.ts src/common/tenant/tenant-guard-declared.spec.ts 
# الالتزامُ الأوّل للحزمة على fix/review-batch-1
9e6f438
58 files changed, 1174 insertions(+), 228 deletions(-)
# خطّافُ الأسرار رفض المساعدَ zatca-credential.ts (رأسُ PEM قالباً نصّياً) — فصار بالمكتبة
x509.PemConverter.encode(pkcs8, x509.PemConverter.PrivateKeyTag)
# zatca-http-timeout بعد التبديل (zatca-timeout-2)
Tests:       1 passed, 1 total
# الإثباتُ العكسيّ (reverse-proof-238.sh — الأساسُ 91a7f83، والاستعادةُ من 9e6f438 ببوّابة ق-٩٨٩) — كلٌّ سقط على كسره وعاد
RUN rp1-guard EXIT=1 · Tests:       3 failed, 4 passed, 7 total
RUN rp1-guard-ast EXIT=1 · Tests:       1 failed, 4 passed, 5 total
⛔ 6 مساراً تحت TenantGuard بلا إعلانٍ كافٍ:
RUN rp2-status EXIT=1 · Tests:       2 failed, 2 total
expected 400 "Bad Request", got 200 "OK"
RUN rp3-timeout EXIT=1 · Tests:       1 failed, 1 total
thrown: "Exceeded timeout of 15000 ms for a test.
RUN rp4-retry EXIT=1 · Tests:       2 failed, 4 passed, 6 total
RUN rp4-retry-shape EXIT=1 · Tests:       1 failed, 1 passed, 2 total
RUN rp5-payments EXIT=1 · Tests:       2 failed, 14 passed, 16 total
expected 409 "Conflict", got 201 "Created"
RUN rp6-cancelled EXIT=1 · Tests:       1 failed, 6 passed, 7 total
RUN rp7-chain EXIT=1 · Tests:       2 failed, 18 passed, 20 total
=== الشجرةُ بعد الإثبات: dirty=0 HEAD=9e6f438
# الرقعةُ ④ الأولى كانت مكتوبةً بيدٍ فرُفضت (corrupt patch) — أُعيد توليدُها من diff حقيقي
error: corrupt patch at D:/mad-app-scratch/review-238/break-4-any-p2002.patch:13
# موجزُ ⑧ (ضريبةُ الصنف) — فرعٌ مستقلّ docs/brief-product-tax
807adb7
#490
docs/موجز-ضريبة-الصنف.md | 165 +++++++++++++++++++++++++++++++++++++++++++++++
# قياساتُ ⑧ من الشيفرة
const POS_TAX_RATE = 15;
9 أسطر في 4 ملفّات
0 ملفّ يُصدر TaxExemptionReasonCode
salesStandard = Σ invoice.subtotal
# مصادرُ ⑧ من كتالوج الهيئة
20230519_ZATCA_Electronic_Invoice_XML_Implementation_Standard_%20vF.pdf
Simplified_VAT_Filing_Guidelines.pdf
eServices_Manual_009.pdf
# المحطةُ الأولى على lc (station-run.txt — أمسكت ثلاثةَ حرّاس وعينَ ④)
Test Suites: 4 failed, 124 passed, 128 total
Tests:       6 failed, 813 passed, 819 total
FAIL src/zatca/icv-concurrency.live.spec.ts
FAIL src/common/branch-read-declared.spec.ts
FAIL src/common/probe-two-cases.spec.ts
⛔ 2 قراءةً جامعةً على نموذجِ فرعٍ بلا مرشِّحٍ ولا إعلان:
# التزامُ إصلاحات المحطة
32e1752
# الإثباتُ العكسيّ لـ④ على المميّز النهائي (run3)
RUN rp4-retry EXIT=1 · Tests:       3 failed, 4 passed, 7 total
RUN rp4-retry-shape EXIT=1 · Tests:       1 failed, 1 passed, 2 total
# المحطةُ الثانية على lc بعد الإصلاحات (station-run-2.txt) — الساقطُ الوحيد بقيّةُ lc المعروفة
Test Suites: 1 failed, 127 passed, 128 total
Tests:       1 failed, 819 passed, 820 total
FAIL src/journal/dimension-coverage.live.spec.ts
187 s
# test:clean الأوّل على 32e1752 (test-clean-run.txt — 254 ملفّاً · 4 شرائح · 774 s)
FAIL test/subprocessor-consent.e2e-spec.ts
FAIL test/zatca-stamp.e2e-spec.ts
FAIL test/zatca-transport-failure.e2e-spec.ts
▶ أحكامُ الشرائح: FAIL · PASS · FAIL · FAIL ⇒ FAIL
Expected substring: "مالك الحساب"
Received string:    "هذا القرار لمالك المنشأة وحده"
# إصلاحاتُ test:clean — الالتزام الثالث
9e22ba9
# الثلاثةُ والحارسان بعد الإصلاح على lc (clean-fix-1)
Test Suites: 6 passed, 6 total
Tests:       35 passed, 35 total
# حرّاسُ الوثائق بعد تصحيح CLAUDE.md §4
Test Suites: 4 passed, 4 total
Tests:       16 passed, 16 total
# حارسُ الإعلان الشجريّ (declared-guard-1.log): بعد إعلان السبعة المقيسة بالنصّ زاد خمسةً بسبعةٍ وعشرين مساراً
5 متحكّماتٍ زادها الحارسُ الشجريّ
activities/activities.controller.ts
files/files.controller.ts
notifications/notifications.controller.ts
tasks/tasks.controller.ts
zatca/zatca.controller.ts
# test:clean الثاني على 9e22ba9 — أخضرُ كلُّه
Tests:       339 passed, 339 total
Tests:       391 passed, 391 total
Tests:       393 passed, 393 total
Tests:       460 passed, 460 total
▶ أحكامُ الشرائح: PASS · PASS · PASS · PASS ⇒ PASS
# طلبُ الحزمة
#491
9e22ba9
# الثقيلُ على #491 (9e22ba9)
35486020489
2026-09-20T03:13:35Z → 2026-09-20T03:19:43Z
playwright: success
nginx-cache: success
db-integration: success
CLEAN MERGEABLE
# السجلُّ بالنتائج
ca24310
# مواقعُ محجوزةٌ بلا بصمة على قاعدة التطوير mad_app اليوم (قراءةً فقط — icv-residue-dev-count.sql)
122
Unsupported format of 'raw' argument. Must be one of DER, PE | 100
Too big integer | 22
