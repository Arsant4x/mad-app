# mad-app: localization scan (raw measurements)

> **Measurement only.** Nothing under `D:\mad-app` was created, modified or deleted. Every count below comes from a tool output I ran. Every probe was checked against a positive case and a negative case before I used its number. Two probes failed that check first time; both failures are recorded in §0.4.
>
> **Snapshot:** commit `40af110`. That is `origin/main` `067a4c0` plus one unmerged commit, which adds two inventory files with no localization content. Scanned 2026-09-23/24. See §0.1 for why a snapshot was used instead of the live tree.
>
> **Tools:** ripgrep 14.1.1 (always with `-a`), GNU grep for cross-checks, Node 24.18 / ICU 78.3.

---

## الخلاصة بالعربية (للمالك)

1. **لا حقل «دولة» على المنشأة،** ولا «منطقة زمنية» ولا «لغة/محلية». الحقل الوحيد من هذه العائلة في المخطط كلّه هو `Customer.country @default("SA")` (`schema.prisma:1265`). والتسجيل الذاتي لا يسأل إلا أربعة: اسم المنشأة واسم المستخدم وكلمة المرور والبريد (`auth.service.ts:438`).
2. **عملة الأساس لا تكتبها الشيفرة أبداً.** `Company.baseCurrency @default("SAR")` (`schema.prisma:449`) لا يضبطها أيّ مسار. والأشدّ أن `resolveCurrency()` في النواة تسقط إلى `'SAR'` ثابتةً لا إلى عملة المنشأة (`common/currency/base-amount.util.ts:11,31`)، وتستدعيها ٩ خدمات.
3. **وحدةٌ واحدة تحمل الاسم السعودي، وهي مصنّفةٌ «نواة».**
   - الوحدة الوحيدة باسمٍ سعودي هي `apps/api/src/zatca/**` (١٥ ملف إنتاج)، ومعها ٤ ملفات واجهة.
   - وهي مصنّفة «core» في `docs/monorepo-layers.json:66`.
   - ومحرّك الضريبة والإقرار (`common/vat`، `obligations`) عامّا الاسم سعوديّا المحتوى.
   - ولا طبقة «دولة» في نموذج اتجاه الاستيراد (`import-direction.spec.ts:42`).
4. **أكثر من نصف العلامات السعودية خارج تلك الوحدات.** مسبار اتحادٍ من ٣٠ نمطاً مُصادَقاً وجد:
   - **٥٢٥ سطراً سعودياً في ١٣٥ ملف إنتاج** خارج الوحدتين: ٣٥٧ شيفرة/نص و١٦٨ تعليقاً.
   - **٤٧٢ سطراً داخلهما.**
   - أي أن **٥٢٫٧٪** من العلامات السعودية في شيفرة الإنتاج خارج حدودها.
5. **أكبر ما في الخارج:**
   - اسم ZATCA خارج وحدته: ١٧٦ سطراً في ٣٩ ملفاً، منها `invoices.service.ts` (١٨) و`pos.service.ts` (١١) و`messages.ts` (٣٩).
   - حقول العنوان الوطني: ٣٢ سطراً.
   - نمط الرقم الضريبي (`^3…3`، ١٥ خانة) ونمط السجل التجاري (١٠ خانات) ومخطّطات هوية المشتري (BR-KSA-14)، كلّها في النواة وفي القاعدة.
   - `'Asia/Riyadh'` جدولاً لسبع مهامّ مجدولة تشمل كلّ المنشآت.
   - `'ar-SA'` في ١٤ سطراً، و`ر.س` في ١٥ سطر واجهة.
6. **ثلاثة قيود CHECK في القاعدة تُثبّت `VATEX-SA-OOS`،** وقيدٌ رابع على العملاء يُثبّت مخطّطات BR-KSA-14 الإحدى عشرة.
7. **ما لا يُعكس:**
   - آثار الفواتير المصدَرة على جدول الفواتير الأساسي: سلسلة التجزئة وICV وXML الموقّع وQR.
   - أرقام المستندات المصدَرة، ومنها `EJ-`.
   - تاريخ الهجرات المطبَّقة.
   - ضياع الفرق بين «سعوديٌّ مُعلَن» و«سعوديٌّ بالافتراض» في `country`/`currency`.
   - ملخّصات التدقيق والإشعارات المخزّنة نصّاً عربياً.
8. **النشر لكل إقليم ممكنٌ بنيوياً.** كل مكدّسٍ مستقلٌّ بقاعدته ومخزن ملفّاته ونسخه الاحتياطية وأسراره من ملف بيئته. ويعيقه ثلاثة:
   - أسماءٌ فريدةٌ داخل النشر الواحد فقط: `username`، و`slug` مع `.rikzapp.com` مكتوبةً في الواجهة.
   - مدير منصّةٍ لكل نشرٍ على حدة.
   - سلوكٌ سعوديٌّ مترجَمٌ في الشيفرة (المنطقة الزمنية، نسبة الضريبة، ZATCA) لا مضبوطٌ في الإعداد.

---

## 0. Method

### 0.1 What was scanned: a frozen snapshot, not the live tree

**Why a snapshot.** When the task started, `D:\mad-app` was on `feat/inventory-ledger-reconciliation` @ `40af110` with a clean `git status`. **During the scan another session changed the live tree.** Evidence:
- `git reflog`: `checkout: moving from feat/inventory-ledger-reconciliation to feat/non-deductible-vat`.
- `git status --short`: ` M apps/api/prisma/schema.prisma` and `?? apps/api/prisma/migrations/20260924120000_non_deductible_vat/`.
- `wc -l schema.prisma`: 6,250 lines in the live tree, against 6,121 in the commit.
- Early discovery reads from the live tree already showed shifted line numbers: `model ZatcaCredential` 888 → 890, `model Contract` 3918 → 4044, `taxRate @default(15)` 1686 → 1688.

**How the snapshot was made.** `git -C D:\mad-app archive 40af110 | tar -x` into the session scratchpad: 1,412 files, 22 MB. `git archive` only reads the object database. No worktree was added and nothing was written under `D:\mad-app`.

**Every file:line in this report refers to that snapshot.** The snapshot has CRLF line endings (`core.autocrlf=true`). No probe anchors on `$`, so this does not affect any count.

**Delta to `origin/main`:** `git diff --stat 067a4c0 40af110` shows two files only:
- `inventory-ledger-reconciliation.util.ts`
- `inventory-ledger-reconciliation.e2e-spec.ts`

Neither appears in any probe output below.

**Not scanned:**
- The other session's uncommitted non-deductible-VAT work.
- `node_modules` and `dist`.
- Untracked files. For example, the root `backup-before-cleanup.sql` exists on disk, is untracked, and was not read.
- The `accounting-platform*.html` mockups.

### 0.2 Groups (file counts in the snapshot)

| Group | Definition | Files |
|---|---|---|
| PROD_Z | Production files whose path contains `zatca`: `apps/api/src/zatca/**` (15 non-spec) plus web `api/zatca.ts`, `components/ZatcaQr.tsx`, `lib/zatcaQr.ts`, `pages/companyProfile/ZatcaOnboardingCard.tsx` | 19 |
| PROD_V | VAT/return modules with generic names but Saudi content: `apps/api/src/common/vat/**` (6), `apps/api/src/obligations/**` (7), web `lib/vat.ts`, `api/obligations.ts`, `components/LineTaxPicker.tsx`, `pages/obligations/**` (5) | 18 |
| PROD_OUT | All other production code in `apps/api/src`, `apps/web/src` (including `.css`/`.json`) and `packages/shared/src` | 628 |
| SCHEMA | `apps/api/prisma/schema.prisma` | 1 |
| MIG | `apps/api/prisma/migrations/**` (154 `migration.sql` plus `migration_lock.toml`) | 155 |
| TEST | `*.spec.ts`, `*.e2e-spec.ts`, `*.test.ts(x)`, `apps/api/test/**`, `apps/web/e2e/**`, `apps/web/src/test/**` | 374 |
| DOC | `*.md` | 134 |
| OTHER | `apps/api/prisma/seed.ts`, `apps/api/scripts/**`, `docker/`, `ops/`, `.github/`, `.githooks/`, `deploy.sh`, compose files, `*.env*.example`, non-md files under `docs/` | 65 |

- **Production total:** 19 + 18 + 628 + 1 + 155 = **821**. An independent `find` over the same definition also gives **821**.
- **"Inside the Saudi module"** means PROD_Z, the only Saudi-named boundary. PROD_V is reported separately because it is Saudi in content but not in name.
- **"Outside"** means PROD_OUT.

### 0.3 Probe mechanics

**Command.** `rg -a --hidden -c [flags] -e PATTERN` over `apps packages docs docker ops .github .githooks deploy.sh docker-compose.yml docker-compose.prod.yml CLAUDE.md DEPLOY.md README.md SPEC.md .env.production.example`. The count is **matching lines, not occurrences**. The runner script is in Appendix A.1.

**`-a` is mandatory in this repository.** This is a measured trap, not a precaution:
- `apps/api/src/common/i18n/messages.ts` (149 KB, 1,576 lines) contains 3 NUL bytes, at byte offsets 148132 and later.
- When ripgrep walks a directory without `-a`, it treats that file as binary and **skips it silently**:
  - `rg -c -i zatca apps/api/src/common/i18n/` without `-a` printed only `storable-text.spec.ts:2`. With `-a` it printed `messages.ts:39`.
  - `rg -c -F 'ريال'` on the same directory gave 0 without `-a` and 1 with it.
- Any rg-based search without `-a`, including the Grep tool, therefore under-counts the largest user-facing text file.

**Code vs comment split** (reported for PROD_OUT). This is a heuristic: a matching line whose text starts with `//`, `/*`, `*` or `{/*` is counted as a comment. Everything else counts as code/text, including JSX text and string literals.

**Arabic probes.** Arabic probes use only literal alternations: no `[...]` character classes and no `.` inside Arabic. They run under `LC_ALL=C.UTF-8`.

### 0.4 Validation, and the two failures it caught

**How each probe was validated.**
- **VALID+:** a file:line in the snapshot whose text I printed and read. The text is quoted in §b.1.
- **VALID−:** a file that must not match. It returned 0, and an independent GNU `grep` on the same concept was also 0.
  - One broader independent check did hit: `grep -ci 'crNumber|commercial'` on `auth.service.ts` found line 428, "commercial decision the owner adjusts without a deploy". That is not commercial registration, so the P19 negative stands.
- **Negative files used:**
  - `apps/api/src/auth/auth.service.ts` (498 lines), or
  - `apps/api/src/common/money/rounding.ts` (114 lines), or
  - for P05, `migrations/20260918000000_installment_partial/migration.sql` (40 lines).
- **Zero-result probes in production** (Hijri, weekend, phone, withholding, excise, hosting names) were validated on a positive **outside** production: in docs, seed or compose.
- **The schema field search** in §c.2 was validated on a synthetic file I wrote to the scratchpad, containing `timezone String` / `locale String`.

**Failures caught.**
1. **P18, first run: `INVALID+`.** The shell collapsed `\\d` into `\d`, so the regex no longer matched the literal text `3\d{13}3`. I re-ran it as a fixed string, `-F '3\d{13}3'`, and got VALID+.
2. **P05, first run: `INVALID-`.** The negative I chose (`20260829160000_l0_document_lines/migration.sql`) does contain `DEFAULT 15`. I replaced it with `20260918000000_installment_partial/migration.sql`, where independent `grep -c 'DEFAULT 15'` gives 0.

### 0.5 Independent cross-checks (GNU grep over the same 821 production files)

| Probe | rg (script) | GNU grep |
|---|---|---|
| `\bSAR\b` (grep `-w SAR`) | 57 | 57 |
| timezone set (P22) | 23 | 23 |
| `zatca` (`-i`) | 545 | 545 |
| `ر.س` (`-F`) | 15 | 15 |
| `اللائحة` (`-F`) | 52 | 52 |
| `VATEX-SA` (`-F`) | 46 | 46 |
| production file count | 821 | 821 (`find`) |

---

## (a) What "localization" covers in multi-country platforms

**Where this comes from.** A web-research sub-agent fetched the vendor pages; source keys refer to §A.3. I then **re-fetched five of the key claims myself and confirmed them**, marked **[verified]**:
- O2: Odoo fiscal-localization page.
- O4: Odoo `l10n_sa` manifest.
- O9a: Odoo `l10n_sa_edi/models/res_partner.py`.
- Z1: Zoho organization profile.
- Q1: QuickBooks community answer.

Everything else is **[agent]**: the agent fetched the URL, and some pages went through a summarizer. Statements are paraphrased, not quoted. "(inference)" marks my own reading.

### a.1 How each platform packages country localization

**Odoo:** a country-neutral `account` core, plus `l10n_XX` modules.
- **What a fiscal localization package contains:** pre-configured taxes, fiscal positions, chart of accounts and legal statements [O1 agent].
- **How it is chosen:** it installs automatically from the **company's country**, and switching to another package is possible only while no entry has been posted [O2 **verified**].
- **Developer view:** CSV templates for the chart, taxes, tax report and fiscal positions, plus a template that declares the fiscal country. A generic chart is the fallback [O3 agent].
- **Saudi, `l10n_sa`:**
  - It activates chart of accounts, taxes, VAT filing report, withholding-tax report and fiscal positions.
  - It depends on `l10n_gcc_invoice` (the Arabic/English GCC invoice) and `account` [O4 **verified**].
  - It sets fiscal country SA and default 15% taxes, and adds Zakat and IFRS16 journals [O6 agent].
  - It adds the ZATCA QR code and Riyadh timestamps [O7 agent].
