# التوجيه ٢٤٢ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ (مع الوجه التاسع عشر في CLAUDE.md)
docs/session-record-154
COMMIT=863a242
https://github.com/Arsant4x/mad-app/pull/498
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
# الدمج — قراءةُ الحال في أمرها وحدها قبل كلٍّ
#496 OPEN CLEAN head=532e2e5
#496 MERGED c10fa57
try=1 #497 state=CLEAN
#497 MERGED 68b9096
origin/main=68b9096
# بناءُ ⑧ — الفرع feat/product-tax-server من main 68b9096
files=582 hits=20
files=583 hits=3
# حرّاسُ الوحدة الجديدة والملموسة
Test Suites: 4 passed, 4 total
Tests:       25 passed, 25 total
# حارسُ النسبة الواحدة — مقيسٌ على الشجرة ثم مُثبَتٌ بالعكس
Tests:       3 passed, 3 total
injected=1
EXIT_broken=1
    +   "apps/api/src/pos/pos.service.ts:720 ⟵ 15 في «POS_TAX_RATE_INJECTED = 15»",
restored injected=0
restore IDENTICAL to backup
# تصريحُ الفئة في حِمل الاختبارات
files=24 sites=36
files=6 sites=10
# الهجرةُ على نسخة المحطة mad_app_lc
MIGRATE_EXIT=0
products | LEGACY_STANDARD | 827
invoice_lines | LEGACY_ZERO | 696
invoice_lines | S | 2756
quote_lines | S | 1591
# الحارسُ الحيّ product-tax.e2e-spec على mad_app_lc — مرّتان خضراوان
=== product-tax EXIT=0 81 s ===
=== product-tax-2 EXIT=0 157 s ===
Tests:       7 passed, 7 total
# الإثباتُ بالعكس — ثلاثةُ كسورٍ بصياغةٍ محتملة (ولاثنان لم يُترجما فلم يُثبتا شيئاً: Tests: 0 total)
break1 landed=1
=== product-tax-break1 EXIT=1 35 s ===
break2 landed=1
=== product-tax-break2 EXIT=1 55 s ===
break3c landed=1
=== product-tax-break3c EXIT=1 182 s ===
Tests:       4 failed, 3 passed, 7 total
restored break1 IDENTICAL
restored break2 IDENTICAL
restored break3c IDENTICAL
# المحطةُ الأولى بعاملَين سقط فيها عاملٌ بـSIGTERM والذاكرةُ الحرّة 229 MB — أُوقفت وأُعيدت بعاملٍ واحد
free MB: 229  total MB: 7975
FAIL src/common/strict-gate.spec.ts
    A jest worker process (pid=19672) was terminated by another process: signal=SIGTERM, exitCode=null. Operating system logs may contain more information on why this occurred.
jest processes left: 0
free MB now: 2104
# المحطةُ بعاملٍ واحد — 131 مجموعة؛ الساقطاتُ الثلاث: حارسا الحرّاس على الحارس الشجريّ (أُصلحا) وdimension-coverage.live (بقايا mad_app_lc المعروفة)
=== station-1w EXIT=1 930 s ===
Test Suites: 3 failed, 128 passed, 131 total
Tests:       3 failed, 835 passed, 838 total
    +   "common/vat/vat-rate-single-source.spec.ts ⟵ rateLiteralOffences",
    +   "common/vat/vat-rate-single-source.spec.ts",
FAIL src/journal/dimension-coverage.live.spec.ts (314.361 s)
# بعد الإصلاح: الحارسُ الشجريّ مع حرّاس الحرّاس الأربعة
Test Suites: 5 passed, 5 total
Tests:       25 passed, 25 total
# الالتزامُ الأوّل — الخادم
COMMIT=370cc6b
 71 files changed, 1692 insertions(+), 178 deletions(-)
