# التوجيه ٢٤٧ — الوقائع لحظةَ وقوعها
# السجلُّ قبل التنفيذ — موجة ظ٦ على docs/session-record-159 (مكدَّسة على 158)؛ الحرّاسُ السبعة في دفعتين (السبعةُ معاً أسقطت ثلاثاً «failed to run» بضيق الموارد فأُعيدت وحدَها)
record guards: Test Suites: 4 passed / Tests: 15 passed (rule-extension-attached · registry-numbering · locale-gate · registry-not-with-code)
record guards: Test Suites: 3 passed, 3 total / Tests: 20 passed, 20 total (no-id-scan · no-silent-skip · strict-gate)
RECORD_COMMIT=4f37536
https://github.com/Arsant4x/mad-app/pull/515
try=1 #513 state=CLEAN head=af3d094
#513 MERGED 35ee3c2
docs/session-record-159 rebased=93fb8f4
try=1 #514 state=UNKNOWN (recompute after main moved) · try=2 #514 state=CLEAN head=57f60db
#514 MERGED eb4ba69
https://github.com/Arsant4x/mad-app/pull/516
DOCS_FIX_COMMIT=02b5b41
spec-status regenerated: {"rows":277,"withStatus":183,"docDone":90,"proven":85,"unproven":5,"lagging":0,"taggedTests":189,"testCount":1737}
spec-tags guard: Test Suites: 1 passed, 1 total / Tests: 7 passed, 7 total
FIX1_COMMIT=9f582cb (journal reverse-not-delete)
measure-before-fix (old service+controller from origin/main, case ①): expected 409 "Conflict", got 204 "No Content"
journal-reversal e2e on fix (clean): Test Suites: 1 passed, 1 total / Tests: 5 passed, 5 total
reverse-proof fix1 (unswapped lines, case ②): Expected: 450 / Received: 0
FIX1_COMMIT2=fde77ea (web reverse action + tests cleanup by reversal)
affected e2e set on fix (clean): Test Suites: 8 passed, 8 total / Tests: 44 passed, 44 total
# ق-١٢٥٢ — تجربةُ مخرج الثلاثين على مفتاحٍ واحد (invoices.posShiftId → pos_shifts، SET NULL مفرداً + NO ACTION مركّباً) في معاملةٍ مُرجَعة على mad_app بدور المدير
{"db":"postgresql://mad_app:***@localhost:5432/mad_app","a":{"invoices":3,"delete":"SUCCEEDED","posShiftId_null":true,"companyId_intact":true},"b":{"crossCompanyWrite":"REJECTED","sqlstate":"23503"},"c":{"sameCompanyWrite":"ACCEPTED"},"d":{"withoutComposite_crossCompanyWrite":"ACCEPTED (as expected — the probe sees)"},"leftover":{"constraints":0,"indexes":0}}
composite experiment verdict: (a) PASS · (b) PASS ⇒ build the 152 in batches
station api-unit fix1 (clean, 1 worker): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 305 s
https://github.com/Arsant4x/mad-app/pull/517
# ق-١٢٥٣/② — حذفُ السنة المالية
measure-before-fix (fix2, unfixed FiscalService.remove, case ①): expected 409 "Conflict", got 204 "No Content" — السنةُ بفترتها المقفلة حُذفت
FIX2_COMMIT=129cf02 (fiscal-year delete guard — CLOSED periods only; السجلُّ ذكر «أو قيودٌ بتاريخٍ داخلها» وضُيِّق معلَناً)
fiscal-year-delete-guard e2e on fix (clean): Test Suites: 1 passed, 1 total / Tests: 2 passed, 2 total
reverse-proof fix2 (refusal disabled, injected=1): expected 409 "Conflict", got 204 "No Content" — restored dirty=0
affected e2e set on fix2 (clean): Test Suites: 5 passed, 5 total / Tests: 32 passed, 32 total (fiscal-year-delete-guard · opening-stock · journal-reversal · opening-balance-entries · fiscal-period-lock)
# مقياسُ الأيام (تقرير ٢١٨ §٤ — مقروءٌ من نصّ الجلسة بموضعه 244011471): يومٌ لكلِّ هجرةٍ بعدٍّ وإعلان · يومٌ لكلِّ ثلاثة ملفّاتِ خدمة · يومٌ لكلِّ شاشة · نصفُ يومٍ لكلِّ اختبارٍ حيٍّ يُمسّ أو يُضاف
# ق-١٢٥٢ — إحصاءُ ما قبل المركّب على mad_app بدور المدير (المسبارُ مُصادَق: يرى الصفوف، ويرى صفّاً عابراً محقوناً في معاملةٍ مُرجَعة)
fk-census b1 (dev): fks=56 checked=56 mismatchedRows=0 — probe rowsSeen=239 (branches) · positive branches.activityId→business_activities seenAfterInjection=1
fk-census b2 (dev): fks=29 checked=29 mismatchedRows=0 — probe rowsSeen=3004 (invoices) · positive invoices.posShiftId→pos_shifts seenAfterInjection=1
fk-census b3 (dev): fks=35 checked=35 mismatchedRows=0 — positive invoices.journalEntryId→journal_entries seenAfterInjection=1
fk-census b4 (dev): fks=30 checked=30 mismatchedRows=0 — positive journal_lines.propertyId→properties seenAfterInjection=1
station api-unit fix2 attempt 1 (clean): EXIT=134 after 79 suites — heap OOM while the fk-census ran beside it (§8.20: the tool changed the measured); re-run alone
station api-unit fix2 attempt 2 alone (clean, 1 worker): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 281 s
https://github.com/Arsant4x/mad-app/pull/518
# ق-١٢٥٣/③ — تعطيلُ الموظف
measure-before-fix (fix3, unfixed): access after STOPPED → 403 at once (the guard reads status from the DB) — «يبقى داخلاً حتى انتهاء رمز التحديث» لا يقع كما كتبه المسح
measure-before-fix (fix3, unfixed, case ② refresh while STOPPED): expected 401 "Unauthorized", got 403 "Forbidden" — the presented token is rotated then the status refuses
measure-before-fix (fix3, unfixed, case ③ quiet device after re-activation): expected 401 "Unauthorized", got 200 "OK" — رموزُ التحديث لا تُبطَل بالتعطيل: جهازٌ صامت يعود بلا دخولٍ جديد
FIX3_COMMIT=23fc832 (deactivation revokes all refresh tokens)
company-user-deactivation e2e on fix (clean): Test Suites: 1 passed, 1 total / Tests: 3 passed, 3 total
reverse-proof fix3 (revocation disabled, injected=1): ② expected 401 "Unauthorized", got 403 "Forbidden" · ③ expected 401 "Unauthorized", got 200 "OK" — restored dirty=0
affected e2e set on fix3 (clean): Test Suites: 5 passed, 5 total / Tests: 31 passed, 31 total (company-user-deactivation · branches · master-data-lock · employees-tenant-isolation · permission-actions)
station api-unit fix3 (clean, 1 worker): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 291 s
https://github.com/Arsant4x/mad-app/pull/519
# ق-١٢٥٢ — الدفعةُ ١ (feat/composite-fk-b1 مكدَّسةٌ على ③)
b1 schema: fk-schema-gen --write: 126 insertions (56 composite relations · 14 parents) — prisma validate: valid
b1 migration 20260921190000_composite_fk_b1_parties_references: 14 CREATE UNIQUE INDEX + 56 ADD CONSTRAINT … ON DELETE NO ACTION ON UPDATE NO ACTION — grep DROP|SET NULL|CASCADE|ALTER COLUMN|RENAME = 0 — applied on mad_app_clean (131 migrations)
B1_COMMIT=247e45c
composite-fk-guard e2e on b1 (clean): Test Suites: 1 passed, 1 total / Tests: 2 passed, 2 total — «composite FKs — schema: 56 · catalog: 56»
reverse-proof b1 (banks_companyId_branchId_fkey dropped on clean, present=0): Tests: 2 failed, 2 total — ① missingInCatalog non-empty · ② the cross write passed; constraint restored present=1
station api-unit b1 (clean, 1 worker): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 200 s
https://github.com/Arsant4x/mad-app/pull/520
# ق-١٢٥٢ — الدفعةُ ٢
b2 schema: fk-schema-gen --write: 70 insertions (29 composite relations · 12 parents · skipped=0) — prisma validate: valid
b2 migration 20260921191000_composite_fk_b2_documents: 12 CREATE UNIQUE INDEX + 29 ADD CONSTRAINT NO ACTION — grep DROP|SET NULL|CASCADE|ALTER COLUMN|RENAME = 0 — applied on mad_app_clean
B2_COMMIT=0365c07
composite-fk-guard e2e on b2 (clean): Test Suites: 1 passed, 1 total / Tests: 3 passed, 3 total — «composite FKs — schema: 85 · catalog: 85»
reverse-proof b2 (invoice_lines_companyId_invoiceId_fkey dropped, present=0): Tests: 2 failed, 1 passed, 3 total — ① and ③ fall; restored present=1
station api-unit b2 (clean, 1 worker): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 222 s
https://github.com/Arsant4x/mad-app/pull/521
# ق-١٢٥٢ — الدفعةُ ٣
b3 schema: fk-schema-gen --write: 77 insertions (35 composite relations · 7 parents · skipped=0 — منها علاقتان ذاتيّتان journal_entries.reversalOfId و stock_movements.reversalOfId) — prisma validate: valid
b3 migration 20260921192000_composite_fk_b3_ledger_inventory: 7 CREATE UNIQUE INDEX + 35 ADD CONSTRAINT NO ACTION — grep DROP|SET NULL|CASCADE|ALTER COLUMN|RENAME = 0 — applied on mad_app_clean
B3_COMMIT=cdaaf5e
composite-fk-guard e2e on b3 (clean): Test Suites: 1 passed, 1 total / Tests: 4 passed, 4 total — «composite FKs — schema: 120 · catalog: 120»
reverse-proof b3 (journal_lines_companyId_journalEntryId_fkey dropped, present=0): Tests: 2 failed, 2 passed, 4 total — ① and ④ fall; restored present=1
station api-unit b3 attempt 1 (clean): Test Suites: 1 failed, 135 passed, 136 total / Tests: 1 failed, 874 passed, 875 total — dimension-coverage.live «before: 2» (expected 1): its catalog readers expanded conkey with ANY so the composite FK doubled the path and offered companyId as an entry column
B3_COMMIT2=3beb718 (dimension-coverage readers: single-column FKs only)
station api-unit b3 attempt 2 (clean, after 3beb718): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 168 s
https://github.com/Arsant4x/mad-app/pull/522
# ق-١٢٥٢ — الدفعةُ ٤
b4 schema: fk-schema-gen --write: 70 insertions (30 composite relations · 10 parents · skipped=0) — prisma validate: valid
b4 migration 20260921193000_composite_fk_b4_realestate: 10 CREATE UNIQUE INDEX + 30 ADD CONSTRAINT NO ACTION — grep DROP|SET NULL|CASCADE|ALTER COLUMN|RENAME = 0 — applied on mad_app_clean
B4_COMMIT=ca0d029
composite-fk-guard e2e on b4 (clean): Test Suites: 1 passed, 1 total / Tests: 5 passed, 5 total — «composite FKs — schema: 150 · catalog: 150»
reverse-proof b4 (units_companyId_propertyId_fkey dropped, present=0): Tests: 2 failed, 3 passed, 5 total — ① and ⑤ fall; restored present=1
station api-unit b4 (clean, 1 worker): Test Suites: 136 passed, 136 total / Tests: 875 passed, 875 total / EXIT=0 196 s
https://github.com/Arsant4x/mad-app/pull/523
PLAN_COMMIT=f2396da (docs/plans/irreversible-20-plan.md · INDEX ٥٧)
docs guards on the plan (registry-numbering · no-id-scan · locale-gate · rule-extension-attached): Test Suites: 4 passed, 4 total / Tests: 16 passed, 16 total
https://github.com/Arsant4x/mad-app/pull/524
record guards on results row (registry-numbering · rule-extension-attached · locale-gate · registry-not-with-code): Test Suites: 4 passed, 4 total / Tests: 15 passed, 15 total
record guards on results row (no-id-scan · no-silent-skip · strict-gate): Test Suites: 3 passed, 3 total / Tests: 20 passed, 20 total
RESULTS_COMMIT=e85be48 (ق-١٢٥٦ on docs/session-record-159 → #515)
# السيرُ على الطلبات (قُرئ بعد اكتمال #523)
CI #517 #518 #519 #520 #521 #522 #523: db-integration=SUCCESS · vitest=SUCCESS · nginx-cache=SUCCESS · api-unit=SUCCESS · playwright=SUCCESS (all five on each of the seven)
CI #516: db-integration=SUCCESS · vitest=SUCCESS · nginx-cache=SUCCESS · api-unit=SUCCESS · playwright=SUCCESS · CI #515 and #524 (docs): vitest=SUCCESS · api-unit=SUCCESS