- **Saudi, `l10n_sa_edi`:** a separate module on top of the generic `account_edi`, UBL, `base_vat` and `certificate` modules [O8 agent].
  - Partner fields "Building Number" and "Plot Identification".
  - The 11 buyer-ID schemes TIN/CRN/MOM/MLS/700/SAG/NAT/GCC/IQA/PAS/OTH, all defined **inside the country module** [O9a **verified**].
  - Per-journal CSIDs, a chain sequence and a previous-invoice hash [O9b agent].
  - A per-tax VATEX exemption code [O9c agent].
  - Its docs require SAR and state that production mode is irreversible [O10 agent].
  - Version 19 adds Saudi reports, POS e-invoicing and withholding modules [O11 agent].
- **What stays in the core:**
  - Company fiscal country, a country on each tax, and foreign VAT on fiscal positions.
  - Country reference data: address format, phone code, VAT label.
  - The currency rounding factor.
  - Generic VAT and IBAN validators [O12–O18 agent].
- **Also shipped per package:** bank payment formats (SEPA/ISO 20022) and statement formats (CODA) [O19, O20 agent]. Payroll is `l10n_*_hr_payroll`; the Saudi one computes GOSI by nationality and requires an IBAN for WPS [O21, O22 agent].

**ERPNext / Frappe:** regional dispatch by company country.
- **Dispatch:** `get_region(company)` combined with `@allow_regional` / `regional_overrides[country]` [E3, E4 agent]. Changing the company's country re-runs the regional fixture setup [E5 agent].
- **In the core:** regional folders (address templates, UAE, Italy, US, and others). The UAE one adds TRN, emirate and the VAT 201 report [E1, E2 agent].
- **Moving out of the core:** India moved to the separate India Compliance app, and KSA and France moved to separate apps in version 15 [E6–E9 agent]. ZATCA phase 2 exists only in third-party apps [E10, E11 agent].
- **Country record:** carries date format, time format and time zones [E14 agent]. Charts are per country [E13 agent].

**Microsoft Dynamics 365 Finance:** country gating in metadata, plus configuration services.
- **Gating:** `CountryRegionCodes` flags on tables, fields and menus. The country context is taken from the **legal entity's primary address** [M5, M6 agent].
- **Globalization Studio** bundles [M1–M4 agent]:
  - Electronic Reporting: formats built as configuration, not code.
  - Tax Calculation service: supports several tax registrations per legal entity.
  - Electronic Invoicing service: per-country features.
- **Saudi specifics:**
  - Features for Saudi e-invoicing: clearance vs reporting, a submission counter, CSIDs in Key Vault, VATEX codes [M10, M11 agent].
  - Saudi sales tax and Zakat [M9, M12 agent].
- **Partner localization:** shipped as separate models [M7, M8 agent].

**SAP S/4HANA:** local versions and a document-compliance framework.
- **Local versions** exist for about 60 countries, and customers can build their own [S1 agent].
- **Covered topics:** tax-number validation, official document numbering, payment formats, and the Document & Reporting Compliance eDocument framework [S2, S3 agent].
- **Limits:** help.sap.com pages would not render, and Saudi eDocument content was seen only as search snippets [S4 agent].

**Zoho Books:** one country edition per organization.
- **Location is locked:** once set it cannot be changed, and a different country needs a new organization [Z1 **verified**].
- **Base currency** is locked for the listed locations [Z1 **verified**].
- **Time zone** is editable according to Z1 [**verified**]. A second Zoho FAQ says country, currency and time zone cannot change in country editions [Z2 agent], so **the two Zoho pages disagree on time zone**.
- **Saudi edition:** ZATCA Phase 2, and Arabic invoices are mandatory [Z5, Z6 agent]. Saudi data centres are described in a blog post [Z7 agent].

**Xero:**
- **Tax authority:** one per organization; a different country means a new organization (search snippets only) [X1, X2 agent].
- **Region is a field:** the SDK `Organisation.version` takes AU/NZ/GLOBAL/UK/US, and the tax-number label varies by region [X3 agent].
- **Data** is held on AWS in the US [X4 agent].

**QuickBooks Online:**
- **Country is fixed:** fixed when the account is created and cannot be changed later. Source: QuickBooks Team member, 2024-12-04 [Q1 **verified**].
- **Regional sites:** separate sites per country [Q4 agent].
- **Default VAT codes:** created automatically only for some countries [Q3 agent].
- **Data residency:** data is stored in the home country on AWS [Q5 agent].

### a.2 Is the country fixed at creation? Where is the data hosted?

**Country fixed when the organization is created:** Zoho [Z1 **verified**], QuickBooks Online [Q1 **verified**], Xero (snippet) [X1 agent].

**Country editable, but locked by what depends on it:**
- **Odoo:** the package cannot be switched after the first posted entry [O2 **verified**].
- **ERPNext:** the country can change, but the currency locks once transactions exist [E5 agent].
- **D365:** the country is derived from the legal entity's address [M5 agent].

**Hosting and data residency** [agent]:

| Platform | Hosting / residency |
|---|---|
| Odoo | Hosts per region: 5 regions [O23] |
| D365 | Geography list without Saudi Arabia [M13, M4] |
| Zoho | Saudi data centres [Z7] |
| QuickBooks Online | Home country, on AWS [Q5] |
| Xero | US, on AWS [X4] |

**Inference.** Every platform keys localization on a country **stored on the company / legal entity**, not on the user or the database. E-invoicing and clearance always sit in a **separate country module on top of a generic EDI core**.

### a.3 Consolidated checklist of localization dimensions, with mad-app's state today

Probe IDs refer to §b.1. Every "mad-app today" cell is measured in this report.

| # | Dimension | Treated as localization by | mad-app today (evidence) |
|---|---|---|---|
| 1 | Tax engine & rates | Odoo O5/O6 · D365 M3 · ERPNext E7 · Zoho Z2 · QBO Q3 · Xero X2 | One constant `STANDARD_VAT_RATE = 15` (`common/vat/standard-rate.ts:13`, web `lib/vat.ts:11`; kept equal by `vat-rate-single-source.spec.ts`). DB default `taxRate @default(15)` (`schema.prisma:1686`, `:1944`). No rate per country or company (P01, P05) |
| 2 | Tax categories / exemptions / zero-rating | Odoo O13/O9c · D365 M10/M12 · ERPNext E2 | S/Z/E/O plus a closed `VATEX-SA-*` list (`common/vat/exemption-reasons.ts:42-44`). DB CHECKs hard-code `VATEX-SA-OOS` for category O on 3 tables (P11, §b.5-8) |
| 3 | Fiscal positions / tax mapping | Odoo O1/O4/O14 · D365 M3 | None. `Customer.country` drives only the export flag (`zatca/hash-chain.util.ts:133-134`) and the rule "Saudi VAT number only for SA buyers" (`customers/customers.service.ts:26-27`) |
| 4 | E-invoicing / clearance / EDI | Odoo O8 · D365 M4/M11 · SAP S3 · ERPNext E7/E10 · Zoho Z5 | ZATCA module (15 API + 4 web files). Core emits `INVOICE_ISSUED` (`shared/events/domain-events.ts:12`); the outbox calls `zatca.deliverIssued` **for every company, unconditionally** (`outbox/outbox.module.ts:46-50`). Core also imports ZATCA directly: `invoices.service.ts:9,34`, `pos.service.ts:24,29`, `company-profile/dto/update-company-profile.dto.ts:4` (P06) |
| 5 | Numbering, QR, signature, hash chain | Odoo O7/O9b · D365 M11/M4 · SAP S2 | Generic counter `<KIND>-<YYYY>-<NNNN>` per company, kind and year (`common/document-sequence.util.ts`, `model DocumentSequence` `schema.prisma:6019`). Contract prefix `EJ` (for Ejar) (P36). ICV, hash and previous-hash columns sit on the core `invoices` table (`schema.prisma:1473-1505`), with `@@unique([egsUnitId, zatcaIcv])` at `:1589` |
| 6 | Tax-return boxes / VAT report | Odoo O4 · ERPNext E2 · D365 M12 · QBO Q6 | `box1..box5` identifiers appear **only** in `obligations/obligations.service.ts` (P10a: 33 lines, all in V). Persisted by `VatReturnFiling`/`VatReturnCorrection`/`VatProportionalRatio` (`schema.prisma:5118-5221`) |
| 7 | Chart of accounts templates | Odoo O1/O5 · ERPNext E13 | **One** template of 23 accounts with Arabic names (`accounts/default-chart.ts:39-99`). Posting code hard-codes the account codes: 127 lines in 11 files, 75 of them in `journal/auto-posting.util.ts` (P32) |
| 8 | Currency, decimals, rounding | Odoo O10/O16/O12 · Zoho Z1 · ERPNext E5 | `Company.baseCurrency @default("SAR")` (`:449`) is **never written by code**: its only references are reads at `network-settlements.service.ts:157` and `cash-drawers.service.ts:145`. `resolveCurrency()` falls back to `'SAR'` (`common/currency/base-amount.util.ts:11,31`) from 9 call sites. 103 columns are `@db.Decimal(18, 2)`. `round2(` appears on 320 lines in 45 files. Web `fmt` always shows 2 decimals (`web lib/format.ts:2-5`). The `Currency` model (`schema.prisma:1059-1075`) has no minor-unit/decimals field |
| 9 | Fiscal year, calendar, Hijri | Odoo O12 · Zoho Z1 | `FiscalYear` start/end are Gregorian dates (`schema.prisma:1101-1123`); `FiscalPeriod` is month 1–12 plus a calendar year (`:1133-1156`). Hijri appears on **0** production lines (P25) |
| 10 | Timezone | Odoo O7 · ERPNext E14 · Zoho Z1/Z2 | No company time zone. `SCHEDULE_TIME_ZONE = 'Asia/Riyadh'` (`common/wall-clock.util.ts:46`) schedules 7 crons. `KSA_UTC_OFFSET_MIN = 180` (`:34`) decides the ZATCA local-time format (`:115`) and the API-quota month (`api-keys/integration-usage.service.ts:11`). Day helpers default to UTC offset 0 (`:94-106`) (P22, P38) |
| 11 | Legal identifiers (VAT number, commercial registration, national ID) | Odoo O17/O9a · D365 M10 · Xero X3 · ERPNext E2/E8 · SAP S2 | VAT regex `/^3\d{13}3$/` on 4 production lines, **none** in Z (P18). CR regex `/^\d{10}$/` on 2 lines (P18b). BR-KSA-14 buyer-ID schemes in core `customers` and in a DB CHECK (P20b) |
| 12 | Address format / national address | Odoo O15/O9a/O10 · ERPNext E1/E2 · D365 M10 | 7-part Saudi national address on `Company` (`schema.prisma:429-438`) and 5 parts on `Customer` (`:1282-1286`) (P21) |
| 13 | Phone format | Odoo O15 (core reference data) | Free text, no validation. **0** Saudi phone numbers in production (P24). One Saudi mobile regex exists in the error scrubber (`common/error-tracking/error-event.util.ts:81`) |
| 14 | Language, translation, RTL | Odoo O24/O26 · D365 M12/M2 · SAP S2 · Zoho Z6 · ERPNext E2 | ar/en only: API `common/i18n/language.util.ts:13-29`; web `i18n/index.ts:20-23` switches `dir`; `index.html:2` defaults to `lang="ar" dir="rtl"`. Date/number locale `'ar-SA'` is hard-coded on 14 production lines in 10 files outside Z (P31). Audit summaries are stored as Arabic sentences (`schema.prisma:2497-2499`) |
| 15 | Payroll & social insurance | Odoo O21/O22 · Xero X5/X6 · ERPNext E11 | Not built. CLAUDE.md §4 says payroll waits for GOSI/Mudad rules. Saudi agency names appear only in docs and in the seeded obligations list (P27, P28) |
| 16 | Banking (IBAN, payment and statement files) | Odoo O18/O19/O20 · D365 M2/M8 · SAP S2 | `Bank.iban` is free text with no validation (`schema.prisma:2722`; P42: 18 production lines, all plumbing). The error scrubber has an IBAN pattern only for `SA…` (`error-event.util.ts:78`), backed by a generic "6 or more digits" mask (`:83`) |
| 17 | Data residency / hosting | Odoo O23 · D365 M13/M4 · Zoho Z7 · QBO Q5 · Xero X4 | Decided in docs and configuration (`DEPLOY.md:8-16`, `.env.production.example:43,60,78-85`). **0** hosting-region or provider names in production code (P35) |
| 18 | Statutory financial reports | Odoo O1/O11 · SAP S3 · ERPNext E12 · D365 M2 | Financial statements are generic. The VAT return is Saudi (V) |
| 19 | Document retention periods | Not found as a localization item in the fetched vendor docs [agent] | `RETENTION_YEARS = { books: 10, realEstate: 11 }` in the **core** module `companies/company-movement.service.ts:88`, used by `trash-retention.util.ts` and `deletion-requests.service.ts` (P29) |
| 20 | Weekends / holidays | Odoo O21 (payroll) | None: **0** production lines (P26) |
| 21 | Withholding tax | Odoo O4/O9c/O11 · SAP S3 · ERPNext E12 | None: **0** production lines (P40) |
| 22 | Excise | ERPNext E12 | None: **0** production lines (P41) |
| 23 | Customs / import VAT | D365 M12/M3 | Not built. CLAUDE.md §4, landed-costs row: import VAT (return box 8) is a named future wave |
| 24 | Zakat | Odoo O6 · D365 M9 · ERPNext E11 | Not built (`SPEC.md:136`, 6.12 ⬜). Mentioned only in the seeded obligations list (`obligations.service.ts:71`) |
| 25 | POS / simplified invoices | Odoo O25/O11 · D365 M11 | POS stamps through `ZatcaService` (`pos/pos.service.ts:29`, `:680`) |
| 26 | Several tax countries per company | Odoo O14/O12 · D365 M3 · Xero X2 (separate organization) | No such concept |
| 27 | Feature gating by country | D365 M5 · ERPNext E4 · Odoo O3 | None. Screens are gated by business sector (`activities/sectors.ts`), not by country |

