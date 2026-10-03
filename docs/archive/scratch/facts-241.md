# التوجيه ٢٤١ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ
docs/session-record-153
COMMIT=9add31a
https://github.com/Arsant4x/mad-app/pull/496
Test Suites: 5 passed, 5 total
Tests:       19 passed, 19 total
# الدمج — قراءةُ الحال في أمرها وحدها قبل كلٍّ
#493 OPEN CLEAN head=ed269c1
#493 MERGED 2b5c077
#495 OPEN UNKNOWN head=39a37a4
try=0 state=CLEAN
#495 MERGED 7d22c37
# استثناءُ seed.sql — الإثباتُ بثلاث حالاتٍ على الخطّاف المعدَّل قبل الالتزام
seed.sql IDENTICAL to upload
hook CR=0 LF=79
.gitignore:32:!bench/external-review-2026-09/seed.sql	bench/external-review-2026-09/seed.sql
  bench/external-review-2026-09/seed.sql  — يحتوي هاش كلمة مرور argon2id
HOOK_EXIT_planted=1
  bench/external-review-2026-09/other.sql  — ملف SQL خارج مجلد الهجرات (مقلب قاعدة؟)
HOOK_EXIT_other=1
add 'bench/external-review-2026-09/seed.sql'
HOOK_EXIT_real=0
index-blob sha256=830674019bfcdd010e02b77abd8260742fffedf39f2e9396b0eda95350c2dcdc
# إيداعُ seed.sql بالاستثناء
COMMIT=c1c111e
committed-blob sha256=830674019bfcdd010e02b77abd8260742fffedf39f2e9396b0eda95350c2dcdc
i/lf    w/lf    attr/text eol=lf      	.githooks/pre-commit
Test Suites: 59 passed, 59 total
Tests:       361 passed, 361 total
https://github.com/Arsant4x/mad-app/pull/497
# السجلُّ بعد التربيع على main
HEAD=a5185e5 base=7d22c37
origin/main=7d22c37
# جولةُ #497 الخفيفة وحالُ الطلبات
WATCH_EXIT=0
#497 CLEAN head=c1c111e
#494 CLEAN head=0bd6ca0
#496 OPEN CLEAN head=a5185e5
# صفُّ النتائج ق-١٢٢٠
COMMIT=532e2e5
Test Suites: 5 passed, 5 total
Tests:       19 passed, 19 total
#496 CLEAN head=532e2e5
