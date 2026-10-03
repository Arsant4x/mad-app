# التوجيه ٢٤٩ — القسم ١: دمجُ العشرة بترتيب §٧ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ — موجة ظ٨ (ق-١٢٦٣ … ق-١٢٦٨) على docs/session-record-160 (#525) — الرقمُ التالي المتاح صار ق-١٢٦٩
stack tips recorded before touching any branch (gh pr view, headRefOid): #525 deb6b88 (before the ظ٨ record) · #526 7b5f9a9 · #527 8f90af3 · #528 b679c88 · #529 f7ff417 · #530 d347275 · #531 74df434 · #532 aaa32c5 · #533 d448837 · #534 f19d26e
record guards ظ٨ on docs/session-record-160 (one suite at a time, 1536 MB): registry-numbering 5/5 · rule-extension-attached 3/3 · locale-gate 4/4 · registry-not-with-code 3/3 · no-id-scan 4/4 · no-silent-skip 3/3 · strict-gate 13/13 — 35 passed, all EXIT=0
RECORD_Z8_COMMIT=0b18599 (docs/session-record-160 · #525 — pushed before any merge)
#525 checks after the ظ٨ push: vitest=SUCCESS · api-unit=SUCCESS (docs-only — light CI)
try=1 #525 state=UNSTABLE (checks in progress) · try=2 #525 state=CLEAN head=0b18599
#525 MERGED 62b5f02
try=1 #527 state=UNKNOWN (recompute after main moved) · try=2 #527 state=CLEAN head=8f90af3
#527 MERGED a6c647e
#528 retargeted to main before #526
try=1 #526 state=UNKNOWN · try=2 #526 state=CLEAN head=7b5f9a9
#526 MERGED 76271f2
feat/bank-reconciliation rebased=291caef onto 76271f2 with old base 7b5f9a9 (ancestor-checked) — 17 files changed, 907 insertions(+), 12 deletions(-) · prisma validate: valid (draft→ready re-trigger)
#529 retargeted to main before #528
#528 checks after rebase: api-unit=SUCCESS · db-integration=SUCCESS · vitest=SUCCESS · nginx-cache=SUCCESS · playwright=SUCCESS
try=1 #528 state=CLEAN head=291caef
#528 MERGED e383b08
feat/cash-deposits rebased=a4fe6b6 onto e383b08 with old base b679c88 (ancestor-checked) — 23 files changed, 973 insertions(+), 32 deletions(-) · prisma validate: valid (draft→ready re-trigger)
#530 retargeted to main before #529
#529 checks after rebase: vitest=SUCCESS · api-unit=SUCCESS · db-integration=SUCCESS · nginx-cache=SUCCESS · playwright=SUCCESS
try=1 #529 state=CLEAN head=a4fe6b6
#529 MERGED 21002a4
feat/network-settlement rebased=3b01eea onto 21002a4 with old base f7ff417 (ancestor-checked) — 22 files changed, 1292 insertions(+), 22 deletions(-) · prisma validate: valid (draft→ready re-trigger)
#531 retargeted to main before #530
#530 checks after rebase: vitest=SUCCESS · api-unit=SUCCESS · db-integration=SUCCESS · nginx-cache=SUCCESS · playwright=SUCCESS
try=1 #530 state=CLEAN head=3b01eea
#530 MERGED f3fad82
feat/buyer-kind rebased=0f9f493 onto f3fad82 with old base d347275 (ancestor-checked) — 95 files changed, 824 insertions(+), 158 deletions(-) · prisma validate: valid (draft→ready re-trigger)
#532 retargeted to main before #531
#531 checks after the first rebase (0f9f493): api-unit=SUCCESS · vitest=FAILURE · nginx-cache=FAILURE · playwright=FAILURE · db-integration=FAILURE — two collisions of the stack, both mine: (a) the web build (`tsc -b` in CI, noUnusedLocals) failed on `src/pages/pos/PosPage.tsx(9,1): error TS6133: 'Invoice' is declared but its value is never read` — an unused import left by ⑤A4; oxlint had printed it as a warning in 248 and I read it as pre-existing; the heavy run on the ORIGINAL head 74df434 (run 35668182426) was already red for the same reason and report 248 called #531 ready without reading its CI — a miss, recorded; (b) db-integration: `vat-declaration-limits.e2e-spec.ts` (from #527, merged before this level) posts a customer without `kind` ⟵ 400 under ②A1 — the only customer POST in test/ without a kind (multi-line-aware count)
fix on feat/buyer-kind: unused import removed + `kind: 'NATURAL'` on the #527 spec — web `tsc -b` EXIT=0 locally; vat-declaration-limits + customer-kind on clean: Test Suites: 2 passed, 2 total / Tests: 5 passed, 5 total (70 s)
FIX_531_COMMIT=e444aa4 (pushed on top of the rebase; draft→ready re-trigger)
#531 checks after the fix: nginx-cache=SUCCESS · vitest=SUCCESS · api-unit=SUCCESS · db-integration=SUCCESS · playwright=SUCCESS
try=1 #531 state=CLEAN head=e444aa4
#531 MERGED e78d90b
feat/line-discount rebased=4e02550 onto e78d90b with old base 74df434 (ancestor-checked) — 21 files changed, 260 insertions(+), 20 deletions(-) · prisma validate: valid · web tsc -b EXIT=0 locally (draft→ready re-trigger)
#533 retargeted to main before #532
#532 checks after rebase: vitest=SUCCESS · api-unit=SUCCESS · db-integration=SUCCESS · nginx-cache=SUCCESS · playwright=SUCCESS
try=1 #532 state=CLEAN head=4e02550
#532 MERGED 21b8189
feat/prepayment-invoice rebased=0c28e98 onto 21b8189 with old base aaa32c5 (ancestor-checked) — 34 files changed, 1164 insertions(+), 43 deletions(-) · prisma validate: valid · web tsc -b EXIT=0 locally (draft→ready re-trigger)
#534 retargeted to main before #533
#533 checks after rebase: vitest=SUCCESS · api-unit=SUCCESS · db-integration=SUCCESS · nginx-cache=SUCCESS · playwright=SUCCESS
try=1 #533 state=CLEAN head=0c28e98
#533 MERGED ace0dc8
feat/ksa2-flags rebased=7d57988 onto ace0dc8 with old base d448837 (ancestor-checked) — 14 files changed, 224 insertions(+), 28 deletions(-) · no schema in the diff (draft→ready re-trigger)
#534 checks after rebase: api-unit=SUCCESS · nginx-cache=SUCCESS · db-integration=SUCCESS · vitest=SUCCESS · playwright=SUCCESS
try=1 #534 state=CLEAN head=7d57988
#534 MERGED 2cabb58
open PRs after the ten merges: 0
migrate deploy after the merges: mad_app (dev) 2 pending applied ⟵ 140 migrations, no pending · mad_app_lc 2 pending applied ⟵ 140, no pending · mad_app_clean already at 140, no pending; prisma generate EXIT=0
main after the merges: 2cabb58 — heavy run 35691874261 completed success · light run 35691874331 completed success (and ace0dc8 before it: both success)
merge commits in order: #525 62b5f02 · #527 a6c647e · #526 76271f2 · #528 e383b08 · #529 21002a4 · #530 f3fad82 · #531 e78d90b · #532 21b8189 · #533 ace0dc8 · #534 2cabb58