---

## (b) Where Saudi assumptions spread outside their module

### b.0 The "Saudi module" boundary today

- **Only one directory carries the Saudi name:** `apps/api/src/zatca/**`, with 15 production files:
  - `authority-warnings.util.ts`, `certificate-expiry.service.ts`, `certificate-expiry.util.ts`, `csr.util.ts`
  - `dto/onboarding.dto.ts`, `egs-unit.util.ts`, `hash-chain.util.ts`, `qr.util.ts`
  - `ubl/canonicalize.util.ts`, `ubl/invoice-xml.util.ts`, `ubl/xades.util.ts`
  - `zatca-onboarding.service.ts`, `zatca.controller.ts`, `zatca.module.ts`, `zatca.service.ts`

  On the web, 4 files carry the name (listed in §0.2). Saudi-specific **tables** are separate and additive: `ZatcaCredential` (`schema.prisma:888`) and `EgsUnit` (`:1026`). **But ZATCA's per-document fields sit on the core `invoices` table** (`:1461-1505`).
- **The VAT engine and VAT return have generic names and Saudi content:**
  - `common/vat/**`: 15% rate, the `VATEX-SA` list (`exemption-reasons.ts:42`), and the 40,000,000 monthly-filing threshold (`vat-period.util.ts:17`).
  - `common/vat/return-correction.util.ts`: the 5,000 correction limit (`:27`) and the 5-year window (`:30`).
  - `obligations/**`: return boxes 1–5, and 9 seeded Saudi obligations, `STANDARD_OBLIGATIONS` (`obligations.service.ts:69-79`).
- **The approved layer map treats ZATCA as core.**
  - `docs/monorepo-layers.json` marks `"zatca": "core"` (`:66`), `"obligations": "core"` (`:43`) and `"common": "infra"` (`:22`). Its totals are shared 1, core 34, infra 6, activity 7, engine 6.
  - The import-direction guard knows only `'infra' | 'shared' | 'core' | 'engine' | 'activity'` (`apps/api/src/common/import-direction.spec.ts:42-43`).
  - So **nothing stops core modules from importing ZATCA**. Today they do: `invoices.service.ts:9,34`, `pos.service.ts:24,29`, `pos.module.ts:4`, `company-profile/dto/update-company-profile.dto.ts:4`, `outbox/outbox.module.ts:5-6`.
- **One adapter-like seam already exists:** invoices emit the `INVOICE_ISSUED` domain event (`shared/events/domain-events.ts:12`), and the outbox module registers ZATCA delivery as its handler (`outbox.module.ts:46-50`). It is registered unconditionally, for every company.
- **`packages/shared/src` is clean:** 0 lines on the union probe.

### b.1 Probe definitions and validation (exact patterns)

The runner is `probe.sh ID PATTERN POSFILE POSLINE NEGFILE [flags]` (Appendix A.1). Paths are relative to the repository root.

**Tax rate**
- **P01 VAT-rate constant:** `STANDARD_VAT_RATE`
  - VALID+ `apps/api/src/common/vat/standard-rate.ts:13`: `export const STANDARD_VAT_RATE = 15;`
  - VALID− `apps/api/src/common/money/rounding.ts`: 0
- **P02 15% literal:** `\b15\s*(%|٪)|(%|٪)\s*15\b|١٥\s*٪`
  - VALID+ `apps/web/src/pages/pos/PosPage.tsx:448`: `<td>الضريبة 15%</td>`
  - VALID− `auth.service.ts`: 0
- **P03 0.15:** `\b0\.15\b` with `-g '!*.css'` (the CSS matches are rgba alpha values, and are excluded)
  - VALID+ `apps/api/src/journal/rent-tax-point.util.ts:32`: comment "كانت `0.15` مكتوبةً هنا…"
  - VALID− `auth.service.ts`: 0
- **P04 gross fraction:** `\b1\.15\b|\b15\s*(/|÷)\s*115\b`
  - VALID+ `apps/web/src/pages/contracts/ContractModal.tsx:257`: "الضريبةُ 15/115 من كلِّ قسط"
  - VALID− `auth.service.ts`: 0
- **P05 DB default 15:** `@default\(15\)|DEFAULT 15(\.0+)?\b`
  - VALID+ `apps/api/prisma/schema.prisma:1686`: `taxRate Decimal @default(15) @db.Decimal(5, 2)`
  - VALID− `migrations/20260918000000_installment_partial/migration.sql`: 0 (after the first negative failed; §0.4)

**ZATCA and the authority**
- **P06 ZATCA:** `zatca` with `-i`
  - VALID+ `schema.prisma:455`: `zatcaCredential ZatcaCredential?`
  - VALID− `auth.service.ts`: 0
- **P07 Fatoora:** `fatoora` with `-i`
  - VALID+ `apps/api/src/zatca/zatca-onboarding.service.ts:23`: "Fatoora onboarding, run by the platform…"
  - VALID− `auth.service.ts`: 0
- **P08 ZATCA_ prefix:** `ZATCA_`
  - VALID+ `zatca-onboarding.service.ts:76`: `process.env.ZATCA_API_BASE_OVERRIDE…`
  - VALID− `auth.service.ts`: 0
- **P09 authority name in Arabic:** `هيئة الزكاة` with `-F`
  - VALID+ `apps/web/src/pages/obligations/ObligationsPage.tsx:8`: `const ENTITY_ORDER = 'هيئة الزكاة والضريبة والجمارك';`
  - VALID− `auth.service.ts`: 0

**VAT return and tax codes**
- **P10 return boxes, broad:** `\bbox[0-9]+\b|خانة|خانات`
  - VALID+ `apps/api/src/obligations/obligations.service.ts:221`: `…boxes.box1.net + boxes.box3.net…`
  - VALID− `auth.service.ts`: 0
  - ⚠️ `خانة` also means "digit position", so P10's outside matches are mostly false. P10a is the one to read.
- **P10a return-box identifiers:** `\bbox[0-9]+\b`
  - Same VALID+ and VALID− as P10.
- **P11 VATEX codes:** `VATEX-SA`
  - VALID+ `apps/web/src/lib/vat.ts:114`: "`Z · VATEX-SA-35`"
  - VALID− `auth.service.ts`: 0
- **P12 BR-KSA rules:** `BR-KSA`
  - VALID+ `schema.prisma:1257`: "…بمخطّطه (BR-KSA-14)…"
  - VALID− `auth.service.ts`: 0

**Currency**
- **P13 SAR:** `\bSAR\b`
  - VALID+ `schema.prisma:449`: `baseCurrency String @default("SAR")`
  - VALID− `auth.service.ts`: 0
- **P14 riyal symbol:** `ر.س` with `-F`
  - VALID+ `apps/web/src/pages/DashboardPage.tsx:107`: `{fmt(summary.revenue)} ر.س`
  - VALID− `auth.service.ts`: 0
- **P15 riyal word:** `ريال` with `-F`
  - VALID+ `apps/api/src/companies/company-defaults.ts:47`: `DEFAULT_CURRENCY = { code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' }`
  - VALID− `auth.service.ts`: 0
- **P16 halala:** `هللة|(?i:halala)`
  - VALID+ `apps/api/src/journal/rent-accrual.util.ts:113`: "ولا يفترق بهللة تقريب"
  - VALID− `auth.service.ts`: 0

**Registry and identity**
- **P18 VAT-number format:** `3\d{13}3` with `-F`
  - VALID+ `apps/api/src/company-profile/dto/update-company-profile.dto.ts:50`: `@Matches(/^3\d{13}3$/, …)`
  - VALID− `auth.service.ts`: 0
- **P18b CR-number format:** `\d{10}` with `-F`
  - VALID+ `update-company-profile.dto.ts:55`: `@Matches(/^\d{10}$/, …)`
  - VALID− `auth.service.ts`: 0
- **P19 commercial registration:** `(?i:crNumber|commercial.?regist|\bcr_number\b)|السجل التجاري`
  - VALID+ `schema.prisma:410`: `crNumber String?`
  - VALID− `auth.service.ts`: 0
- **P20 national ID / iqama:** `(?i:iqama|national.?id)|\bIQA\b|\bNAT\b|الهوية الوطنية|رقم الهوية`
  - VALID+ `apps/web/src/api/customers.ts:27`: `NAT: 'الهوية الوطنية',`
  - VALID− `auth.service.ts`: 0
- **P20b BR-KSA-14 buyer schemes:** `BUYER_ID_SCHEMES|otherIdScheme`
  - VALID+ `apps/api/src/customers/dto/create-customer.dto.ts:9`: `BUYER_ID_SCHEMES = ['TIN', 'CRN', 'MOM', 'MLS', '700', 'SAG', 'NAT', 'GCC', 'IQA', 'PAS', 'OTH']`
  - VALID− `auth.service.ts`: 0
- **P21 national address:** `additionalNumber|buildingNumber|العنوان الوطني`
  - VALID+ `schema.prisma:437`: `additionalNumber String?`
  - VALID− `auth.service.ts`: 0

**Time, place and calendar**
- **P22 timezone constants:** `Asia/Riyadh|KSA_UTC_OFFSET_MIN|SCHEDULE_TIME_ZONE|\+03:00|(?i:UTC\+3|GMT\+3)\b`
  - VALID+ `apps/api/src/common/wall-clock.util.ts:46`: `export const SCHEDULE_TIME_ZONE = 'Asia/Riyadh';`
  - VALID− `rounding.ts`: 0
- **P23 "Riyadh" as a word:** `(?i:riyadh)|الرياض`
  - VALID+ `wall-clock.util.ts:8`: "…بتوقيت الرياض يُؤرَّخ أمس"
  - VALID− `rounding.ts`: 0
- **P24 Saudi phone:** `\+966|\b966[0-9]|\b05[0-9]{8}\b|\+9665`
  - VALID+ `apps/api/prisma/seed.ts:90` (OTHER; no production positive exists): `phone: '0555000111'`
  - VALID− `rounding.ts`: 0
- **P25 Hijri:** `(?i:hijri|umalqura|umm.?al.?qura|islamic)|هجري|الهجري`
  - VALID+ `docs/domain-scan/24-الزمن-والتقويم-واللغة.md:51`: "التقويمُ الهجريّ للعرض والإدخال…"
  - VALID− `rounding.ts`: 0
- **P26 weekend / holiday:** `(?i:weekend|friday|saturday|holiday)|الجمعة|السبت|نهاية الأسبوع|العطلة الأسبوعية|عطلة رسمية`
  - VALID+ same doc `:52`: "(الجمعةُ/السبت)"
  - VALID− `rounding.ts`: 0

**Agencies, retention and country mentions**
- **P27 Saudi agencies (English):** `(?i:\bgosi\b|\bmudad\b|\bejar\b|\bsama\b|nafath|shomoos|shumoos|wathq|balady|\bqiwa\b|absher|muqeem|nphies|wasfaty|\bsfda\b|\bsaso\b|\bmaroof\b|\bsdaia\b|\bmisa\b|\bmhrsd\b|\bsccc\b|\bndmo\b)`
  - VALID+ `apps/api/src/contracts/dto/deposit.dto.ts:6`: `DEPOSIT_HOLDERS = ['COMPANY', 'EJAR']`
  - VALID− `rounding.ts`: 0
- **P28 Saudi agencies (Arabic):** `منصة إيجار|منصّة إيجار|شموس|واثق|ساما|مُدد|التأمينات الاجتماعية|أبشر|البنك المركزي|سدايا|وصفتي|نفيس|وزارة التجارة|وزارة الموارد البشرية`
  - VALID+ `apps/web/src/pages/contracts/DepositsSection.tsx:154`: "المبلغ محجوز لدى منصة إيجار…"
  - VALID− `rounding.ts`: 0
  - `نفاذ`, `قوى` and bare `إيجار` were **left out** of the pattern on purpose: their generic meanings ("entry into force", "strongest", "rent") produce false positives.
- **P29 retention constants:** `RETENTION_YEARS|retentionDeadline|REAL_ESTATE_MODELS`
  - VALID+ `apps/api/src/companies/company-movement.service.ts:88`: `RETENTION_YEARS = { books: 10, realEstate: 11 }`
  - VALID− `rounding.ts`: 0
- **P29b retention years as text:** `(?i:\b(6|10|11)\s*-?\s*years?\b)|\b(6|10|11)\s*(سنوات|سنة)|ست سنوات|عشر سنوات|إحدى عشرة سنة|١١ سنة|١٠ سنوات|٦ سنوات`
  - VALID+ `company-movement.service.ts:87`: "الدفاترُ ١٠ سنوات · والعقارُ ١١"
  - VALID− `rounding.ts`: 0
- **P30 country mentions:** `(?i:\bsaudi\b|\bksa\b)|السعودية|السعودي|المملكة`
  - VALID+ `wall-clock.util.ts:9`: "إن كان محلياً في المملكة"
  - VALID− `rounding.ts`: 0
