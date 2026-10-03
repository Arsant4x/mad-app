# التوجيه ٢٤٣ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ — موجة خ٥ مكدَّسة على docs/session-record-154
docs/session-record-155
COMMIT=4aeea79
https://github.com/Arsant4x/mad-app/pull/501
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
# الدمج بالترتيب — قراءةُ الحال في أمرها وحدها
#498 OPEN CLEAN head=da9104a
#498 MERGED 9f92c85
#500 base=main
#499 OPEN UNKNOWN head=4e0bdaa
try=1 #499 state=CLEAN
#499 MERGED 0f7e3ab
# بعد الدمج: تربيعُ #500 على main (السحقُ يقطع النسب) وإعادةُ سيره الثقيل بقلب المسوّدة؛ وتربيعُ سجلّ #501
#500 head=6ec81cf base=main
35526502935 6ec81cf in_progress web-tests pull_request
docs/session-record-155 rebased=9b89819
35526502935 6ec81cf completed/success web-tests
35526502961 6ec81cf completed/success web-tests-light
#500 OPEN CLEAN head=6ec81cf
#500 MERGED e84e955
origin/main=e84e955
# قياسُ الموجز على main e84e955 — سكربتات review-243 (routes-inventory · list-shape · returns-of · number-fields)
GET total=116 without-param=92 paged-in-signature=0
param-less GET = 92 {"array":60,"other":24,"envelope":8}
bare-array list routes (verified by reading returns)=43 of which platform-admin=4 and sub-resource lists with a path param=8
array-GET clients: 46
e2e files reading list bodies as arrays: 53 sites: 151
number-typed fields=245 money/quantity-like=164 other=81
     92 18,2
     12 18,3
     28 18,6
      4 5,2
e2e files with numeric assertions: 83 sites: 738
computed-number producers: services=27 sites=150 · `?? 0` sites=68 in 28 files
controllers=52 · without @RequiresScreen and under TenantGuard with @TenantWide=11 · the six named=6 · writes on the six=17 · @OwnerOnly=15 · open writes=2 (POST /files by design · DELETE /files) · web callers of DELETE /files=0
# ⚠️ عدٌّ أوّل قال 15/14: grep -c على «@OwnerOnly» حسب ذكرَه في تعليقٍ — أُعيد بنمط المُزخرِف في أوّل السطر
x-request-id / requestId hits today=0 · CORS exposedHeaders=absent
ALLOWED_SCREENS=24 · SCREEN_ACTIONS=7 · web hand copy=apps/web/src/api/templates.ts · packages/shared/src/index.ts stale SCREEN_KEYS with 0 importers
existing pagination DTOs=4 (contracts · inventory/movements · journal · transactions): page>=1 · pageSize 1..100 default 25 · search<=200
# الموجزُ على فرعٍ وثائقيّ وطلبٌ على main
docs/ui-agent-requests-brief
COMMIT=6f2b65f
https://github.com/Arsant4x/mad-app/pull/502
Test Suites: 8 passed, 8 total
Tests:       39 passed, 39 total
# صفُّ النتائج ق-١٢٣٢ على docs/session-record-155 (مربَّعاً على main e84e955)
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
COMMIT=3b90ede
# السيرُ على main بعد الدمجَين
35526953311 e84e955 completed/success web-tests main
35526953314 e84e955 completed/success web-tests-light main
35527307131 6f2b65f completed/success web-tests-light docs/ui-agent-requests-brief
35527399838 web-tests-light 3b90ede completed/success
#494 CLEAN head=0bd6ca0
#501 CLEAN head=3b90ede
#502 CLEAN head=6f2b65f