free MB: 1126
# test:clean على قاعدةٍ من الصفر — 258 ملفّاً بأربع شرائح؛ الساقطان صفّا «صنفٌ قديم» بلا فئة في مثبّتَي اختبار (قالبٌ مُلقى يخفيهما عن tsc)
=== test:clean EXIT=1 1212 s — end 14:31:16Z ===
▶ الحزمة على mad_app_clean: 258 ملفّاً · شرائح 4 · سقفُ الكومة 2658 م.ب (مضيفٌ 8 ج.ب)
Test Suites: 1 failed, 64 passed, 65 total
Test Suites: 65 passed, 65 total
Test Suites: 64 passed, 64 total
Test Suites: 1 failed, 63 passed, 64 total
Argument `taxCategory` is missing.
=== legacy-fixtures EXIT=0 71 s ===
Tests:       14 passed, 14 total
# الطلبُ الأوّل — الخادم
COMMIT=d21f593
https://github.com/Arsant4x/mad-app/pull/499
# الطلبُ الثاني — الواجهة (feat/product-tax-web فوق d21f593)
# تعديلٌ حُجب مرةً لأن playwright من جلسةٍ أخرى (D:\worktrees\ui-rules) كان يقرأ node_modules في D:\mad-app — انتظرتُ انتهاءه ولم أتجاوز البوّابة
[18880] "C:\Program Files\nodejs\node.exe" D:\mad-app\node_modules\playwright\lib\worker\workerProcessEntry.js
# tsc -b على الواجهة — مُصادَقٌ بخطأٍ مزروع (EXIT=2) ثم نظيفٌ
src/__probe_type_error.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT=2
tsc EXIT=0
# vitest: 23 ملفّاً/102 اختباراً (كان 22/97) — vat.test.ts خمسة
 Test Files  23 passed (23)
      Tests  102 passed (102)
 ✓ src/lib/vat.test.ts (5 tests)
# مرآةُ قائمة الواجهة في exemption-reasons.spec — 11 اختباراً؛ ومُثبَتةٌ بالعكس بقلب selectable على HEA
Tests:       11 passed, 11 total
break landed (file differs from backup)
    × الرموزُ والفئاتُ والنصوصُ والقابليةُ — صفّاً بصفّ وبالترتيب نفسِه (11 ms)
Tests:       1 failed, 10 passed, 11 total
restored byte-exact
# حرّاسُ common/vat على الشجرة بعد الواجهة
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
# الالتزامُ الثاني — الواجهة
COMMIT=67b2ea0
 16 files changed, 561 insertions(+), 60 deletions(-)
# محطةُ ما قبل الدفع على شجرة الواجهة (67b2ea0) بعاملٍ واحد — الساقطان: حارسُ إعلان الماسحين على مرآتي النصّية (يلزم readsDeclaredStrings) وdimension-coverage.live (بقايا mad_app_lc)
=== station-1w EXIT=1 429 s ===
Test Suites: 2 failed, 129 passed, 131 total
Tests:       2 failed, 838 passed, 840 total
FAIL src/common/guard-reads-declared.spec.ts
    +   "common/vat/exemption-reasons.spec.ts",
# CI الثقيل على #499 (d21f593) — db-integration ساقطة على icv-concurrency.live ①: الخاسرُ في السباق رُفض previous_unstamped (ق-١١٩٨/⑦) — مصادفةُ توقيتٍ لا شيفرة
https://github.com/Arsant4x/mad-app/actions/runs/35516939838
db-integration	fail	7m0s
FAIL src/zatca/icv-concurrency.live.spec.ts (10.296 s)
    استدعاء تزامنيّ رُفض بدل أن يتقارب — zatca.previous_unstamped