- **P31 country code SA / ar-SA locale:** ``["'`]SA["'`]|\bar-SA\b|\ben-SA\b|>SA<`` (read from a file, because it contains a backtick)
  - VALID+ `schema.prisma:1265`: `country String @default("SA")`
  - VALID− `rounding.ts`: 0

**Other**
- **P32 chart-code literals:** `['"](1000|1190|1200|1250|1251|1300|1600|2000|2100|2200|2300|2400|2450|3300|3900|4100|4200|4300|5100|5200|5300|5400|5500|5600|5700|5800|5900|5910)['"]` (read from a file)
  - VALID+ `apps/api/src/journal/inventory-accounts.util.ts:33`: `OUTPUT_VAT_ACCOUNT_CODE = '2200'`
  - VALID− `rounding.ts`: 0
- **P34 regulation citations:** `اللائحة` with `-F`
  - VALID+ `schema.prisma:412`: "(اللائحةُ التنفيذية،"
  - VALID− `rounding.ts`: 0
- **P35 hosting region / provider:** `(?i:me-riyadh|\bsa-(east|central|riyadh|jeddah)|alibaba|singapore|oraclecloud|\boci\b|\bsccc\b|stc cloud|ap-southeast|\bruh\b)`
  - VALID+ `docker-compose.prod.yml:246` (OTHER): "(أوراكل `me-riyadh-1`)"
  - VALID− `rounding.ts`: 0
- **P36 Ejar contract prefix:** `\bEJ-|['"]EJ['"]`
  - VALID+ `company-movement.service.ts:66`: `{ model: 'Contract', kinds: ['EJ'], label: 'عقود' }`
  - VALID− `rounding.ts`: 0
- **P37 residential-exempt rule:** `RESIDENTIAL`
  - VALID+ `apps/api/src/journal/rent-tax-point.util.ts:35`: `RentClassification = 'RESIDENTIAL' | 'COMMERCIAL' | …`
  - VALID− `rounding.ts`: 0
- **P38 day helpers:** `\b(dayStartOf|dayEndOf|localYearOf|localDateOf|wallClockOf|issuedWallClock)\(`
  - VALID+ `apps/api/src/notifications/escalation.service.ts:38`: `dayStartOf(new Date())`
  - VALID− `rounding.ts`: 0
- **P39 privacy law:** `PDPL|حماية البيانات`
  - VALID+ `apps/api/src/export/company-archive.service.ts:23`: "(لائحةُ حماية البيانات م٦/٢)"
  - VALID− `rounding.ts`: 0
- **P40 withholding:** `(?i:withholding)|استقطاع`
  - VALID+ `docs/decisions.md:83`: the word at character 229, read with Node `indexOf` because the Arabic line is long
  - VALID− `rounding.ts`: 0
- **P41 excise:** `(?i:\bexcise\b)|الضريبة الانتقائية|الانتقائية`
  - VALID+ `CLAUDE.md:3337`: "…للضريبة الانتقائية…"
  - VALID− `rounding.ts`: 0
- **P42 IBAN:** `(?i:\biban\b)`
  - VALID+ `schema.prisma:2722`: `iban String?`
  - VALID− `rounding.ts`: 0

**UNION (§b.4):** the 30 patterns of Appendix A.2, run with `rg -a -c -f pats-union.txt`.
- All 30 positive lines above print `MATCH` under the union.
- VALID− `auth.service.ts`: 0

### b.2 Counts by group

Counts are **matching lines**.
- PROD = Z + V + OUT + SCHEMA + MIG.
- "code/cmt" is the code/text vs comment split of the OUT lines.
- "OUT files" is the number of PROD_OUT files.

| Probe | PROD | Z (inside) | V | **OUT** | code/cmt | OUT files | SCHEMA | MIG | TEST | DOC | OTHER |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 STANDARD_VAT_RATE | 30 | 5 | 11 | **14** | 14/0 | 6 | 0 | 0 | 24 | 1 | 0 |
| P02 15% literal | 11 | 0 | 3 | **7** | 3/4 | 5 | 0 | 1 | 18 | 229 | 6 |
| P03 0.15 | 1 | 0 | 0 | **1** | 0/1 | 1 | 0 | 0 | 12 | 4 | 0 |
| P04 1.15 / 15÷115 | 9 | 0 | 2 | **6** | 1/5 | 4 | 0 | 1 | 16 | 13 | 0 |
| P05 DB default 15 | 4 | 0 | 0 | **0** | – | 0 | 2 | 2 | 0 | 0 | 0 |
| P06 zatca | 545 | 256 | 1 | **176** | 138/38 | 39 | 43 | 69 | 540 | 583 | 31 |
| P07 fatoora | 13 | 10 | 0 | **1** | 1/0 | 1 | 2 | 0 | 6 | 1 | 0 |
| P08 ZATCA_ | 20 | 8 | 0 | **10** | 10/0 | 6 | 1 | 1 | 21 | 9 | 0 |
| P09 هيئة الزكاة | 21 | 3 | 6 | **12** | 9/3 | 8 | 0 | 0 | 0 | 57 | 0 |
| P10 box/خانة (noisy) | 101 | 0 | 69 | 26 | 6/20 | 16 | 4 | 2 | 31 | 161 | 5 |
| P10a box identifiers | 33 | 0 | 33 | **0** | – | 0 | 0 | 0 | 0 | 1 | 0 |
| P11 VATEX-SA | 46 | 3 | 36 | **1** | 0/1 | 1 | 2 | 4 | 81 | 32 | 16 |
| P12 BR-KSA | 44 | 23 | 1 | **14** | 5/9 | 7 | 4 | 2 | 36 | 32 | 1 |
| P13 SAR | 57 | 6 | 3 | **12** | 7/5 | 11 | 17 | 19 | 50 | 5 | 2 |
| P14 ر.س | 15 | 0 | 0 | **15** | 15/0 | 6 | 0 | 0 | 1 | 6 | 1 |
| P15 ريال | 14 | 0 | 5 | **7** | 4/3 | 7 | 2 | 0 | 16 | 411 | 1 |
| P16 halala | 32 | 2 | 2 | **27** | 4/23 | 12 | 1 | 0 | 21 | 31 | 0 |
| P18 VAT format `3\d{13}3` | 5 | 0 | 0 | **5** | 4/1 | 4 | 0 | 0 | 1 | 2 | 0 |
| P18b CR format `\d{10}` | 2 | 0 | 0 | **2** | 2/0 | 2 | 0 | 0 | 0 | 0 | 0 |
| P19 commercial registration | 36 | 9 | 1 | **23** | 23/0 | 11 | 2 | 1 | 10 | 60 | 0 |
| P20 national ID / iqama | 12 | 1 | 0 | **9** | 8/1 | 5 | 0 | 2 | 6 | 44 | 1 |
| P20b BR-KSA-14 schemes | 31 | 3 | 0 | **23** | 23/0 | 5 | 2 | 3 | 14 | 2 | 0 |
| P21 national address | 51 | 10 | 1 | **32** | 28/4 | 8 | 4 | 4 | 23 | 26 | 0 |
| P22 timezone constants | 23 | 2 | 0 | **21** | 19/2 | 10 | 0 | 0 | 20 | 14 | 0 |
| P23 Riyadh (word) | 30 | 2 | 0 | **22** | 2/20 | 12 | 3 | 3 | 56 | 135 | 11 |
| P24 +966 / 05xxxxxxxx | 0 | 0 | 0 | **0** | – | 0 | 0 | 0 | 43 | 1 | 13 |
| P25 Hijri | 0 | 0 | 0 | **0** | – | 0 | 0 | 0 | 0 | 42 | 0 |
| P26 weekend / holiday | 0 | 0 | 0 | **0** | – | 0 | 0 | 0 | 0 | 10 | 1 |
| P27 agencies (EN) | 30 | 0 | 0 | **20** | 8/12 | 7 | 6 | 4 | 15 | 183 | 0 |
| P28 agencies (AR) | 12 | 0 | 5 | **5** | 3/2 | 4 | 2 | 0 | 1 | 606 | 0 |
| P29 retention constants | 10 | 0 | 0 | **10** | 9/1 | 3 | 0 | 0 | 13 | 11 | 0 |
| P29b retention years (text) | 1 | 0 | 0 | **1** | 0/1 | 1 | 0 | 0 | 2 | 112 | 0 |
| P30 Saudi/KSA/المملكة | 102 | 41 | 6 | **36** | 9/27 | 25 | 12 | 7 | 56 | 782 | 7 |
| P31 'SA' / ar-SA | 38 | 9 | 0 | **26** | 21/5 | 15 | 2 | 1 | 18 | 9 | 1 |
| P32 chart-code literals | 130 | 0 | 0 | **127** | 127/0 | 11 | 0 | 3 | 355 | 9 | 3 |
| P34 اللائحة | 52 | 1 | 7 | **25** | 8/17 | 14 | 9 | 10 | 7 | 320 | 0 |
| P35 hosting region names | 0 | 0 | 0 | **0** | – | 0 | 0 | 0 | 6 | 34 | 3 |
| P36 EJ prefix | 5 | 0 | 0 | **3** | 2/1 | 2 | 1 | 1 | 0 | 15 | 0 |
| P37 RESIDENTIAL | 13 | 0 | 2 | **8** | 8/0 | 6 | 2 | 1 | 50 | 7 | 4 |
| P38 day helpers | 37 | 3 | 0 | **34** | 34/0 | 18 | 0 | 0 | 29 | 0 | 0 |
| P39 PDPL / حماية البيانات | 5 | 0 | 0 | **3** | 2/1 | 2 | 1 | 1 | 0 | 225 | 0 |
| P40 withholding | 0 | 0 | 0 | **0** | – | 0 | 0 | 0 | 0 | 209 | 0 |
| P41 excise | 0 | 0 | 0 | **0** | – | 0 | 0 | 0 | 0 | 19 | 0 |
| P42 IBAN | 20 | 0 | 0 | **18** | 17/1 | 9 | 1 | 1 | 8 | 32 | 0 |

**Money precision** (a structural assumption; see §d):
- `@db.Decimal(18, 2)`: **103** columns in `schema.prisma`. The other scales used are `(18, 6)` 28, `(18, 3)` 12, `(5, 2)` 4 and `(9, 6)` 2.
- `round2(`: **320** production lines in **45** files, across `apps/api/src` and `apps/web/src`.

### b.3 Outside-module files per probe (PROD_OUT, lines per file)

Prefix `api:` = `apps/api/src/`, `web:` = `apps/web/src/`. Lists are complete for every probe.

- **P01 STANDARD_VAT_RATE (14):** api:purchases/purchases.service.ts(4) · web:pages/suppliers/PurchaseModal.tsx(2) · web:pages/products/ProductModal.tsx(2) · web:pages/contracts/ContractDetailModal.tsx(2) · api:purchases/supplier-notes.service.ts(2) · api:journal/rent-tax-point.util.ts(2)
- **P02 15% (7):** web:pages/contracts/ContractDetailModal.tsx(2) · api:journal/rent-tax-point.util.ts(2) · web:pages/suppliers/PurchaseModal.tsx(1, UI label "(15٪)") · web:pages/pos/PosPage.tsx(1, UI label "الضريبة 15%") · web:pages/contracts/ContractModal.tsx(1, UI text "تُضاف 15%")
- **P03 0.15 (1):** api:journal/rent-tax-point.util.ts(1, comment)
- **P04 1.15 / 15÷115 (6):** api:journal/rent-tax-point.util.ts(2) · api:journal/rent-accrual.util.ts(2) · web:pages/contracts/ContractModal.tsx(1, UI text) · api:invoices/invoices.service.ts(1)
- **P06 ZATCA (176 / 39 files):**
  - Top: api:common/i18n/messages.ts(39) · api:invoices/invoices.service.ts(18) · web:pages/invoices/InvoiceListView.tsx(17) · web:api/invoices.ts(13) · api:pos/pos.service.ts(11) · web:pages/pos/PosPage.tsx(9) · web:pages/invoices/InvoicesPage.tsx(7) · api:outbox/outbox.module.ts(5) · api:export/export.service.ts(5)
  - Then: web:pages/companyProfile/CompanyProfilePage.tsx(4) · web:layout/AppShell.tsx(4) · api:export/export-scope.ts(4) · api:export/company-archive.service.ts(4) · api:invoices/active-documents.util.ts(3) · api:company-profile/dto/update-company-profile.dto.ts(3) · api:app.module.ts(3) · web:pages/invoices/statusMeta.ts(2) · api:pos/pos.module.ts(2) · api:invoices/invoices.controller.ts(2) · api:common/retry-on-conflict.util.ts(2)
  - One line each: web:pages/invoices/DebitNoteModal.tsx, web:pages/invoices/CreditNoteModal.tsx, web:lib/posQueue.ts, web:index.css, web:api/notifications.ts, web:api/companyProfile.ts, api:invoices/dto/create-debit-note.dto.ts, api:invoices/dto/create-credit-note.dto.ts, api:inventory/write-offs.service.ts, api:delegations/root-grants.ts, api:delegations/intersection.ts, api:delegations/delegation-log.ts, api:common/tenant/tenant-scope.extension.ts, api:common/tenant/nested-transaction-probe.ts, api:common/money/rounding.ts, api:common/config/production-secrets.ts, api:cash-drawers/cash-drawers.service.ts, api:audit/audit.service.ts, api:audit/audit-entity-from-result.decorator.ts
- **P07 fatoora (1):** api:common/i18n/messages.ts(1)
- **P08 ZATCA_ (10):** web:pages/invoices/InvoiceListView.tsx(3) · api:export/export.service.ts(2) · api:company-profile/dto/update-company-profile.dto.ts(2) · web:pages/invoices/statusMeta.ts(1) · web:api/notifications.ts(1) · api:export/export-scope.ts(1)
- **P09 هيئة الزكاة (12):** api:common/i18n/messages.ts(5) · web:pages/invoices/InvoicesPage.tsx(1) · web:pages/invoices/InvoiceListView.tsx(1) · web:pages/invoices/DebitNoteModal.tsx(1) · web:pages/invoices/CreditNoteModal.tsx(1) · api:delegations/permissions.service.ts(1) · api:delegations/delegations.service.ts(1) · api:common/money/totals.ts(1)
- **P10a return-box identifiers:** none outside. All 33 lines are in `obligations.service.ts` (V).
- **P11 VATEX-SA (1):** web:api/products.ts(1, comment)
- **P12 BR-KSA (14):** api:common/i18n/messages.ts(5) · api:customers/dto/create-customer.dto.ts(3) · api:customers/customers.service.ts(2) · web:api/customers.ts(1) · api:invoices/dto/create-debit-note.dto.ts(1) · api:invoices/dto/create-credit-note.dto.ts(1) · api:common/money/totals.ts(1)
- **P13 SAR (12):** api:companies/company-defaults.ts(2) · web:pages/settings/SettingsPage.tsx(1) · api:pos/pos.service.ts(1) · api:maintenance/maintenance.service.ts(1) · api:journal/auto-posting.util.ts(1) · api:invoices/invoices.service.ts(1) · api:currencies/currencies.service.ts(1) · api:common/i18n/messages.ts(1) · api:common/currency/currency-fields.dto.ts(1) · api:common/currency/base-amount.util.ts(1) · api:cash-drawers/cash-drawers.service.ts(1)
- **P14 ر.س (15, all UI/code):** web:pages/DashboardPage.tsx(4) · web:pages/suppliers/SupplierDetailModal.tsx(3) · web:pages/customers/CustomerDetailModal.tsx(3) · web:pages/suppliers/IncorporationReportPage.tsx(2) · web:pages/invoices/InvoiceBuilderView.tsx(2) · api:companies/company-defaults.ts(1)
- **P15 ريال (7):** web:pages/invoices/InvoiceListView.tsx(1) · web:pages/companyProfile/CompanyProfilePage.tsx(1) · api:invoices/dto/update-invoice.dto.ts(1) · api:integrations/payment-terminal.adapter.ts(1) · api:companies/company-defaults.ts(1) · api:common/money/allocation.ts(1) · api:common/i18n/messages.ts(1)
- **P16 halala (27; 23 comments):**
  - Files: api:invoices/invoices.service.ts(4) · api:integrations/payment-terminal.adapter.ts(4) · api:common/money/allocation.ts(4) · api:common/money/rounding.ts(3) · api:purchases/landed-costs.service.ts(2) · api:journal/rent-accrual.util.ts(2) · api:common/settlement/settlement.util.ts(2) · api:common/money/totals.ts(2) · web:lib/money.ts(1) · api:quotes/quotes.service.ts(1) · api:purchases/purchases.service.ts(1) · api:purchases/goods-receipts.service.ts(1)
  - The code lines are `toHalalas()` at `common/money/rounding.ts:112` and its use in `payment-terminal.adapter.ts:1,39-40`.
- **P18 VAT format (5):** api:customers/dto/create-customer.dto.ts(2: `:52` plus a comment) · web:pages/companyProfile/CompanyProfilePage.tsx(1: `:8` `VAT_PATTERN`) · api:customers/dto/update-customer.dto.ts(1: `:34`) · api:company-profile/dto/update-company-profile.dto.ts(1: `:50`)
- **P18b CR format (2):** web:pages/companyProfile/CompanyProfilePage.tsx(1: `:9` `CR_PATTERN`) · api:company-profile/dto/update-company-profile.dto.ts(1: `:55`)
- **P19 commercial registration (23):** web:pages/companyProfile/CompanyProfilePage.tsx(8) · web:api/companyProfile.ts(2) · api:export/company-archive.service.ts(2) · api:company-profile/dto/update-company-profile.dto.ts(2) · api:company-profile/company-profile.service.ts(2) · api:common/i18n/messages.ts(2) · web:i18n/locales/en.json(1) · web:i18n/locales/ar.json(1) · web:api/customers.ts(1) · api:export/export.service.ts(1) · api:common/i18n/validation.util.ts(1)
- **P20 national ID / iqama (9):** web:api/customers.ts(3) · api:common/i18n/messages.ts(3) · web:pages/contracts/AttachmentsSection.tsx(1) · api:customers/dto/create-customer.dto.ts(1) · api:common/throttle/tenant-tracker.ts(1, comment)
- **P20b BR-KSA-14 schemes (23, all code):** api:customers/customers.service.ts(6) · web:pages/customers/CustomerModal.tsx(5) · web:api/customers.ts(4) · api:customers/dto/update-customer.dto.ts(4) · api:customers/dto/create-customer.dto.ts(4)
- **P21 national address (32):** web:pages/companyProfile/CompanyProfilePage.tsx(13) · web:api/companyProfile.ts(4) · api:company-profile/company-profile.service.ts(4) · api:customers/customers.service.ts(3) · api:company-profile/dto/update-company-profile.dto.ts(3) · api:customers/dto/update-customer.dto.ts(2) · api:customers/dto/create-customer.dto.ts(2) · api:common/privacy/personal-fields.ts(1)
- **P22 timezone constants (21):**
  - Files: api:common/wall-clock.util.ts(4) · web:lib/wallClock.ts(2) · api:trash/trash.service.ts(2) · api:notifications/escalation.service.ts(2) · api:deletion-requests/personal-data-erasure.service.ts(2) · api:contracts/rent-recognition.service.ts(2) · api:contracts/rent-accrual.service.ts(2) · api:consent/consent.service.ts(2) · api:api-keys/integration-usage.service.ts(2) · api:common/document-year.util.ts(1)
  - The 7 crons with `timeZone: SCHEDULE_TIME_ZONE`: `zatca/certificate-expiry.service.ts:38` (inside Z), `contracts/rent-recognition.service.ts:72`, `trash/trash.service.ts:155`, `consent/consent.service.ts:191`, `deletion-requests/personal-data-erasure.service.ts:153`, `contracts/rent-accrual.service.ts:35`, `notifications/escalation.service.ts:210`.
- **P23 Riyadh (22; 20 comments):** api:common/wall-clock.util.ts(6) · api:quotes/quote-expiry.util.ts(3) · api:pos/pos.service.ts(2) · api:fiscal/period-lock.util.ts(2) · api:common/document-year.util.ts(2) · web:pages/properties/PropertiesMap.tsx(1) · web:pages/companyProfile/CompanyProfilePage.tsx(1) · api:quotes/quotes.service.ts(1) · api:invoices/dto/create-credit-note.dto.ts(1) · api:companies/companies.service.ts(1) · api:api-keys/integration-usage.service.ts(1) · api:activities/sectors.ts(1)
- **P27 agencies EN (20):** web:pages/contracts/DepositsSection.tsx(6) · api:journal/auto-posting.util.ts(4) · web:api/contracts.ts(3) · web:api/customers.ts(2: MHRSD, MISA labels) · api:contracts/dto/deposit.dto.ts(2) · api:contracts/contracts.service.ts(2) · api:contracts/dto/renew-contract.dto.ts(1)
- **P28 agencies AR (5):** web:pages/contracts/DepositsSection.tsx(2) · web:pages/contracts/ContractModal.tsx(1) · api:consent/consent.controller.ts(1) · api:api-keys/integration-usage.service.ts(1)
- **P29 retention constants (10):** api:trash/trash-retention.util.ts(4) · api:companies/company-movement.service.ts(4) · api:deletion-requests/deletion-requests.service.ts(2)
- **P30 Saudi / KSA / المملكة (36; 27 comments):**
  - Code/text lines: `common/i18n/messages.ts` (7 lines: `:861`, `:1206-1207`, `:1254-1255`, `:1258-1259`) · `common/config/production-secrets.ts:116` · `web pages/companyProfile/CompanyProfilePage.tsx:424`
  - The other 22 files are comments.
- **P31 'SA' / ar-SA (26):**
  - api:customers/customers.service.ts(6: default buyer country `'SA'` at `:26`, `:108`, `:140`; Saudi-VAT-number rule at `:27`)
  - `'ar-SA'` in 14 lines in 10 files: web:pages/settings/SupportAccessCard.tsx(3) · web:pages/tasks/MyTasksPage.tsx(2) · web:pages/audit/DelegationLogPage.tsx(2) · web:pages/settings/CashDrawersCard.tsx(1) · web:pages/settings/ApiKeysCard.tsx(1) · web:pages/pos/PosPage.tsx(1) · web:pages/developer/SupportAccessSection.tsx(1) · web:pages/contracts/HandoversSection.tsx(1) · web:pages/audit/AuditLogPage.tsx(1: `'ar-SA-u-ca-gregory'` at `:19`) · web:layout/AppShell.tsx(1)
  - web:pages/customers/CustomerModal.tsx(3: `:23`, `:49`, `:115` default `'SA'`) · web:api/customers.ts(1) · api:customers/dto/create-customer.dto.ts(1) · api:common/i18n/language.util.ts(1, comment)
- **P32 chart-code literals (127):**
  - Files: api:journal/auto-posting.util.ts(75) · api:accounts/default-chart.ts(20) · api:common/purchase-categories.ts(9) · api:reports/reports.service.ts(8) · api:journal/pos-settlement.util.ts(6) · api:journal/inventory-accounts.util.ts(3) · api:fiscal/year-closing.util.ts(2) · api:journal/writeoff-account.util.ts(1) · api:journal/prepayment-account.util.ts(1) · api:journal/opening-balance.util.ts(1) · api:journal/deferred-revenue-account.util.ts(1)
  - Outside the template file itself: **107 lines in 10 files**.
- **P34 اللائحة (25):** api:common/writeoff-reasons.ts(9: 7 are code, the `source:` strings of `WRITEOFF_REASONS` `:43`) · api:journal/auto-posting.util.ts(2) · api:customers/marketing-consent.util.ts(2) · api:common/tenant/tenant.guard.ts(2) · web:pages/customers/MarketingConsentPanel.tsx(1) · web:api/customers.ts(1) · api:support-access/support-access.controller.ts(1) · api:journal/rent-tax-point.util.ts(1) · api:invoices/note-deadline.util.ts(1) · api:export/company-archive.service.ts(1) · api:customers/dto/record-marketing-consent.dto.ts(1) · api:customers/customers.service.ts(1) · api:customers/customers.controller.ts(1) · api:consent/consent.service.ts(1)
- **P36 EJ prefix (3):** api:contracts/contracts.service.ts(2) · api:companies/company-movement.service.ts(1, `:66`)
- **P37 RESIDENTIAL (8):** web:pages/contracts/contractMeta.ts(2) · api:journal/rent-tax-point.util.ts(2) · web:pages/contracts/ContractModal.tsx(1) · web:pages/contracts/ContractDetailModal.tsx(1) · web:api/contracts.ts(1) · api:contracts/dto/create-contract.dto.ts(1)
- **P38 day helpers (34):**
  - Files: api:common/wall-clock.util.ts(10) · api:invoices/invoices.service.ts(4) · api:reports/reports.service.ts(3) · api:pos/pos.service.ts(2) · api:customers/customers.service.ts(2) · then one line each in web:pages/pos/PosPage.tsx, web:lib/wallClock.ts, api:warranties, suppliers, reminders, quotes/quote-expiry.util, payments, notifications/escalation, leaves.controller, journal/opening-balance.util, journal/journal.service, banks/reconciliation.service, api-keys/integration-usage.service
  - Heuristic split of the call sites: 8 pass an explicit offset argument, 15 pass none and so default to UTC. The only call that passes the Saudi offset constant is `integration-usage.service.ts:11`.
- **P39 PDPL (3):** api:export/company-archive.service.ts(2) · web:pages/companyProfile/CompanyProfilePage.tsx(1)
- **P42 IBAN (18):** banks plumbing (BankModal 4, BanksPage 3, banks.service 3, web api/banks 2, DTOs 2) · personal-fields.ts(2) · validation.util.ts(1) · error-event.util.ts(1: the `SA`-only IBAN mask at `:78`)

### b.4 Union of all Saudi markers (distinct lines)

**Probe:** the 30 patterns of Appendix A.2 (P01–P04, P06, P07, P09, P10a, P11–P16, P18–P23, P24, P27–P31, P34, P36, P37), run as `rg -a -c -f`. They are validated as described at the end of §b.1.

| Group | Distinct lines | Files |
|---|---|---|
| PROD_Z (inside) | 357 | 18 |
| PROD_V | 115 | 12 |
| **PROD_OUT (outside)** | **525** | **135** (90 api, 45 web) |
| SCHEMA | 109 | 1 |
| MIG | 128 | 44 migrations |
| TEST | 1,065 | 148 |
| DOC | 3,117 | 125 |
| OTHER | 88 | 16 |

- **Outside split:** 357 code/text lines and 168 comment lines.
- **Outside share** of production code, excluding schema and migrations: 525 / (357 + 115 + 525) = **52.7%**. Including schema and migrations: 525 / 1,234 = 42.5%.
- **`packages/shared/src`:** 0 lines.
- **Top outside files by distinct lines:**
  - 52 `common/i18n/messages.ts`
  - 28 `web pages/companyProfile/CompanyProfilePage.tsx`
  - 23 `invoices/invoices.service.ts`
  - 19 `web pages/invoices/InvoiceListView.tsx`
  - 17 `customers/customers.service.ts`
  - 14 `pos/pos.service.ts`
  - 13 `web api/invoices.ts`
  - 12 each: `web api/customers.ts`, `customers/dto/create-customer.dto.ts`, `common/wall-clock.util.ts`
  - 11 each: `web pages/pos/PosPage.tsx`, `company-profile/dto/update-company-profile.dto.ts`
  - 10 `common/writeoff-reasons.ts`
  - 9 `journal/rent-tax-point.util.ts`
  - 8 each: `web pages/invoices/InvoicesPage.tsx`, `web pages/customers/CustomerModal.tsx`, `web pages/contracts/DepositsSection.tsx`, `journal/auto-posting.util.ts`
- **By area** (outside lines): api/common 108 · api/customers 40 · web/api 39 · web/pages/invoices 35 · api/invoices 34 · web/pages/companyProfile 28 · web/pages/contracts 22 · api/journal 20 · api/pos 17 · api/export 17 · api/company-profile 17 · web/pages/customers 12 · api/contracts 12 · web/pages/pos 11 · api/purchases 10.
- **Within api/common:** messages.ts 52 · wall-clock.util.ts 12 · writeoff-reasons.ts 10 · money/allocation.ts 5 · money/totals.ts 4 · money/rounding.ts 4. The remaining 18 files have 1–2 lines each.

### b.5 What the outside matches are (read in the code)

1. **Currency falls back to Saudi, not to the company.**
   - `resolveCurrency()` returns `input?.currency?.trim() || DEFAULT_CURRENCY`, and `DEFAULT_CURRENCY = 'SAR'` (`common/currency/base-amount.util.ts:11,29-34`).
   - It has **9 call sites**: payments `:151`, quotes `:126`, transactions `:60`, supplier-payments `:135`, `journal/journal-posting.util.ts:220`, purchases `:109`, contracts `:176`, invoices `:538`, banks `:65`.
   - So a document created without an explicit currency is stored as **SAR at rate 1, whatever the company's base currency**.
2. **Other hard-coded SAR:**
   - The POS card charge sends `currency: 'SAR'` to the payment provider (`pos/pos.service.ts:526`).
   - Fallbacks `|| 'SAR'` at `maintenance.service.ts:187`, `?? 'SAR'` at `cash-drawers.service.ts:150`, and `useState('SAR')` at `web pages/settings/SettingsPage.tsx:64`.
   - Company birth writes the currency row `{ code: 'SAR', name: 'ريال سعودي', symbol: 'ر.س' }` (`companies/company-defaults.ts:47`).
   - The web shows `ر.س` beside amounts in 15 lines, whatever the document's currency (P14).
3. **The base currency is treated as SAR for ZATCA:**
   - `zatca.service.ts:561`: `taxTotalSar: Number(invoice.baseTaxTotal ?? invoice.taxTotal)`.
   - `invoices.service.ts:734` (comment): "ZATCA is told the VAT figure in SAR, and that is `baseTaxTotal`."
4. **Saudi time for everyone:** every company's scheduled jobs run on Riyadh time (7 crons, P22). `KSA_UTC_OFFSET_MIN` sets the API-quota month (`api-keys/integration-usage.service.ts:11`). The ZATCA local-time rule lives in **core** `common/wall-clock.util.ts:114-121` and is duplicated in web `lib/wallClock.ts:13,31`.
5. **Saudi identity formats applied to every company and customer, with no country condition:**
   - VAT regex in `update-company-profile.dto.ts:50`, `create-customer.dto.ts:52` and `update-customer.dto.ts:34`, plus web `CompanyProfilePage.tsx:8`.
   - CR regex in `update-company-profile.dto.ts:55` and web `:9`.
   - `customers.service.ts:26-27` allows a VAT number only for buyers whose country is `SA`.
6. **The core `customers` module owns Saudi buyer-ID rules:** `BUYER_ID_SCHEMES` (the 11 BR-KSA-14 codes) at `create-customer.dto.ts:9` and web `api/customers.ts:18-29`. The database enforces them with `customers_other_id_scheme` (`migrations/20260922003000_customer_kind/migration.sql:54`). By contrast, Odoo keeps the same list inside `l10n_sa_edi` [O9a **verified**].
7. **Saudi VAT rules inside core modules:**
   - `common/writeoff-reasons.ts:11-12,43-97`: the deemed-supply vs no-adjustment paths, citing the Implementing Regulation Art. 15/49/52. Imported by `journal/auto-posting.util.ts`, `inventory/write-offs.service.ts` and `reports/reports.service.ts`.
   - `journal/rent-tax-point.util.ts`: the Art. 20 tax point, and `RENT_VAT_RATE` at `:33`.
   - `invoices/note-deadline.util.ts:18`: `NOTE_DEADLINE_DAYS = 15`, the credit/debit-note deadline.
   - `purchases/purchases.service.ts:26`: `VAT_RATE = STANDARD_VAT_RATE / 100`.
8. **Database constraints with Saudi values:**
   - `migrations/20260920150000_product_tax_category/migration.sql:113-138` requires `taxExemptionReasonCode = 'VATEX-SA-OOS'` for category `O` on `products`, `invoice_lines` and `quote_lines`.
   - `customers_other_id_scheme` (`20260922003000_customer_kind/migration.sql:54`) restricts `otherIdScheme` to the 11 BR-KSA-14 codes.
   - Across all migrations these are the only Saudi values found **inside** CHECK constraints. Every P11 hit in MIG (4 lines) is in `20260920150000`. Every P20b hit in MIG (3 lines) is in `20260922003000`. The `'SAR'` and `15` hits in migrations are column `DEFAULT`s, not CHECKs.
   - 28 constraint names match `CONSTRAINT "…" CHECK` on one line. Other CHECKs whose `CONSTRAINT` and `CHECK` sit on separate lines (activity sectors, tasks) were read and carry no Saudi values.
9. **Retention periods and the Ejar prefix in the core `companies` module:** `RETENTION_YEARS = { books: 10, realEstate: 11 }` (`company-movement.service.ts:88`), and the contract series `EJ` (`:66`).
10. **Seeded Saudi content written into every tenant:**
    - `STANDARD_OBLIGATIONS` (ZATCA ×4, Ministry of Commerce ×3, GOSI ×2) is seeded on first read into `government_obligations` (`obligations.service.ts:69-79`).
    - The default chart's 23 Arabic account names (`accounts/default-chart.ts:39-99`).
    - The SAR currency row.
11. **User-facing text:** `common/i18n/messages.ts` holds 52 distinct Saudi-marker lines (39 of them name ZATCA). The web hard-codes `.rikzapp.com` as the subdomain suffix (`CompanyProfilePage.tsx:258`) and `'ar-SA'` date formatting (14 lines).
    - Measured on Node 24.18 / ICU 78.3: `ar-SA` resolves to the **gregory** calendar with **arab** digits. So these calls do not show Hijri dates on this engine; older ICU versions were not measured. `AuditLogPage.tsx:19` forces `-u-ca-gregory` explicitly.
12. **What is already clean:**
    - Hosting-region and provider names: 0 in production code (P35); they live only in `.env.production.example` and docs.
    - Saudi phone numbers: 0 in production (P24).
    - Hijri and weekend logic: 0 (P25, P26).
    - `packages/shared/src`: 0 on the union probe.

---

## (c) Is "country" a company attribute today, or assumed?

### c.1 Fields that exist (snapshot `schema.prisma`; `model Company` spans 308–576)

| Model / field | Line | Note |
|---|---|---|
| `Company.orgName` | 312 | Display name |
| `Company.slug String? @unique` | 388 | Subdomain (`alfa` in `alfa.rikzapp.com`), unique **platform-wide** |
| `Company.legalName` | 405 | Legal name, for invoices |
| `Company.vatNumber` | 408 | Comment at 406–407 says "15 digits, starts and ends with '3' — validated in the DTO" |
| `Company.crNumber` | 410 | Comment at 409 says "Commercial Registration number, 10 digits" |
| `Company.vatPeriod VatPeriod @default(QUARTERLY)` | 417 | Comment at 411–416: the Saudi rule, monthly above 40 million |
| `Company.phone / email / website / address` | 418–422 | Free text |
| `Company.street / buildingNumber / district / city / postalCode` | 429–433 | ZATCA `cac:PostalAddress` parts |
| `Company.additionalNumber / unitNumber` | 437–438 | Comment at 434–436: "the two complements of the **Saudi national address** (7 official fields) … required by ZATCA, Ejar and Wathq" |
| `Company.baseCurrency String @default("SAR")` | 449 | **Never written by code.** Only reads: `banks/network-settlements.service.ts:157-158`, `cash-drawers/cash-drawers.service.ts:145,150` |
| `Company.zatcaCredential` / `egsUnits` | 455 / 457 | Relations to Saudi-only tables `ZatcaCredential` (888) and `EgsUnit` (1026) |
| `Company.retainUntil` | 318 | Filled from `RETENTION_YEARS` when a company is closed |
| `Customer.country String @default("SA")` | 1265 | **The only country field in the schema**, for the buyer (BT-55) |
| `Customer.kind` / `otherIdScheme` / `otherId` | 1255 / 1261 / 1262 | BR-KSA-14, with a DB CHECK on the 11 schemes |
| `Customer.street…postalCode` | 1282–1286 | Buyer national address (BR-KSA-63) |
| `Currency` code / name / symbol / isBase / rate | 1059–1075 | **No decimals / minor-unit field** |
| `FiscalYear` start / end `@db.Date` | 1101–1123 | Gregorian; the comment says a Saudi year need not start in January |
| `FiscalPeriod` month (1–12) / year | 1133–1156 | Gregorian months |
| `LoginIdentity.username String @unique` | 119 | No locale or language field |
| `BusinessActivity.sector` | 639–687 | Business sector; no country |

### c.2 Fields that do not exist (validated)

**Search:** `rg -a -n -i '\b(country|countries|timezone|time_zone|tz|locale|language|lang|region|jurisdiction)\b' schema.prisma` returns **exactly one line: `:1265` (`Customer.country`)**.

**Validation:**
- The same regex on a synthetic file containing `timezone String` / `locale String` matched both lines.
- On `rounding.ts` it returned 0.

**So the schema has none of the following:** `Company.country`, a company time zone, a company locale or language, a fiscal/tax country, a tax-regime or rate table per country, or currency decimals.

### c.3 How a company is born

- **Self-registration** captures `orgName`, `username`, `password` and an optional `email` (`auth/auth.controller.ts:53-56`, `auth/auth.service.ts:438`).
- **`createCompanyAccount`** takes `username`, `password`, `orgName`, `permissionTemplateId`, `email?`, `subStart?`, `subEnd?` and `trialDays` (`companies/create-company-account.ts:32-45`):
  - **No country, currency, time zone or locale.**
  - The company row gets `orgName` and subscription dates (`:97-101`).
  - Then `createDefaultChart` and `createCompanyDefaults` run (`:110-111`), giving the one Arabic chart plus a SAR currency row.

### c.4 Where the code assumes Saudi instead of reading the company

| Assumption | Where | Effect |
|---|---|---|
| Document currency = SAR when omitted | `common/currency/base-amount.util.ts:11,31` (9 call sites) | Ignores `Company.baseCurrency` |
| Card charge currency = SAR | `pos/pos.service.ts:526` | Sent to the payment adapter |
| Currency fallbacks | `maintenance.service.ts:187`, `cash-drawers.service.ts:150`, web `SettingsPage.tsx:64` | Literal `'SAR'` |
| Currency symbol in the UI | 15 lines / 6 web files (P14) | `ر.س` fixed next to amounts |
| Base currency used as "SAR amount" for ZATCA | `zatca/zatca.service.ts:561`; `invoices.service.ts:734` | Correct only while base = SAR |
| Schedule time zone | `common/wall-clock.util.ts:46`; 7 crons (§b.3 P22) | Every tenant runs on Riyadh time |
| KSA UTC offset | `common/wall-clock.util.ts:34,115`; web `lib/wallClock.ts:13,31`; `api-keys/integration-usage.service.ts:11` | Quota month and ZATCA time format |
| Server "today" | `common/wall-clock.util.ts:94-106` (default offset 0) | UTC, not the company's day. The header says the device offset is "a door not opened today" (owner decision) |
| VAT-number / CR formats | DTOs `:50`, `:55`, `create-customer.dto.ts:52`, `update-customer.dto.ts:34`; web `CompanyProfilePage.tsx:8-9` | Saudi format enforced on every company and customer |
| Buyer country defaults to SA | DB `schema.prisma:1265`; `customers.service.ts:26,108,140`; web `CustomerModal.tsx:23,49,115` | New buyers become SA unless declared |
| Saudi VAT number only for SA buyers | `customers.service.ts:27` | Saudi rule in the core customers module |
| One VAT rate | `common/vat/standard-rate.ts:13`, web `lib/vat.ts:11`; DB `taxRate @default(15)` `:1686,:1944` | No per-country or per-company rate |
| Filing period default and threshold | `schema.prisma:417` (QUARTERLY); `common/vat/vat-period.util.ts:17` (40,000,000) | Saudi rule |
| Retention | `companies/company-movement.service.ts:88` | 10 / 11 years |
| Note deadline | `invoices/note-deadline.util.ts:18` | 15 days after month end |
| Write-off VAT paths | `common/writeoff-reasons.ts:43` | Saudi Art. 15/49/52 |
| Seeded obligations | `obligations/obligations.service.ts:69-79` | 9 Saudi agency obligations per tenant |
| Chart template | `accounts/default-chart.ts:39-99`; codes in 10 more files (P32) | One Arabic chart for all |
| Display locale | 14 lines / 10 web files (P31) | `'ar-SA'` |
| e-invoicing for every company | `outbox/outbox.module.ts:46-50`; `app.module.ts:39,167` | ZATCA delivery registered unconditionally |

---

## (d) Reversibility of each finding

**Classes:**
- **C** = one-line / configuration: a constant moved into config or read from the company. No stored data changes.
- **S** = structural but reversible: needs a migration or a refactor, and existing data stays valid.
- **I** = irreversible: issued or persisted artifacts, or history, that cannot be changed afterwards. Only new rows can differ.

| # | Finding | Class | Reason |
|---|---|---|---|
| 1 | `STANDARD_VAT_RATE = 15` (API + web, single-source guard) | C | Pure constant. The guard shows there are exactly two copies |
| 2 | `SCHEDULE_TIME_ZONE = 'Asia/Riyadh'` (7 crons) | C | Constant. A per-company time zone would make it S (crons run once for all tenants) |
| 3 | `KSA_UTC_OFFSET_MIN` in the quota month | C | One call site |
| 4 | `DEFAULT_CURRENCY = 'SAR'` and `resolveCurrency` fallback | C | Replace with a read of `company.baseCurrency`. Rows written so far keep SAR (see #20) |
| 5 | `'SAR'` literals in POS / maintenance / cash-drawers / settings UI | C | 4 lines |
| 6 | `ر.س` UI labels (15) and `'ar-SA'` locale (14) | C | Text/format constants |
| 7 | VAT / CR regexes in DTOs and web | C | Move behind a per-country validator. No stored data changes |
| 8 | `RETENTION_YEARS`, `NOTE_DEADLINE_DAYS`, 40M threshold, 5000 / 5-year correction limits | C | Constants. Already-computed `retainUntil` values stay (see #22) |
| 9 | Hosting region / provider | C (already) | Env and docs only; 0 in code (P35) |
| 10 | ZATCA wired into core (imports from invoices / pos / company-profile; unconditional outbox handler; `ZatcaModule` in `app.module.ts`) | S | Refactor to an adapter registry keyed by the company's country. The `INVOICE_ISSUED` event seam already exists |
| 11 | Saudi VAT rules in core modules (`writeoff-reasons.ts`, `rent-tax-point.util.ts`, `note-deadline.util.ts`, customers' BR-KSA rules) | S | Code moves. Stored write-off reasons and tax paths stay valid |
| 12 | Layer map lists `zatca` / `obligations` as core; no country layer in the guard | S | Edit the JSON and the guard: documentation plus the test |
| 13 | Missing `Company.country` / time zone / locale | S | Additive migration. **The default for existing rows must be decided (all SA today)** |
| 14 | `Currency` without decimals; 103 `Decimal(18,2)` columns; `round2` ×320 lines; web `fmt` fixed at 2 decimals | S (heavy) | Widening 2→3 decimals is a lossless `ALTER TYPE`, but every rounding call site must become currency-aware. Issued Saudi documents stay at 2 decimals, which is correct |
| 15 | Single Arabic chart; 107 hard-coded code literals outside the template | S | Needs a template per country and code lookup by role. Tenants' existing accounts are tenant data |
| 16 | DB defaults `'SAR'` (17 schema lines, 19 migration lines in 9 migrations) and `taxRate DEFAULT 15` (2 + 2) | S | A new migration changes the defaults. Existing rows are unaffected |
| 17 | DB CHECK constraints with `VATEX-SA-OOS` (3 tables) and BR-KSA-14 schemes (customers) | S (constraint) + I (history) | New migrations can relax them. The migration **text** is history and cannot be edited (CLAUDE.md §7.1; checksums) |
| 18 | National-address columns (Company 7, Customer 5) | S | Additive: other countries add their own address parts |
| 19 | `DepositHolder.EJAR` enum value (`schema.prisma:3820-3824`) and `Contract.ejarNo` (`:3936`) | S | `ALTER TYPE … RENAME VALUE` or a generic "platform" holder by migration. Rows keep the meaning |
| 20 | **Provenance of defaulted values:** rows that received `country='SA'` (`:1265`) or `currency='SAR'` (16 money tables plus `Company.baseCurrency`, never written) by default | **I** | "Declared Saudi" can no longer be told apart from "defaulted Saudi". Harmless for Saudi tenants, but permanent |
| 21 | **Issued e-invoice artifacts on the core `invoices` table:** `zatcaUuid`, `zatcaHash`, `zatcaPreviousHash`, `zatcaIcv` (`@@unique([egsUnitId, zatcaIcv])` `:1589`), `zatcaSignedXml`, `zatcaQrPayload`, stamps (`:1461-1505`) | **I** | Signed and submitted documents and the hash chain cannot change and must be retained. The columns can move to an extension table, but the values and chain are fixed |
| 22 | **Issued document numbers** `<KIND>-<YYYY>-<NNNN>`, including `EJ-…` contracts. `@@unique([companyId, no])` on 12 tables; invoice numbers are inside the signed XML | **I** | Issued numbers are permanent. New series can differ |
| 23 | **Stored Arabic text:** `AuditLog.summary` ("A human-readable Arabic sentence", `:2497-2499`) and `Notification.title/body` (`:3418-3419`) | **I** | Rendered when written; cannot be re-rendered in another language. This is a language issue, not a country one; new rows could store message keys |
| 24 | Stored retention deadlines (`Company.retainUntil`) of closed companies | **I** | Computed with Saudi periods at closing time |
| 25 | Tenant-seeded Saudi content (obligations list, Arabic chart names, SAR currency row) | **I** (tenant data) | Written into tenant tables. The platform should not rewrite tenant data. Correct for Saudi tenants |
| 26 | Filed VAT returns / corrections / ratios (`VatReturnFiling`, `VatReturnCorrection`, `VatProportionalRatio`) and issued line tax categories with `VATEX-SA` reasons | **I** | Historical Saudi filings and issued lines |

**Not measured:** which live database has already applied migrations `20260920150000` and `20260922003000`. I did not connect to any database.

---

## (e) One deployment per region

### e.1 What already works per deployment

- **One self-contained stack.** `docker-compose.prod.yml:9-273` defines postgres, redis, minio, api, web, backup and backup-offsite, with named volumes `postgres_data`, `redis_data`, `minio_data` (`:275-278`). `DEPLOY.md:3` describes "a single server with Docker".
- **Everything deployment-specific comes from `.env.production`:**
  - Origin and API URL: `WEB_ORIGIN` (`compose:89`; example `:20`), `PUBLIC_API_URL`.
  - The web build argument `VITE_API_URL` (`compose:133`), so one web build is tied to one API.
  - Storage: `S3_*` / `S3_BUCKET` (`:97`).
  - Mail: `SMTP_*`.
  - Error tracking: `ERROR_TRACKING_DSN` (`:110`).
  - Offsite backup: `RESTIC_*` and `OFFSITE_REGION` (`:247`).
  - Platform admin credentials (`:113-114`).
- **The deploy script is per directory:** `deploy.sh:27-28,39` uses `docker-compose.prod.yml` plus `.env.production` from the current directory.
- **Tenant isolation is inside one deployment.** It is RLS keyed on `app.company_id` (CLAUDE.md §6.1, `:1343-1349`), and there are no cross-deployment keys.
- **No global integer sequences.** IDs are `uuid()`. Document numbers are unique per company (`@@unique([companyId, no])` ×12) with counters per company, kind and year (`DocumentSequence` `:6019`). Business data from two regions would never collide.
- **Hosting region is not in code** (P35 = 0). The residency decision lives in `DEPLOY.md:8-16` (inside the Kingdom, Riyadh; Ejar contracts and PDPL) and in env examples (`.env.production.example:43` Oracle mail in Riyadh; `:60` error tracking inside the Kingdom; `:78-85` offsite `me-riyadh-1`).
- **Deployments are already treated as islands.** The Singapore test server and Riyadh "start clean, no data transfer" (`DEPLOY.md:46-72`).
- **The platform admin is bootstrapped per deployment** from env (`platform/platform-bootstrap.ts:23`; `compose:113-114`; example `:73` `PLATFORM_ADMIN_USERNAME=Arsan`).

### e.2 What would block or conflict

1. **Names that are unique only inside one deployment:**
   - `LoginIdentity.username @unique` (`schema.prisma:119`).
   - `Company.slug @unique` (`:388`), plus `ReservedSlug` (`:868`), a platform registry whose rows are never deleted.
   - The web hard-codes the suffix `.rikzapp.com` (`CompanyProfilePage.tsx:258`), and `rikzapp` is in the reserved list (`migrations/20260923120000_company_slug/migration.sql:26`).

   Two regions on the same domain could hand out the same username or slug. There is no directory service that routes a login or a subdomain to its region.
2. **Platform administration is per deployment:**
   - `PlatformAdmin` (`:251`) with `PlatformRole`, and the two-person `PlatformDecision` (`:221`), live in each deployment's database. There is no federation, so cross-region operations mean separate accounts per region.
   - The sub-processor list `SubProcessor` (`:6049`, `location` `:6054`) is per deployment and framed for PDPL.
3. **Country behaviour is compiled in, not configured.** A non-Saudi deployment would still:
   - run the ZATCA handler for every issued invoice (`outbox.module.ts:46-50`) and load `ZatcaModule` (`app.module.ts:39,167`);
   - schedule jobs on `Asia/Riyadh`;
   - validate Saudi VAT and CR formats;
   - default currencies to SAR and buyers to SA;
   - seed Saudi obligations and the Arabic chart.

   None of this is an env switch today.
4. **API keys carry no region hint.** The format is `mk_<prefix>_<secret>` (`api-keys/api-key-token.util.ts:4,46`), so a single global API host cannot route a key. Each region needs its own API hostname, which `PUBLIC_API_URL` already allows.
5. **Mail domain is shared.** The sender domain `rikzapp.com` with SPF/DKIM/DMARC comes from one provider region (`DEPLOY.md:525-577`; `ops/mail/mail-dns-check.sh`). Several regional senders would need several DKIM selectors and SPF includes on the same domain.
6. **Backup tag is fixed.** `BACKUP_HOST: mad-app-prod` is a literal (`compose:250`). This is harmless while each region has its own restic repository, which residency requires anyway.
7. **Saudi wording in production guards and comments:**
   - `common/config/production-secrets.ts:116` says the GlitchTip server must be "inside the Kingdom".
   - The compose comments at `:109`, `:225-227` and `:246` do the same.

   These are text, but the guard is code.
8. **Tables with no company column:** `LoginIdentity`, `PlatformDecision`, `ReservedSlug`, `SubProcessor*` and `MailSendCount` (`:6114`). They are fine per deployment, but any future **shared** (cross-region) control plane would have to own them.

### e.3 Not measured

- The live servers' configuration and DNS.
- Whether Redis is used by the API. It runs in compose; no import was checked with a validated probe, so no claim is made.
- The applied-migration state on any database.

---

## Summary

**Top 10 outside-module Saudi literals by outside production lines.** P32 (chart codes, not Saudi-specific), P38 (generic day helpers), P10 (noisy Arabic) and P08 (a subset of P06) are excluded from the ranking.

| Rank | Literal (probe) | Outside lines (code/cmt) | Files | Top files |
|---|---|---|---|---|
| 1 | ZATCA name (P06) | 176 (138/38) | 39 | `common/i18n/messages.ts` 39 · `invoices/invoices.service.ts` 18 · web `invoices/InvoiceListView.tsx` 17 · web `api/invoices.ts` 13 · `pos/pos.service.ts` 11 · web `pos/PosPage.tsx` 9 |
| 2 | Saudi / KSA / المملكة (P30) | 36 (9/27) | 25 | `messages.ts` 7 · `create-customer.dto.ts` 3 · `wall-clock.util.ts` 3 |
| 3 | National-address fields (P21) | 32 (28/4) | 8 | web `CompanyProfilePage.tsx` 13 · web `api/companyProfile.ts` 4 · `company-profile.service.ts` 4 |
| 4 | Halala (P16) | 27 (4/23) | 12 | `invoices.service.ts` 4 · `payment-terminal.adapter.ts` 4 · `money/allocation.ts` 4 |
| 5 | `'SA'` code / `'ar-SA'` locale (P31) | 26 (21/5) | 15 | `customers.service.ts` 6 · web `SupportAccessCard.tsx` 3 · web `CustomerModal.tsx` 3 |
| 6 | Implementing-Regulation citations (P34) | 25 (8/17) | 14 | `common/writeoff-reasons.ts` 9 · `auto-posting.util.ts` 2 |
| 7 (tie) | Commercial registration (P19) | 23 (23/0) | 11 | web `CompanyProfilePage.tsx` 8 · 2 each in 5 files |
| 7 (tie) | BR-KSA-14 buyer-ID schemes (P20b) | 23 (23/0) | 5 | `customers.service.ts` 6 · web `CustomerModal.tsx` 5 · web `api/customers.ts` 4 · both customer DTOs 4 |
| 9 | "Riyadh" word (P23) | 22 (2/20) | 12 | `wall-clock.util.ts` 6 · `quote-expiry.util.ts` 3 |
| 10 | Timezone constants (P22) | 21 (19/2) | 10 | `wall-clock.util.ts` 4 · 6 cron services × 2 · web `lib/wallClock.ts` 2 |

**Next by outside lines:**
- Saudi agencies EN (P27): 20
- `ر.س` (P14): 15, all UI
- `STANDARD_VAT_RATE` (P01): 14
- BR-KSA (P12): 14
- SAR (P13): 12
- هيئة الزكاة (P09): 12
- Retention constants (P29): 10
- ZATCA_ (P08): 10

**By code/text lines only**, the order is: ZATCA 138 · national address 28 · CR 23 · buyer-ID schemes 23 · `'SA'`/`'ar-SA'` 21 · timezone 19 · `ر.س` 15 · `STANDARD_VAT_RATE` 14. The chart-code literals (P32) add another 127 code lines outside `default-chart.ts`'s own 20. They are not Saudi-specific, but they are a localization dimension (chart templates).

**Union:** 525 distinct outside lines in 135 files (357 code/text), against 472 inside (Z 357 + V 115). That is 52.7% of production Saudi markers outside the boundary.

**Irreversible items** (class I in §d):
1. Issued e-invoice artifacts on the core `invoices` table: UUID, hash, previous hash (chain), ICV (unique per EGS unit), signed XML, QR, stamps (`schema.prisma:1461-1505,1589`).
2. Issued document numbers, including the `EJ-` contract series (`company-movement.service.ts:66`), and invoice numbers inside the signed XML.
3. Migration history carrying Saudi constraints and defaults: `20260920150000_product_tax_category` (VATEX-SA-OOS CHECKs, `:113-138`), `20260922003000_customer_kind` (BR-KSA-14 CHECK, `:54`), 9 migrations with `DEFAULT 'SAR'`, and 2 with `DEFAULT 15`. The constraints can be superseded; the history cannot.
4. Lost provenance: `country='SA'` and `currency='SAR'` written by default cannot be told apart from declared values. `Company.baseCurrency` has never been written by code.
5. Stored Arabic text in `AuditLog.summary` and `Notification.title/body` (language, not country).
6. Stored retention deadlines of closed companies (`retainUntil`, computed with 10/11 years).
7. Tenant-seeded Saudi content (obligations, Arabic chart, SAR currency row) and filed Saudi VAT returns and corrections.

**Limits of this scan:**
- Counts are matching lines, not occurrences.
- The comment split is a heuristic based on how a line starts.
- The union overlaps probes by design.
- Research claims marked [agent] were not re-fetched by me.
- The other session's in-progress non-deductible-VAT migration is excluded.
- No database or server was queried.

---

## Appendix

### A.1 Probe runner

This is `probe.sh`, as used. It lived in the session scratchpad and is reproduced here in full.

```bash
#!/usr/bin/env bash
# usage: probe.sh ID PATTERN POSFILE POSLINE NEGFILE [extra rg flags...]
set -uo pipefail
export LC_ALL=C.UTF-8
if ! command -v rg >/dev/null 2>&1; then
  _CC="${CLAUDE_CODE_EXECPATH:-}"
  [ -x "$_CC" ] || { echo "no ripgrep available" >&2; exit 8; }
  rg() { ARGV0=rg "$_CC" "$@"; }
fi
OUT=<scratchpad>/probes; mkdir -p "$OUT"
ROOT="${ROOT:-<scratchpad>/snap-40af110}"      # git archive 40af110 | tar -x
cd "$ROOT" || exit 9
ID="$1"; PAT="$2"; POSF="$3"; POSL="$4"; NEGF="$5"; shift 5
FLAGS=("$@")
T=(); for t in apps packages docs docker ops .github .githooks deploy.sh docker-compose.yml docker-compose.prod.yml CLAUDE.md DEPLOY.md README.md SPEC.md .env.production.example; do [ -e "$t" ] && T+=("$t"); done
EXC=(-g '!**/node_modules/**' -g '!**/dist/**' -g '!**/build/**' -g '!**/coverage/**' -g '!**/test-results/**' -g '!**/playwright-report/**' -g '!package-lock.json')
# positive: POSLINE must be among the matched line numbers of POSFILE; the line text is printed ("seen")
PL=$(rg -a -n --no-heading "${FLAGS[@]}" -e "$PAT" -- "$POSF" | cut -d: -f1 | tr '\n' ' ')
# negative: NEGFILE must return 0
NC=$(rg -a -c "${FLAGS[@]}" -e "$PAT" -- "$NEGF"); NC=${NC:-0}
# scan: per-file matching-line counts, classified by path into PROD_Z / PROD_V / PROD_OUT / SCHEMA / MIG / TEST / DOC / OTHER
rg -a --hidden -c --no-messages "${FLAGS[@]}" "${EXC[@]}" -e "$PAT" -- "${T[@]}" | tr '\134' '/' | awk '
{ n=$0; sub(/^.*:/,"",n); p=$0; sub(/:[0-9]+$/,"",p); g="OTHER"; lp=tolower(p);
  if (p ~ /\.md$/) g="DOC";
  else if (p ~ /\.(spec|test)\.tsx?$/ || p ~ /\.e2e-spec\.ts$/ || p ~ /^apps\/api\/test\// || p ~ /^apps\/web\/e2e\// || p ~ /^apps\/web\/src\/test\//) g="TEST";
  else if (p=="apps/api/prisma/schema.prisma") g="SCHEMA";
  else if (p ~ /^apps\/api\/prisma\/migrations\//) g="MIG";
  else if (p ~ /^apps\/api\/src\// || p ~ /^apps\/web\/src\// || p ~ /^packages\/shared\/src\//) {
    if (lp ~ /zatca/) g="PROD_Z";
    else if (p ~ /^apps\/api\/src\/common\/vat\// || p ~ /^apps\/api\/src\/obligations\// || p=="apps/web/src/api/obligations.ts" || p=="apps/web/src/components/LineTaxPicker.tsx" || p=="apps/web/src/lib/vat.ts" || p ~ /^apps\/web\/src\/pages\/obligations\//) g="PROD_V";
    else g="PROD_OUT"; }
  printf "%s\t%s\t%s\n", g, n, p }' > "$OUT/$ID.tsv"
# then: group sums, and for PROD_OUT files a second rg -n pass classifying each matched line as comment
# (text starts with // /* * {/*) or code/text.
```

### A.2 Union patterns (`pats-union.txt`, one regex per line, used with `rg -a -f`)

```
STANDARD_VAT_RATE
\b15\s*(%|٪)|(%|٪)\s*15\b|١٥\s*٪
\b1\.15\b|\b15\s*(/|÷)\s*115\b
(?i:zatca)
(?i:fatoora)
هيئة الزكاة
\bbox[0-9]+\b
VATEX-SA
BR-KSA
\bSAR\b
ر\.س
ريال
هللة|(?i:halala)
3\\d\{13\}3
\\d\{10\}
(?i:crNumber|commercial.?regist|\bcr_number\b)|السجل التجاري
(?i:iqama|national.?id)|\bIQA\b|\bNAT\b|الهوية الوطنية|رقم الهوية
BUYER_ID_SCHEMES|otherIdScheme
additionalNumber|buildingNumber|العنوان الوطني
Asia/Riyadh|KSA_UTC_OFFSET_MIN|SCHEDULE_TIME_ZONE|\+03:00|(?i:UTC\+3|GMT\+3)\b
(?i:riyadh)|الرياض
\+966|\b966[0-9]|\b05[0-9]{8}\b|\+9665
(?i:\bgosi\b|\bmudad\b|\bejar\b|\bsama\b|nafath|shomoos|shumoos|wathq|balady|\bqiwa\b|absher|muqeem|nphies|wasfaty|\bsfda\b|\bsaso\b|\bmaroof\b|\bsdaia\b|\bmisa\b|\bmhrsd\b|\bsccc\b|\bndmo\b)
منصة إيجار|منصّة إيجار|شموس|واثق|ساما|مُدد|التأمينات الاجتماعية|أبشر|البنك المركزي|سدايا|وصفتي|نفيس|وزارة التجارة|وزارة الموارد البشرية
RETENTION_YEARS|retentionDeadline
(?i:\bsaudi\b|\bksa\b)|السعودية|السعودي|المملكة
["'`]SA["'`]|\bar-SA\b|\ben-SA\b|>SA<
اللائحة
\bEJ-|['"]EJ['"]
RESIDENTIAL
```

**Union validation:** all 30 positive lines of §b.1 printed `MATCH`, and `apps/api/src/auth/auth.service.ts` returned 0.

### A.3 Research sources (keys used in §a)

[verified] = re-fetched by me on 2026-09-23. Everything else was fetched by the research sub-agent.

**Odoo**
- O1 https://www.odoo.com/documentation/17.0/applications/finance/fiscal_localizations.html
- O2 https://www.odoo.com/documentation/18.0/applications/finance/fiscal_localizations.html [verified]
- O3 https://www.odoo.com/documentation/18.0/developer/howtos/accounting_localization.html
- O4 https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_sa/__manifest__.py [verified]
- O5 https://github.com/odoo/odoo/tree/18.0/addons/l10n_sa/data/template
- O6 https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_sa/models/template_sa.py
- O7 https://github.com/odoo/odoo/blob/18.0/addons/l10n_sa/models/account_move.py
- O8 https://github.com/odoo/odoo/blob/18.0/addons/l10n_sa_edi/__manifest__.py
- O9a https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_sa_edi/models/res_partner.py [verified]
- O9b https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_sa_edi/models/account_journal.py
- O9c https://github.com/odoo/odoo/blob/18.0/addons/l10n_sa_edi/models/account_tax.py
- O10 https://www.odoo.com/documentation/18.0/applications/finance/fiscal_localizations/saudi_arabia.html
- O11 https://www.odoo.com/documentation/19.0/applications/finance/fiscal_localizations/saudi_arabia.html
- O12 https://github.com/odoo/odoo/blob/18.0/addons/account/models/company.py
- O13 https://github.com/odoo/odoo/blob/18.0/addons/account/models/account_tax.py
- O14 https://www.odoo.com/documentation/18.0/developer/reference/standard_modules/account/account_fiscal_position.html
- O15 https://raw.githubusercontent.com/odoo/odoo/18.0/odoo/addons/base/models/res_country.py
- O16 https://raw.githubusercontent.com/odoo/odoo/18.0/odoo/addons/base/models/res_currency.py
- O17 https://raw.githubusercontent.com/odoo/odoo/18.0/addons/base_vat/__manifest__.py
- O18 https://raw.githubusercontent.com/odoo/odoo/18.0/addons/base_iban/__manifest__.py
- O19 https://www.odoo.com/documentation/19.0/applications/finance/accounting/payments/sepa_payments.html
- O20 https://www.odoo.com/documentation/18.0/applications/finance/accounting/bank/transactions.html
- O21 https://www.odoo.com/documentation/19.0/applications/hr/payroll/payroll_localizations.html
- O22 https://www.odoo.com/documentation/19.0/applications/hr/payroll/payroll_localizations/saudi_arabia.html
- O23 https://www.odoo.com/cloud-sla
- O24 https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_gcc_invoice/__manifest__.py
- O25 https://github.com/odoo/odoo/blob/18.0/addons/l10n_sa_pos/__manifest__.py
- O26 https://github.com/odoo/odoo/tree/18.0/addons/l10n_sa

**ERPNext / Frappe**
- E1 https://github.com/frappe/erpnext/tree/develop/erpnext/regional
- E2 https://raw.githubusercontent.com/frappe/erpnext/develop/erpnext/regional/united_arab_emirates/setup.py
- E3 https://github.com/frappe/erpnext/blob/develop/erpnext/hooks.py
- E4 https://github.com/frappe/erpnext/blob/develop/erpnext/__init__.py
- E5 https://raw.githubusercontent.com/frappe/erpnext/develop/erpnext/setup/doctype/company/company.py
- E6 https://github.com/frappe/erpnext/wiki/Migration-Guide-to-ERPNext-version-15
- E7 https://cloud.frappe.io/marketplace/apps/ksa
- E8 https://github.com/resilient-tech/india-compliance
- E9 https://docs.indiacompliance.app/docs/developer-guide/migrating-from-v13
- E10 https://github.com/ERPGulf/zatca_erpgulf
- E11 https://frappe.io/erpnext/saudiarabia
- E12 https://docs.frappe.io/erpnext/regional
- E13 https://docs.frappe.io/erpnext/regional/regional-chart-of-accounts
- E14 https://docs.frappe.io/erpnext/country
- E15 https://discuss.frappe.io/t/erpnext-localization-modules-must-support-multi-country-compliance/148536

**Microsoft Dynamics 365 Finance**
- M1 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/global/globalization-studio-overview
- M2 https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/analytics/general-electronic-reporting
- M3 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/global/global-tax-calcuation-service-overview
- M4 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/global/gs-e-invoicing-service-overview
- M5 https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/lcs-solutions/apply-country-context
- M6 https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/fin-ops/lcs/globalization-resources
- M7 https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/lcs-solutions/separate-localization-models
- M8 https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/lcs-solutions/classify-localization-features
- M9 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/mea/saudi-arabia
- M10 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/mea/emea-sau-e-invoices
- M11 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/mea/gs-e-invoicing-sa-get-started
- M12 https://learn.microsoft.com/en-us/dynamics365/finance/localizations/apac/apac-sau-sales-tax
- M13 https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/deployment/deployment-options-geo

**SAP**
- S1 https://pages.community.sap.com/topics/localization-s4hana-cloud/faq
- S2 https://pages.community.sap.com/topics/localization-s4hana-cloud
- S3 https://pages.community.sap.com/topics/document-reporting-compliance
- S4 (snippet titles only) https://userapps.support.sap.com/sap/support/knowledge/en/3108760
- help.sap.com, sap.com product pages and SAP KB articles failed to load (script shell, 403 or login) according to the agent.

**Zoho Books**
- Z1 https://www.zoho.com/us/books/help/settings/organization-profile.html [verified]
- Z2 https://www.zoho.com/us/books/kb/general/different-country-edition.html
- Z3 https://www.zoho.com/us/books/kb/general/change-country.html
- Z4 https://www.zoho.com/us/books/kb/general/change-edition.html
- Z5 https://www.zoho.com/sa/books/
- Z6 https://www.zoho.com/sa/books/help/e-invoicing/
- Z7 https://www.zoho.com/blog/en-mea/general/zoho-ksa-nca-compliance.html

**Xero**
- X1 (snippet) https://central.xero.com/0/article/Add-another-organisation-to-Xero?userregion=true
- X2 (snippet) https://central.xero.com/0/article/How-GST-works-in-Xero
- X3 https://github.com/XeroAPI/xero-node/blob/master/src/gen/model/accounting/organisation.ts
- X4 https://www.xero.com/us/data/xero-and-gdpr/
- X5 https://www.xero.com/us/media-releases/xero-introduces-payroll-powered-by-gusto/
- X6 (snippet) https://www.xero.com/au/accounting-software/payroll/

**QuickBooks Online**
- Q1 https://quickbooks.intuit.com/learn-support/global/manage-your-account/how-to-change-the-country-of-your-quickbooks-online-account/00/1512620 [verified]
- Q2 https://quickbooks.intuit.com/learn-support/en-uk/other-questions/can-i-change-my-business-from-uk-to-usa-on-qb/00/1369765
- Q3 https://quickbooks.intuit.com/learn-support/en-global/help-article/sales-taxes/set-sales-gst-vat-rates-use-forms-international/L3dspNwj1_ROW_en
- Q4 https://quickbooks.intuit.com/choose-country/
- Q5 https://quickbooks.intuit.com/learn-support/en-us/help-article/banking/privacy-security-quickbooks/L7q2gUqfM_US_en_US
- Q6 (snippet) https://quickbooks.intuit.com/learn-support/en-uk/help-article/electronic-filing/submit-mtd-vat-return-hmrc-quickbooks-online/L9LIONiVr_GB_en_GB
