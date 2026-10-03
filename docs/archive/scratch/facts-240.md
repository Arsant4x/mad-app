# التوجيه ٢٤٠ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ
docs/session-record-152
5951aaa
#493
Tests:       15 passed, 15 total
# الدمج
#492 CLEAN MERGEABLE 7fe505d
#492 MERGED cea962c
# الخطةُ والنموذج — فرعٌ مستقلّ docs/product-tax-plan
0bd6ca0
#494
docs/mockups/product-tax.html | 186 ++++++++++++++++++++++++++++++++++++++++++
docs/موجز-ضريبة-الصنف.md      |  71 ++++++++++++++++
# حرّاسُ الوثائق على الخطة والنموذج (مع locale-gate)
Test Suites: 5 passed, 5 total
Tests:       19 passed, 19 total
# مصادقةُ الخانة 2 من كتالوج الهيئة
إرشادات مبسطة حول تقديم الإقرار الضريبي
المبيعات للمواطنين (الخدمات الصحية الخاصة/ التعليم الأهلي الخاص)
The-States-Bearing-of-Value-Added-Tax-Due-on-Private-Educational-Services-Provided-to-Citizens.pdf
دون سداد الضريبة المستحقة
# قياسُ القاعدة (التطوير — قراءةً فقط)
invoice_lines | 0.00 | 694
invoice_lines | 15.00 | 2714
quote_lines | 15.00 | 1591
products | 808
zero-rate invoice lines with product | 0
# قياسُ سطح الاختبارات
spec files with taxRate: 0 (ambiguous under the new rule):
8
13
spec files with taxRate: 15:
44
# درسُ الأداة: file أبلغ 6 صفحات
pages=24 rendering 1..24 scale=1.8
pages=10 rendering 1..10 scale=1.6
# السجلُّ بعد التربيع
8b02357
main=cea962c
# ملفّاتُ القياس الأربعة — وصلت رفعاً 2026-09-20 12:26
4b366219-bench.mjs  5156 bytes  mtime=2026-09-20 12:26:48
bb7872e2-bench2.mjs  2642 bytes  mtime=2026-09-20 12:26:49
97ef5057-README.md  611 bytes  mtime=2026-09-20 12:26:49
5dbfbc90-seed.sql  3696 bytes  mtime=2026-09-20 12:26:49
1c77471076a433c0e3d0b8e8c078dab4ed6907693096aad6e688f36108c86aaf
cdbeba5416c8b976ad2f286ae18b259dc44325852b7a4af559eb7c8616e5a065
d2adcc43a535014f3e5cee34fd7f2eff5eba86f1d16bf6da4ccb531b473c5982
830674019bfcdd010e02b77abd8260742fffedf39f2e9396b0eda95350c2dcdc
IDENTICAL bench.mjs
IDENTICAL bench2.mjs
IDENTICAL README.md
IDENTICAL seed.sql
# نهاياتُ الأسطر: مسبارُ grep بـ$'\r$' كذب (عدّ 79 على ملفٍّ LF) — والمصادَقُ tr -cd '\015' بحالتَين معلومتَين
bench.mjs          CR=0 LF=82
bench2.mjs         CR=0 LF=46
README.md          CR=0 LF=8
seed.sql           CR=0 LF=31
# الخطّافُ يرفض *.sql خارج الهجرات بالنوع، و.gitignore يتجاهله
.gitignore:28:*.sql	bench/external-review-2026-09/seed.sql
*.sql)   blocked="$blocked\n  $f  — ملف SQL خارج مجلد الهجرات (مقلب قاعدة؟)"
apps/api/prisma/migrations/*|docker/postgres-init/*|docker/postgres-init-prod/*) continue ;;
# حرّاسُ src/common على الشجرة مع مجلَّد القياس
Test Suites: 2 failed, 59 passed, 61 total
Tests:       8 failed, 361 passed, 369 total
القاعدة متأخّرة بـ3 هجرة: 20260919140000_goods_receipts · 20260919190000_landed_costs · 20260919230000_stock_openings
FAIL src/common/tenant/rls-coverage.live.spec.ts
FAIL src/common/plan-cache-mode.live.spec.ts
# إيداعُ الثلاثة
COMMIT=39a37a4
i/lf    w/lf    attr/-text            	bench/external-review-2026-09/bench.mjs
https://github.com/Arsant4x/mad-app/pull/495
# خطأٌ أُمسك قبل الالتزام: بصمةُ bench2 كُتبت من الذاكرة في رسالة الالتزام (dc44259852 بدل dc44325852) وصُحّحت بمطابقةٍ آلية
wrong-hash-still-present=0
# مُلحَقُ السجلّ على صفّ ق-١٢١٥
COMMIT=ed269c1
Test Suites: 5 passed, 5 total
Tests:       19 passed, 19 total
# حالُ الطلبات الثلاثة (قراءةٌ في أمرها وحدها)
#494 OPEN CLEAN base=main head=0bd6ca0
#495 OPEN CLEAN base=main head=39a37a4
api-unit	pass	1m41s	https://github.com/Arsant4x/mad-app/actions/runs/35502915630/job/106057760343
vitest	pass	1m6s	https://github.com/Arsant4x/mad-app/actions/runs/35502915630/job/106057760381
# جولةُ #493 الخفيفة بعد المُلحَق
WATCH_EXIT=0
#493 CLEAN head=ed269c1
# بوّابةُ التقرير كانت تُسقط أسطرَ الطلبات «#NNN …» تعليقاتٍ — صُحّحت وأُثبتت بحالتَين
✖ غائب عن التقرير: #123 MERGED abc1234
EXIT_missing=1
EXIT_full=0