Tests:       4 failed, 80 passed, 84 total
35487700910 5beba3e success main push 2026-09-20T03:52:31Z
35486020489 9e22ba9 success fix/review-batch-1 pull_request 2026-09-20T03:13:35Z
# إصلاحُ icv-concurrency.live ① — الطابورُ يُمثَّل: على previous_unstamped ينتظر حالةً (لا موقعَ محجوزاً بلا بصمة) ثم يعيد؛ والتداخلُ مُلزَم بإبطاء أوّل توقيع 600 ms (§8.8 الوجه الثالث)
=== live-icv-2 EXIT=0 35 s ===
=== live-icv-3 EXIT=0 32 s ===
Tests:       5 passed, 5 total
# أوّلُ صياغةٍ سقطت على مسبارها: mockRestore يمسح سجلَّ النداءات فقُرئ صفرُ توقيعاتٍ — العدُّ يُلتقط قبل الاستعادة
    Expected number of calls: 2
    Received number of calls: 0
# الإثباتُ بالعكس (أ): الشكلُ القديم (submitInvoice مباشرةً بلا تمثيل الطابور) تحت التداخل المُلزَم يسقط في كل تشغيل — مرّتان
breakA landed
=== live-icv-breakA-1 EXIT=1 35 s ===
Tests:       4 failed, 1 passed, 5 total
=== live-icv-breakA-2 EXIT=1 34 s ===
# الإثباتُ بالعكس (ب): تفرّعُ السلسلة (previousChainHash يتخطّى سلفاً بلا بصمة إلى الأصل) — الاختبارُ القديم كان يمرّ عليه، والجديدُ يسقط: chainWaits صفر
breakB landed
=== live-icv-breakB EXIT=1 30 s ===
Tests:       1 failed, 4 passed, 5 total
    Expected: 1
    Received: 0
hash-chain.util.ts restored byte-exact = HEAD
restored fixed spec byte-exact
# حرّاسُ الحرّاس على الملفّ المعدَّل
Test Suites: 6 passed, 6 total
Tests:       37 passed, 37 total
# الالتزامان: إصلاحُ ICV على الخادم، وإعلانُ المرآة على الواجهة (المربَّعة عليه)
COMMIT=4e0bdaa
COMMIT=ba02853
# المحطةُ على الشجرة النهائية (ba02853) بعاملٍ واحد — الساقطُ الوحيد بقايا mad_app_lc
=== station-1w EXIT=1 394 s ===
Test Suites: 1 failed, 130 passed, 131 total
Tests:       1 failed, 839 passed, 840 total
# الطلباتُ المفتوحة قبل الدفع
#494 OPEN CLEAN head=0bd6ca0 base=main
#498 OPEN CLEAN head=7358106 base=main
# الطلبُ الثاني — الواجهة، مكدَّسٌ على الخادم؛ والسيرُ الثقيل أُعيد على #499 بقلب المسوّدة (draft→ready)
https://github.com/Arsant4x/mad-app/pull/500
#500 draft=false head=ba02853 base=feat/product-tax-server
#499 draft=false head=4e0bdaa
35519900100 web-tests ba02853 completed/success
35519900119 web-tests-light ba02853 completed/success
35519909690 web-tests-light 4e0bdaa completed/success
#500 CLEAN
# السيرُ الثقيل بعد الإصلاح — أخضرُ على الطلبَين، ومجسُّ ICV مرّ على قاعدة السير الفارغة
35519912012 web-tests 4e0bdaa success
#499 CLEAN head=4e0bdaa
#500 CLEAN head=ba02853
2026-09-20T15:34:03.8939650Z PASS src/zatca/icv-concurrency.live.spec.ts (13.76 s)
# صفُّ النتائج ق-١٢٢٦ على docs/session-record-154 — حرّاسُ السجلّ ثم الدفع
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
COMMIT=da9104a
# حرّاسُ الخادم الثمانيةَ عشر التي تمسح شجرةَ الواجهة — على الشجرة بعد الشاشات
Test Suites: 18 passed, 18 total
Tests:       113 passed, 113 total
35520421377 web-tests-light da9104a success
#498 CLEAN head=da9104a
