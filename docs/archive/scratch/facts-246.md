# التوجيه ٢٤٦ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ — موجة ظ٥ مكدَّسة على docs/session-record-157؛ الحرّاسُ السبعة
Test Suites: 7 passed, 7 total
Tests:       35 passed, 35 total
RECORD_COMMIT=300752f
https://github.com/Arsant4x/mad-app/pull/513
#508 CLEAN head=6a2b0b8
#508 MERGED 1e5ec22
docs/session-record-158 rebased=f110699
#510 base=main
try=1 #509 state=CLEAN
#509 MERGED 01b2cd3
feat/money-text-3-invoices rebased=858c53c
#510 diff after rebase: 22 files changed, 159 insertions(+), 79 deletions(-)
# ق-١٢٤٨/② — التجربةُ على نسخةٍ من المخطَّط خارج المستودع (prisma validate + migrate diff مخطَّطاً إلى مخطَّط، بلا قاعدة) — Invoice→Customer
# A: مفردةٌ ومركّبةٌ معاً على customerId
VALIDATE_A_EXIT=0
DIFF_A_EXIT=0
# DDL المولَّد لـA (يُبقي المفرد ويُضيف المركّب):
CREATE UNIQUE INDEX "customers_companyId_id_key" ON "customers"("companyId", "id");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_customerId_fkey" FOREIGN KEY ("companyId", "customerId") REFERENCES "customers"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
# B: المركّبةُ بدلَ المفردة
VALIDATE_B_EXIT=0
DIFF_B_EXIT=0
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_customerId_fkey";
# ON DELETE على المئة والاثنين والخمسين من الكتالوج (clean): c=CASCADE · r=RESTRICT · n=SET NULL — والتحديثُ كلُّه CASCADE
on_delete counts {"c":35,"r":87,"n":30}
on_update {"c":152}
# C: مركّبٌ بـ SetNull على (companyId, posShiftId) بدل المفرد — Prisma يقبله ويولّد SET NULL على العمودين
VALIDATE_C_EXIT=0
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_posShiftId_fkey" FOREIGN KEY ("companyId", "posShiftId") REFERENCES "pos_shifts"("companyId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
# D: مركّبٌ بـ Cascade على (companyId, invoiceId) بدل المفرد — يقبله ويولّد CASCADE
VALIDATE_D_EXIT=0
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_companyId_invoiceId_fkey" FOREIGN KEY ("companyId", "invoiceId") REFERENCES "invoices"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
# الإثباتُ على القاعدة (mad_app بدور المدير، معاملةٌ تُرجَع — لا أثر): SET NULL مركّبٌ بجانب المفرد ⟵ حذفُ مناوبةٍ عليها ٣ فواتير ينجح (المفردُ يُصفِّر posShiftId أوّلاً بترتيب المُشغِّلات)
{"shift":{"invoices":3},"delete":"SUCCEEDED (unexpected)","leftover_constraints":0}
# وبدلَ المفرد ⟵ الحذفُ يسقط بـ 23502: الصفُّ الفاشل companyId فارغ — فالمركّبُ يُصفِّر companyId مع posShiftId؛ والمفردُ باقٍ بعد الإرجاع
{"shift":{"invoices":3},"delete":"FAILED:  Invalid `prisma.$executeRawUnsafe()` invocation: Raw query failed. Code: `23502`. Message: `Failing row contains (4e130735-6a88-41c4-ab24-ea2b212dbb0b, null, INV-2026-0397, 9e7cb84d-9ff7-41fd-8c6f-b625a3944277, 2026-09-08, 2026-09-08, PAID, 200.00, 30.00, 230.00, null, 2026-09-08 16:26:10.609, 2026","leftover_constraints":0,"single_fk_present_after_rollback":1}
# بوّابةُ الدمج رفضت #510 بحكمٍ لا بتعذّر قراءة: «يمسّ شيفرةً ولم يعمل عليه فحصٌ ثقيل قطّ» (ق-٢٥٤) — فالتربيعُ دفعةُ synchronize لا تُشغّل الثقيل؛ أُعيد التشغيل بمسوّدةٍ ثم جاهز (gh pr close مرفوضٌ من المصنِّف)
35573653903 858c53c in_progress/ web-tests feat/money-text-3-invoices
try=2 #510 state=CLEAN head=858c53c heavy=35573653903 success
#510 MERGED c5e0616
feat/money-text-4-reports rebased=0d972d4
#511 diff after rebase: 22 files changed, 412 insertions(+), 203 deletions(-)
35574533544 0d972d4 in_progress/ web-tests feat/money-text-4-reports
35574533544 0d972d4 completed/success web-tests feat/money-text-4-reports
try=1 #511 state=CLEAN head=0d972d4
#511 MERGED e959706
feat/screen-reads-server-computes rebased=b5111cc
#512 diff after rebase: 30 files changed, 645 insertions(+), 168 deletions(-)
35576233415 b5111cc in_progress/ web-tests feat/screen-reads-server-computes
docs/session-record-158 rebased=15d0132
https://github.com/Arsant4x/mad-app/pull/514
door-01 commit=69b48a9 files_scanned=600 PROBE_VALIDATED=1
door-01: 26 scope items · 3 irreversible (A1 hard delete of posted manual entry + JE gap · A2 fiscal-year delete unlocks closed periods · A3 fiscal year always 12 months vs Companies Law art.16) · 19 deferred with reason · 12 built-but-incomplete
35576233415 b5111cc completed/success web-tests feat/screen-reads-server-computes
try=1 #512 state=CLEAN head=b5111cc
#512 MERGED 90df043
docs/session-record-158 rebased=a0d1ee5
docs/domain-scan-01 rebased=9e191a9 (door 01 + door 02)
merge order done: #508 1e5ec22 -> #509 01b2cd3 -> #510 c5e0616 -> #511 e959706 -> #512 90df043 (five listed; title said six)
doors 01-10 committed on docs/domain-scan-01 head=57f60db (13 commits over origin/main)
scan totals: 204 scope items · 23 irreversible · 123 deferred with reason
door-03 irreversible=0 (reasoned) · door-05 irreversible=4 (cert renewal · authority warnings · transaction flags+prepayment+discount · standard invoice shared before clearance)
door-06 irreversible=3 (proportional deduction m51 · monthly period · boxes 8/9 + carry-forward + corrections)
door-07 irreversible=3 (bank reconciliation · network settlement 1251 · drawer deposit) · door-08 irreversible=3 (asset register · depreciation m7 · key-money amortization 1600)
door-09 irreversible=2 (MFA for platform admin+owner · deactivation does not revoke sessions) · door-10 irreversible=2 (balance sheet as-of with result · general ledger)
doc guards batch1: Test Suites: 2 passed, 2 total / Tests: 8 passed, 8 total
doc guards batch2: Test Suites: 5 passed, 5 total / Tests: 27 passed, 27 total
measured trees declared: door01 c5e0616 · door02 e959706 · doors03-10 90df043
doc lag found: SPEC 4.3 credit limit built (credit-limit.e2e-spec untagged) · CLAUDE §4 2.7 branch assignment UI exists · SPEC 7.6 definition superseded by ق-٢٨١
SAMA Open Banking page 404 (declared limit) · ZATCA data dictionary xlsx unread (declared limit)
RESULTS_COMMIT=af3d094 (ق-١٢٥٠ applied on docs/session-record-158; row line 3319, 4 cells, no NUL)
record guards on results: Test Suites: 4 passed, 4 total / Tests: 24 passed, 24 total
