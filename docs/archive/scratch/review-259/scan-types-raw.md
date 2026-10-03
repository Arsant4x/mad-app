# review-259 · Which server↔web types are generated and which are written by hand — raw measurements

**Owner's question.** Repository structure: what is generated and what is written by hand?
(a) Which of the types exchanged between the server and the web app are written twice — by count.
(b) Which of them can be generated from the API's OpenAPI document, now that it carries the body shapes.
(c) What breaks if they are generated.

**Scan:** measurement only, 2026-09-23 23:00 → 2026-09-24 00:15 (+03:00). Nothing under `D:\mad-app` was modified (evidence in §0.3).
Every count below names the command/pattern that produced it; probes are validated in §10; my own probe errors that were caught and corrected are listed in §11.

---

## Answer in brief

| | count | from the OpenAPI document today |
|---|---|---|
| Named web types that describe an exchanged shape | **319** (306 exported in `apps/web/src/api` + 13 more reachable from a call: 2 non-exported in `src/api`, 11 in `auth/` and `lib/`) | — |
| …of which restate a server-side definition (**written twice**) | **317** | **109** (35 enums as inline value sets · 66 request bodies · 8 query-parameter types) |
| — enums (literal sets) | 75 (49 mirror a Prisma enum) | 35, and **none by name** (0 named enum schemas) |
| — request bodies (DTO mirrors) | 66 | 66 |
| — query-parameter types | 8 | 8 (flattened into operation parameters) |
| — response shapes | 167 | **0** (0 of 358 operations has a response schema with fields) |
| — nested request+response | 1 (`SubProcessorEntry`) | 0 |
| Not written twice | 2 (`MoneyText`, `PercentText` — web encoding aliases) | — |
| Already generated (the one precedent) | `packages/shared/src/permissions.ts` (168 permission keys) | not from OpenAPI — from `screens.ts` |

Plus unnamed hand-written request shapes at call sites: 18 derived `Partial<>/Omit<>` bodies (+3 intersections), 16 inline type-literal bodies, 53 untyped object-literal bodies.

---

## 0. Pin, sources, and proof that nothing was written

### 0.1 The working tree changed under the scan — every figure is pinned to a commit

At start: branch `feat/inventory-ledger-reconciliation`, HEAD `40af11075da7860024f5523aa590985bce3006a9`, `git status --porcelain` → 0 lines.
During the scan another session switched this same working tree to `feat/non-deductible-vat`, edited `apps/api/prisma/schema.prisma` (+2 enums, +2 models), `messages.ts` and 7 API files, added migration `20260924120000_non_deductible_vat` and `purchases/non-deductible-vat.util.ts`, and later committed (HEAD `37266511a2e7…` at 2026-09-24 00:07). Observed directly: `grep -cE '^enum [A-Za-z]' prisma/schema.prisma` returned **66** and, minutes later on the same file, **68**.

⟹ All source measurements are taken from the committed tree **`40af110`**, extracted from git objects (read-only) into the scratchpad:
`git archive --format=tar 40af110… apps/web/src apps/web/package.json … apps/api/src apps/api/test apps/api/prisma/schema.prisma apps/api/nest-cli.json … packages docs/openapi.snapshot.json .github | tar -x -C <scratchpad>/pin` → 1,058 files. At the pin: 66 enums, 105 models.

### 0.2 Sources of truth used

| what | how obtained | notes |
|---|---|---|
| Web and server source | AST (TypeScript parser, `ts.createSourceFile`, no program) over the pinned tree | |
| **The OpenAPI document** | Loaded the **existing** `apps/api/dist` in memory (no build) exactly as `scripts/openapi-snapshot.ts` does, minus `nest build`: `Test.createTestingModule({imports:[AppModule]}).compile()` → `createNestApplication()` → `applyApiVersioning` → `buildOpenApiDocument` → JSON written to the scratchpad | `dist` was built 2026-09-23 08:41:56; by mtime 9 controllers and 10 DTO files in `src` are newer. **Its operation contract equals the committed `docs/openapi.snapshot.json` for all 716 operations (0 differences).** HEAD has 5 routes it lacks (§5.1). No database, no `init()`, no listener. |
| Server response shapes | In-memory TypeScript program over the **pinned** controllers (`ts.createProgram`, `noEmit`, `incremental:false`, no `emit()`), bare imports resolved to `D:\mad-app\node_modules`; `checker.getReturnTypeOfSignature` + `getAwaitedType` per route method | 56 root files → 1,972 program files; 363 route methods; 0 failures; 0 resolved to `any`; ~90–160 s, ≈800 MB heap |

### 0.3 Nothing written under `D:\mad-app`

* Before loading `dist`: `git status --porcelain` → 0; `find apps/api/dist -type f -printf '%T@ %p\n' | sort | md5sum` → `6f6ff4b5a92988e0074aa49cf4307e32` (1,397 files). After: identical hash, 1,397 files, no repo file newer than 5 minutes.
* At the end the `dist` hash differs: **exactly one file** changed, `apps/api/dist/tsconfig.tsbuildinfo`, at 23:28:41. Its content mentions `non-deductible-vat` (the other session's uncommitted file) 1×, and mentions neither my scratchpad path nor `AppData` (0×). My pinned copy contains 0 `.tsbuildinfo` files. ⟹ written by a `tsc -p tsconfig.json` over the live tree (the other session), not by this scan.
* The only file written outside the scratchpad is this report.
* Pre-load side-effect probe on `dist/src`: `grep -rlE 'writeFileSync|createWriteStream|mkdirSync|appendFileSync'` → 0 files; `setInterval(` → 0; `require("ioredis|bullmq|bull|amqplib|pg|redis")` → 0 (probe validation in §10).

### 0.4 Scratchpad artifacts (session scratchpad, may be cleaned)

`C:\Users\mnqad\AppData\Local\Temp\claude\D--mad-app\e226e196-3c27-44af-a820-03530ffbef49\scratchpad\`: `pin/` (pinned tree) · `dump-openapi.cjs` → `openapi-stale-dist.json` (559,414 bytes) · `analyze-openapi.cjs` · `web-inventory.cjs` · `web-all.cjs` · `server-inventory.cjs` · `routes-vs-doc.cjs` · `match2.cjs` · `server-return-types.cjs` → `server-return-types.json` · `resp-compare.cjs` · `paged-include.cjs` · `record-maps.cjs` · `body-coverage.cjs` · `final-classify.cjs` → `final.json` · `make-table.cjs` → `table.md` (Appendix A).

---

## 1. Inventory — the web app's hand-written API types

### 1.1 Counts

| measure | count | command / pattern |
|---|---|---|
| Files in `apps/web/src/api/` | **53** | `ls apps/web/src/api \| wc -l`; AST scanner saw the same 53 |
| Exported type declarations | **306** = 224 `interface` + 82 `type` | line probe `grep -cE '^export (declare )?(interface\|type\|enum\|const enum) [A-Za-z_]'` per file, summed = **306**; AST (`web-inventory.cjs`) = **306** (224/82); split by grep: `^export (declare )?interface ` → 224, `^export (declare )?type [A-Za-z_]` → 82 |
| TypeScript `enum` declarations | **0** | both probes |
| Shapes (AST) | 224 object interfaces · 63 string-literal unions · 5 `(typeof ARR)[number]` unions · 8 derived (`Partial<>`, `Exclude<>`…) · 3 unions of objects · 2 intersections · 1 other | `web-inventory.cjs` |
| Literal sets after expanding composites | 72 in `src/api` (63 + 5 + 4: `DeclaredClassification`, `DeclaredVatInclusion`, `NewCustomerKind` = `Exclude<…>`; `DerivedQuoteStatus` = `QuoteStatus \| 'EXPIRED'`) | `web-all.cjs` post-pass (5 expansions incl. `lib/vat.ts:23 TaxCategory`) |
| Non-exported types in `src/api` | 2 — `client.ts:49 RefreshResult`, `files.ts:10 DownloadUrlResult` | AST |
| Exported runtime enum mirrors (`as const` arrays) | 5 — `activities.ts:4 SECTORS`, `customers.ts:18 BUYER_ID_SCHEMES`, `customers.ts:85 MARKETING_CHANNELS`, `customers.ts:88 CONSENT_SOURCES`, `platformDecisions.ts:7 PLATFORM_DECISION_ACTIONS` | AST |
| Exported `Record<…>` label maps in `src/api` | 8 | AST |
| Inline anonymous type literals at `src/api` call signatures (parameter types or response generics) | 40 | AST |

### 1.2 Per file (`apps/web/src/api/`, pinned `40af110`)

| file | exported | interface | type alias |
|---|---|---|---|
| contracts.ts | 47 | 26 | 21 |
| reports.ts | 21 | 21 | 0 |
| banks.ts | 15 | 13 | 2 |
| customers.ts | 11 | 5 | 6 |
| invoices.ts | 11 | 7 | 4 |
| deletionRequests.ts | 9 | 6 | 3 |
| inventory.ts | 9 | 7 | 2 |
| pos.ts | 9 | 6 | 3 |
| purchases.ts | 9 | 6 | 3 |
| tasks.ts | 8 | 5 | 3 |
| obligations.ts | 7 | 5 | 2 |
| payments.ts | 7 | 5 | 2 |
| journal.ts | 6 | 6 | 0 |
| leaves.ts | 6 | 5 | 1 |
| quotes.ts | 6 | 4 | 2 |
| supplierPayments.ts | 6 | 5 | 1 |
| branches.ts | 5 | 5 | 0 |
| consent.ts | 5 | 5 | 0 |
| maintenance.ts | 5 | 3 | 2 |
| notifications.ts | 5 | 4 | 1 |
| reminders.ts | 5 | 4 | 1 |
| accounts.ts | 4 | 2 | 2 |
| activities.ts | 4 | 3 | 1 |
| client.ts | 4 | 1 | 3 |
| currencies.ts | 4 | 4 | 0 |
| delegations.ts | 4 | 4 | 0 |
| fiscal.ts | 4 | 3 | 1 |
| properties.ts | 4 | 2 | 2 |
| warranties.ts | 4 | 3 | 1 |
| zatca.ts | 4 | 3 | 1 |
| apiKeys.ts | 3 | 3 | 0 |
| attendance.ts | 3 | 2 | 1 |
| cashDrawers.ts | 3 | 3 | 0 |
| companies.ts | 3 | 2 | 1 |
| companyUsers.ts | 3 | 2 | 1 |
| employees.ts | 3 | 2 | 1 |
| platformDecisions.ts | 3 | 1 | 2 |
| reservations.ts | 3 | 2 | 1 |
| scripts.ts | 3 | 2 | 1 |
| suppliers.ts | 3 | 3 | 0 |
| supportAccess.ts | 3 | 2 | 1 |
| templates.ts | 3 | 2 | 1 |
| transactions.ts | 3 | 3 | 0 |
| trash.ts | 3 | 3 | 0 |
| units.ts | 3 | 2 | 1 |
| audit.ts | 2 | 2 | 0 |
| companyProfile.ts | 2 | 2 | 0 |
| integrations.ts | 2 | 1 | 1 |
| products.ts | 2 | 2 | 0 |
| warehouses.ts | 2 | 2 | 0 |
| files.ts | 1 | 1 | 0 |
| mfa.ts | 1 | 1 | 0 |
| subscription.ts | 1 | 1 | 0 |
| **total (53 files)** | **306** | **224** | **82** |

### 1.3 Server shapes declared outside `src/api`

No `apps/web/src/types` directory exists. AST over the 195 non-test files of `apps/web/src`: 356 type declarations in all; 308 in `api/` (306 exported), 48 elsewhere (auth 9 · components 3 · layout 2 · lib 17 · pages 17).
Reachable from a client call (by transitive closure from response generics and body types): **13** = 2 non-exported in `api/` + **11 elsewhere**:
`auth/AuthContext.tsx:4 LoginResponse` · `auth/PermissionsContext.tsx:38 Grant`, `:40 ExtinctionReason`, `:43 ExtinguishedGrant`, `:51 ChainView`, `:55 TreeNode`, `:62 MePermissions` · `lib/money.ts:41 MoneyText`, `:44 PercentText` · `lib/vat.ts:22 DeclarableTaxCategory`, `:23 TaxCategory`.
The remaining 37 outside declarations are UI-local (props, form drafts, sort keys, `View`, `Mode`, `DashRange`…).

### 1.4 Client calls (AST, all non-test web source)

* **327** calls on `apiClient`/`refreshClient` (320 in `src/api`, 7 elsewhere: login/register/logout in `auth/AuthContext.tsx:59,64,69`, `auth/PermissionsContext.tsx:115 GET /me/permissions`, `pages/developer/PlatformRoleGate.tsx:27 GET /auth/me`, `pages/LoginPage.tsx:52`, `pages/ResetPasswordPage.tsx:21`).
* By method: GET 118 (115 with a response type argument) · POST 129 (119 typed) · PATCH 48 (48 typed) · DELETE 32 (1 typed).
* Mapped to a server route: **325 / 327**; not mappable: `platformDecisions.ts:33` (URL built with a ternary) and `reports.ts:310` (URL is a variable).
* The 177 write calls, by how the body is typed on the web: named web type 57 · derived `Partial<>/Omit<>` 21 (18 evaluated + 3 intersections `Partial<X> & {…}` at `companyUsers.ts:32`, `consent.ts:52`, `quotes.ts:65`) · inline type literal 16 · **untyped object literal 53** · no body 25 · untyped identifier (`FormData`) 5. 176 routed; 147 hit a route with a server `@Body` DTO.
* 46 calls pass query `params`.

---

## 2. Server side (pinned)

| measure | count | how |
|---|---|---|
| Prisma enums / models | 66 / 105 | `grep -c '^enum '`, `grep -c '^model '`; parser names identical |
| Non-spec `.ts` files in `apps/api/src` | 465 | AST walk |
| Classes named `*Dto` | 184 = 178 in `*.dto.ts` + **6 declared inside controller files** (`common/mfa/mfa.controller.ts:8 MfaCodeDto`, `integrations/integrations.controller.ts:13 CreateIntegrationDto`, `:29 SetEnabledDto`, `platform/platform-decisions.controller.ts:11 RequestDecisionDto`, `:26 DecideDto`, `support-access/support-access.controller.ts:17 RequestSupportAccessDto`) | AST; `grep -hcE '^export class ' $(find src -name '*.dto.ts')` summed = 178 |
| Interface/type-alias declarations (non-spec) | 296 (249 exported) | AST |
| `as const`/literal arrays | 81 (27 exported) | AST |
| Controllers | 61 classes in 56 files · **363 route methods** · 156 with `@Body` · 78 with `@Query` · **8 with an explicit return type** (7 in `AuthController`, `PermissionsController.permissionsForMe`) | AST |
| Inferred response types (type-check) | 363: 323 with fields (42 `ListResult<T>` = `T[] \| Paged<T>`, 13 plain arrays, 7 unions of objects), 40 `void`; 109 routes carry ≥1 top-level `Decimal` field, 234 carry ≥1 `Date` field | `server-return-types.cjs` |
| `pagedFindMany(...)` call sites | 30, of which **12 pass `include`** | AST (`paged-include.cjs`) |
| Hand-written Swagger decorators in use | **0** (`@ApiProperty`, `@ApiResponse`, `@ApiOkResponse`, `@ApiBody`, …; the single textual hit is the docstring at `common/openapi-contract.util.ts:19`) | grep, §10 |

---

## 3. (a) Written twice — totals

A web type is "written twice" when it restates, by hand, a shape or value set that the server also defines — explicitly (Prisma enum/model, DTO class, exported TS type, `as const` array, `@IsIn` literal) or implicitly (the TypeScript-inferred return type of the route the web calls).

### 3.1 By kind (319 named types)

| kind | written twice | server side of the pair |
|---|---|---|
| Enum (literal set) | **75** (72 in `src/api` + `ExtinctionReason`, `DeclarableTaxCategory`, `TaxCategory`) | Prisma enum **49** · server `as const` array 16 (13 exported, 3 not) · server literal-union type 5 · server inline union 1 · DTO `@IsIn` literal 4 |
| Response shape | **167** | explicit exported server type 29 · Prisma model of the same name 57 · **inferred only (no named server type) 81** |
| Request body (DTO mirror) | **66** (one, `ReminderPolicy`, is also a response) | a DTO class — 66/66 |
| Query-parameter type | **8** | a `@Query` DTO class |
| Nested request+response | **1** (`consent.ts:4 SubProcessorEntry`) | `UpsertSubProcessorDto` fields; on responses the server type is Prisma `JsonValue` |
| Not written twice | 2 (`MoneyText`, `PercentText`) | none (web encoding aliases for serialized Decimal) |

**Total written twice: 317 of 319.** Every one of the 306 exported types in `apps/web/src/api` has a server counterpart.

### 3.2 Enums specifically (75)

* Values identical to the chosen server counterpart: **75 / 75** (`DerivedQuoteStatus` matches the server's same-name composite `quotes.service.ts:64`; `ActorType` matches the inline union `AuthUserView.actorType` at `auth/auth.service.ts:19` — the Prisma enum `ActorType` (`schema.prisma:40`) is wider by `INTEGRATION` by design).
* Role: 35 appear only in responses · 34 in both · 5 only in requests · 1 in neither (`NewCustomerKind`, form-only).
* Name differs from the server counterpart: **24** — 3 against a Prisma enum name (`CompanyStatus→AccountStatus`, `ZatcaInvoiceStatus→ZatcaStatus`, `LeaveStatus→LeaveRequestStatus`); 21 whose server source has **no type name at all** (16 `as const` arrays, 4 `@IsIn` literals, 1 inline union).
* **Field-level drift — the web enum is narrower than the Prisma column it types (the `PARTIAL` incident class):** 3
  * `companyUsers.ts:4 CompanyUserStatus` (3 values) types `CompanyUser.status`; the column is Prisma `AccountStatus`, which also has `CLOSED` (3 routes).
  * `contracts.ts:17 PaymentMethod` (`CASH|BANK`) types `RentPayment.method`; the column is Prisma `PaymentMethod`, which also has `CARD` (16 route contexts).
  * `supplierPayments.ts:6 SupplierPaymentMethod` (`CASH|BANK`) types `SupplierPayment.method`; Prisma `PaymentMethod` also has `CARD` (4 routes).
* The name `PaymentMethod` is declared twice on the web with different sets: `contracts.ts:17` (2 values) and `payments.ts:6` (3 values).

### 3.3 Request bodies vs response shapes

* Request DTO mirrors **66**, query-parameter types **8**, response shapes **167**.
* Request mirrors: 0 / 66 share the DTO's name (`XInput` vs `CreateXDto`/`UpdateXDto`); 17 feed two DTOs (create + update, the update usually through a derived `Partial<>`/`Omit<>` body).

---

## 4. Existing generation and sharing precedents

### 4.1 `packages/shared` — one generated artifact, with a redraw guard

* `packages/shared/src/permissions.ts` (214 lines, header `// ⛔ مولَّدٌ — لا يُحرَّر بيد.`): `ALLOWED_SCREENS` (24), `SCREEN_ACTIONS` (7), `PERMISSION_KEYS` (168) and their types, **generated from** `apps/api/src/templates/screens.ts` by `apps/api/scripts/generate-shared-permissions.ts` (via `renderSharedPermissions()` in `apps/api/src/templates/shared-permissions.util.ts`).
* Guard `apps/api/src/templates/shared-permissions-generated.spec.ts` (runs in `api-unit`): reads the file (CRLF normalised), checks it is non-trivial (> 1000 chars), counts `^  '[a-z]+:[a-z]+',$` lines = 24 × 7 = 168, checks each screen and action is present, then **compares the file character-for-character with a fresh render** and fails with the regenerate command; also checks the generated header.
* Consumer: only `apps/web/src/api/templates.ts:1` imports `@mad-app/shared/permissions`. `apps/web/package.json` does not declare `@mad-app/shared`; it resolves through npm workspaces (`package-lock.json` has `node_modules/@mad-app/shared`).
* `packages/shared/src/index.ts` re-exports only `./permissions`. CLAUDE.md §4 lists "generate enums from Prisma into `packages/shared`" as a still-open candidate.

### 4.2 The OpenAPI document: how it is produced, what it carries, where it lives

* Produced by `apps/api/src/common/openapi-document.ts` (`DocumentBuilder` + `SwaggerModule.createDocument`) — one function used by `main.ts`, the contract guard and the snapshot script.
* Field shapes come from the **Nest Swagger CLI plugin**, configured in `apps/api/nest-cli.json`: `{"name":"@nestjs/swagger","options":{"classValidatorShim":true,"introspectComments":false,"dtoFileNameSuffix":[".dto.ts"]}}`. The plugin runs only under `nest build` (stated in `openapi-contract.spec.ts:8-15` and `scripts/openapi-snapshot.ts:10-17`); there are no hand-written Swagger decorators.
* What the plugin emitted in the existing `dist`: `_OPENAPI_METADATA_FACTORY` in 117 compiled files (117 `.dto.js` vs 119 `.dto.ts` in `src`); **358** `openapi.ApiResponse(...)` decorators on controller methods — **224 with no type, 131 `type: Object`, 3 `type: [Object]`, 0 with a class**. Probe: `grep -rhoE "openapi\.ApiResponse\(\{[^}]*\}\)" --include=*.js dist/src`.
* Why responses are empty: `@nestjs/swagger@7.4.2` `dist/plugin/utils/plugin-utils.js:66-78` maps `any`/`unknown`/`object`, **interfaces**, unions/intersections and aliased types to `Object` and enums to nothing; only a **class** return type yields a schema. 355 of 363 route methods have no return annotation and return inferred Prisma payloads or object literals.
* Where it lives: served at `/docs` only when not in production or when `ENABLE_API_DOCS=true` (`apps/api/src/main.ts:74-80`); otherwise built **only in memory** by `apps/api/scripts/openapi-snapshot.ts` after `nest build` (`npm run openapi:check` / `openapi:snapshot`). CI: job `api-unit`, step `npm run openapi:check` at `.github/workflows/web-tests-light.yml:237`. **The full document is not written to disk anywhere.**
* `docs/openapi.snapshot.json` (127,375 bytes) is a **contract summary, not a document**: 716 operations × `{parameters (in:name[:required]), requiredBody (names only), responses (status codes only)}`; 200 operations (100 per mirror) carry non-empty `requiredBody`, 448 field entries in all. No schemas, no types, no enums.

### 4.3 The contract guard `apps/api/src/common/openapi-contract.spec.ts` (read in full, 76 lines)

* Pure: it no longer builds the app; it tests `contractOf` / `contractBreaks` from `openapi-contract.util.ts` on a hand-made document (2 tests): extraction reads parameters with their required flag, response codes, and required body fields through `$ref`, sorted; comparison is **one-directional** — a removed operation, removed parameter, removed response code, a field that became required, or a parameter that became required fails; additions pass.
* The real comparison against the built document runs in `scripts/openapi-snapshot.ts` (`--check`), which refuses to proceed below 200 operations.
* It guards the **contract surface only** — field types, response bodies and enum values are outside what it compares.

### 4.4 A stale statement in the util's docstring

`apps/api/src/common/openapi-contract.util.ts:19-21` says there is no `@ApiProperty` in the repo **and no `@nestjs/swagger` plugin in `nest-cli.json`, so body shapes are not described and `requiredBody` stays empty**. Measured: the plugin **is** configured, and the snapshot has 200 operations with non-empty `requiredBody` (448 entries). (The "0 `@ApiProperty`" half is still true.)

### 4.5 Other scripts

`apps/api/scripts/`: `generate-shared-permissions.ts` and `openapi-snapshot.ts` are the only generators; `spec-status.ts` derives `docs/SPEC-status.md` (not types). `prisma generate` (`prisma-client-js`) produces server-only types. **No type generator package is installed**: 0 of `openapi-typescript`, `orval`, `@openapitools/openapi-generator-cli`, `swagger-typescript-api`, `openapi-fetch`, `@hey-api/openapi-ts`, `prisma-json-types-generator`, `zod-prisma-types`, `prisma-generator-typescript-interfaces` in `package-lock.json` (positive control `"node_modules/@nestjs/swagger"` → 1).

---

## 5. (b) What can be generated from the OpenAPI document today

### 5.1 What the document carries (measured on the in-memory document)

| | measured |
|---|---|
| Paths / operations | 550 / **716** = 358 under `/v1` + 358 unversioned mirrors (`applyApiVersioning`: `defaultVersion: ['1', VERSION_NEUTRAL]`) |
| `operationId` | 716 present, **358 unique** — every id appears twice (e.g. `AuthController_login` ×2) |
| Component schemas | 155, all named `*Dto`; 763 properties; 122 `number`; **0 `date-time`**; 70 properties with an **inline** `enum`; **0 standalone enum schemas**; 0 `enumName`/`x-enum*`; 0 property descriptions; 0 Arabic characters |
| Empty schemas | 6 — exactly the 6 DTO classes declared in controller files (outside the plugin's `.dto.ts` suffix) |
| Request bodies (v1) | 152 operations, all `$ref`; 8 point at an empty schema; 186 POST/PUT/PATCH, 34 of them without a body |
| `@Body` coverage | 152 / 156 source `@Body` routes; missing: `POST /contracts/handovers/{handoverId}/photos` (multipart, keyed `@Body('itemId')`/`@Body('note')`) and 3 routes added after the build (`POST /obligations/vat-ratio`, `/vat-ratio/settle`, `/vat-declaration/corrections`) |
| **Responses (v1)** | 224 entries with no schema · 131 `{"type":"object"}` · 3 `{"type":"array","items":{"type":"object"}}` · **0 with properties or `$ref`**; 716 response descriptions, all empty |
| Query parameters | `@Query` DTOs are flattened into operation parameters (e.g. `GET /v1/reports/ledger`: from,to,branchId,accountId,propertyId,unitId) |
| Freshness | contract identical to the committed snapshot (716/716); HEAD has 363 routes, the document 358 — missing `GET/POST /obligations/vat-ratio`, `POST /obligations/vat-ratio/settle`, `POST/DELETE /obligations/vat-declaration/corrections[/{id}]` (the snapshot check fails only on removals, so additions never refresh it) |

### 5.2 Per category

| category | written twice | derivable from the document today | how |
|---|---|---|---|
| Request bodies | 66 | **66** | each paired DTO has a component schema with ≥1 property (nested line DTOs such as `InvoiceLineDto` included via `$ref`) |
| Query-parameter types | 8 | **8** | as operation parameters; for the 7 named types checked, parameter names equal the document's exactly (12 call sites: `ListContractsParams`, `ListStockMovementsParams`, `ListJournalParams`, `ReportRange` ×3, `AgingParams` ×2, `LedgerParams`, `StatementParams`); `AuditFilters` matched by reading `ListAuditQueryDto` |
| Enums | 75 | **35** as values only | the identical value set appears as an inline `enum` on some DTO property; 0 carry a name. The other **40** value sets appear nowhere in the document (response-only statuses such as `InvoiceStatus`, `ContractStatus`, `ZatcaInvoiceStatus`) |
| Response shapes | 167 | **0** | no response schema exists |
| Nested request+response | 1 | 0 | response side is Prisma `JsonValue` |
| **Total** | **317** | **109** | |

Unnamed request shapes at call sites: of the 16 inline type-literal bodies, 13 hit a DTO with a non-empty schema in the document, 2 hit empty controller-file DTOs (`CreateIntegrationDto`, `RequestDecisionDto`), and 1 (`DeclareVatRatioDto`) is absent only because the build predates it. Across all inline bodies, **6 call sites send to an empty schema**: `integrations.ts:45 CreateIntegrationDto`, `integrations.ts:47 SetEnabledDto`, `mfa.ts:18`/`:21 MfaCodeDto`, `platformDecisions.ts:29 RequestDecisionDto`, `supportAccess.ts:38 RequestSupportAccessDto`.

---

## 6. (c) What breaks if they are generated — with evidence

1. **Responses cannot be generated from this document at all** (§5.1: 0/358). Any response type would first need response classes/`@ApiOkResponse` on 355 un-annotated route methods — or a different source (the server's TypeScript types).
2. **Duplicate `operationId`s** (716 operations, 358 unique): invalid under the OpenAPI spec; generators keyed on `operationId` collide or overwrite. Every path also exists twice (`/v1/x` and `/x`) — output doubles unless one prefix is filtered.
3. **Six empty request schemas** (controller-file DTOs, §2) → generated bodies for 6 web call sites would be `{}`-typed; the real fields would be lost.
4. **The committed snapshot cannot feed a generator** — it has no schemas (§4.2) and lags HEAD by 5 operations. Generation needs `nest build` → a new step that **writes** the document → the generator.
5. **Money (Decimal).** Requests: DTOs use `number` and so does the web — **0** number/string mismatches over the 66 request mirrors. Responses: the server's static type is Prisma `Decimal` (39 named web response types; 468 field occurrences across all pairings incl. inline members: web types them `string` 410×, `string | null` 51×, `MoneyText` 5×, `string | number` 2×). Anything generated from the server's TS types yields `Decimal` (a class not present in the browser bundle) — it must be mapped to string. (Not measured: how the Swagger plugin would describe a `Decimal`-typed class property if response DTOs were added.)
6. **Dates.** Server static type `Date` (71 named web response types; 556 field occurrences across all pairings: 338 typed `string`, 218 `string | null` on the web); JSON sends ISO strings. The document has 0 `date-time` properties; request date fields are plain strings.
7. **List endpoints return `T[] | Paged<T>`** (`common/pagination/paged.util.ts:14 ListResult`; 42 routes). The web declares `X[]` at **39 call sites / 40 types**. A generated union forces narrowing at every call (or an endpoint split).
8. **`include` relations are missing from the server's static type.** `paged.util.ts:156-159` states it: rows from `pagedFindMany` are typed as the model's columns only; `include` relations exist at runtime only. 12 of 30 call sites pass `include`; **11 web pairings** declare those relations as required (`Branch.activity`, `CashDrawer.branch/account`, `CompanyUser.permissionTemplate/branches`, `AttendanceRecord.employee`, `FiscalYear.periods`, `LeaveRequest.employee/leaveType`, `MaintenanceRequest.property/unit`, `Quote.customer/lines`, `Reservation.unit`, `SupportLogLine.grant`, `Warranty.property/unit/supplier/_count`). Types derived from the server's TS types would drop fields the pages read.
9. **One web type reused across endpoints whose responses genuinely differ** — **56 (type, route) pairings over 12 web types**: `Invoice` (`outstanding`, `creditedTotal`, `zatcaQr` are computed only in the list, `invoices.service.ts:218-223`; create returns the raw row, `:701`), `Unit` (computed `status/currentTenant/reservedBy/upcomingTenant` only in the list; absent in 21 other pairings), `Warehouse` (`itemCount/totalQty`), `Purchase` (`allocated/credited/remaining`), `PosShift` (totals on open), `Account.openingDateDeclared`, `Activity` counts, `JournalEntry.reversedBy/reversalOf`, `Quote.derivedStatus`, `PlatformDecision.requestedBy/decidedBy` on create, `CashDeposit.drawer/bank` on void, `PosSaleResponse`. Per-endpoint generated types would split each of these.
10. **`PosSaleResponse = Invoice & {…}`** (`pos.ts:62`) declares 5 required fields (`relatedInvoice`, `replacesInvoice`, `replacedBy`, `outstanding`, `creditedTotal`) that neither `POST /pos/sales` nor `/pos/sales/sync` returns.
11. **Nullability** — 12 response types differ: 2 where the server may send `null` and the web says non-null (`CashDeposit.journalEntryId`, `ConsentVersion.entries`); 10 where the web allows `null` the server never sends (e.g. `VatDeclaration.proportional`, `StatementReport.account`, `ZatcaUnreported.items`).
12. **Enums.**
    * No named enums in the document (0 standalone schemas) → generated types are anonymous inline unions; the 75 web names would still be written by hand (or aliased into generated paths). 24 names differ from their server counterpart; 21 of those have no server type name.
    * 40 of 75 value sets are absent from the document.
    * The 3 field-level drifts (§3.2) would surface the moment types come from Prisma/the server: `CompanyUserStatus` gains `CLOSED`, both `PaymentMethod`-like types gain `CARD`.
    * Request enums are deliberately narrower than Prisma (`CreateCustomerDto.kind` excludes `LEGACY_UNDECLARED`; contract classification/VAT inclusion exclude `LEGACY_*`); the web models this with `Exclude<>` (4 aliases). Generating from the DTO keeps it; generating from Prisma loses it.
13. **Arabic labels live only in the web.** The document carries no labels (§5.1). **55** exhaustive `Record<Enum, …>` maps in web source are keyed by exchanged enum types (45 by 37 distinct named literal-set types + 10 by indexed types such as `CompanyUser['status']` at `pages/companyUsers/CompanyUsersPage.tsx:13`); 69 `Record<…>` maps in all. Any value added by generation turns into a TS2741 compile error in these maps — a useful guard, and churn to plan for.
14. **Where the web deliberately narrows or extends the server:** `VatPeriodQuery` (`obligations.ts:50`) is a 2-branch union (quarter XOR month) the DTO/document cannot express (and the stale document lists `quarter` as required); `UpdateInvoiceInput = Partial<CreateInvoiceInput>` carries 4 fields `UpdateInvoiceDto` does not accept (`issuedAt`, `issuedOffsetMin`, `creditOverride`, `prepaymentInvoiceIds`); `CustomerInput.otherIdScheme` allows `''`, which the DTO enum rejects; 18 derived and 3 intersection body types exist only on the web.
15. **Fields the server would reject if sent** — 5 request types (`ActivityInput.disabled` vs `CreateActivityDto`; `BankInput.branchId`, `EmployeeInput.branchId`, `CompanyInput.subStart/subEnd` vs their Update DTOs; `UpdateInvoiceInput` above). `ValidationPipe` runs with `whitelist: true, forbidNonWhitelisted: true, transform: true` (`apps/api/src/main.ts:58-61`) ⟹ 400 if actually sent. Generated types would remove them → compile errors at any call site that passes them. 24 request types omit fields the DTO accepts (mostly `branchId`/`currency`/`exchangeRate`) — generation adds optional fields (no break).
16. **Importer churn** (non-test web source; §8): 192 exported API types are imported by other files (367 import edges); the top type (`Branch`) by 22 files. Renaming `XInput` → generated names or aliasing touches these.
17. **Tooling:** a generator (e.g. `openapi-typescript`) would be a new devDependency (none installed); a step must write the document (today in-memory only); the precedent for location and guarding is `packages/shared` + a redraw-and-compare spec in `api-unit` (§4.1), placed after `npm run openapi:check` (`web-tests-light.yml:237`), which already builds. `apps/web/package.json` would do well to declare `@mad-app/shared` explicitly (today workspace resolution only).

---

## 7. The two guards named in CLAUDE.md §4

* **`apps/web/src/lib/statusBadge.ts`** (57 lines): `badgeOf`/`badgeAltOf`/`tagOf` (lines 39-45, 55-57) return `{ label: String(key), … }` when a status map lacks the key — a **runtime** fallback for version skew between a cached bundle and a newer server. It compares nothing with the server; compile-time exhaustiveness is left to `Record<Status, Meta>` (its comment quotes TS2741). Its comment counts the `MAP[x].prop` pattern at 18 places (quoted, not re-measured).
* **`apps/api/test/invoice-outstanding.e2e-spec.ts:95-100`**: `Object.values(InvoiceStatus)` (Prisma) vs a literal `['DUE','PARTIAL','PAID','OVERDUE']` typed **inside the test** — a third copy; it reads neither `apps/web/src/api/invoices.ts:30` nor `pages/invoices/statusMeta.ts`. Covers 1 of the 75 web enum types; runs in `db-integration` (e2e).

---

## 8. Importers per type (top 10, non-test web source)

AST import map (re-exports excluded). Validated: `Branch` 22 by AST = 22 by an independent multiline grep `import[^;]*\bBranch\b[^;]*from '[./]*(api/)?branches'`.

| type | files importing it |
|---|---|
| `api/branches.ts#Branch` | 22 |
| `api/banks.ts#Bank` | 12 |
| `api/customers.ts#Customer` | 11 |
| `api/units.ts#Unit` | 10 |
| `api/invoices.ts#Invoice` | 10 |
| `api/properties.ts#Property` | 10 |
| `api/templates.ts#PermissionTemplate` | 9 |
| `api/warehouses.ts#Warehouse` | 8 |
| `api/products.ts#Product` | 7 |
| `api/accounts.ts#Account` | 7 |
| `api/purchases.ts#Purchase` | 7 (tie) |

192 of the 306 exported types are imported by at least one other non-test file (367 edges); 114 are used only inside their own `api/*.ts` file.

---

## 9. Summary table

| category | written twice | derivable from OpenAPI today | blockers |
|---|---|---|---|
| Enums (literal sets) | **75** (Prisma 49 · const array 16 · literal union 5 · inline union 1 · `@IsIn` 4) | **35** (values only, inline; 0 named) | 0 named enum schemas; 40 value sets absent (response-only); 24 names differ; 3 web enums narrower than their Prisma column; 55 exhaustive label maps react to any added value |
| Request bodies | **66** | **66** | 0/66 same name; 17 types feed create+update; 5 types carry fields the DTO rejects; 24 omit DTO fields; 2 required-ness; 1 enum (`''`); `VatPeriodQuery` union; 6 empty controller-file schemas (6 call sites); stale build for DTOs changed after it |
| Query-parameter types | **8** | **8** | flattened into parameters (no named type); `AuditFilters` passed via `Object.fromEntries` |
| Response shapes | **167** (explicit 29 · Prisma same-name 57 · inferred only 81) | **0** | 0/358 response schemas; plugin maps interfaces/unions to `Object`; 355/363 routes un-annotated; `T[] \| Paged<T>` (39 calls); `include` typing gap (11 pairings); reused types with differing responses (56 pairings, 12 types); Decimal/Date serialize to strings; 12 nullability mismatches; `PosSaleResponse` |
| Nested / other | **1** | 0 | Prisma `Json` column |
| Web-only aliases | 0 (2 types) | — | — |
| **Total** | **317 / 319** | **109** | plus: duplicate `operationId`s (358/716 unique), doubled paths, document not persisted, snapshot lags HEAD by 5 operations, no generator installed |

---

## 10. Probe register — every count, its pattern, and its validation

| # | probe | result | must match (seen) | must not match (seen) |
|---|---|---|---|---|
| P1 | `grep -cE '^export (declare )?(interface\|type\|enum\|const enum) [A-Za-z_]'` over `src/api/*.ts` | 306 | `invoices.ts:8 export interface InvoiceLine {`, `invoices.ts:30 export type InvoiceStatus = …` | `invoices.ts:6 export type { Customer } from './customers';`, `invoices.ts:149 export const CREDIT_LIMIT_EXCEEDED` |
| P2 | AST export inventory (`web-inventory.cjs`) | 306 (224/82) | same two lines | same two lines |
| P3 | AST client-call scan (all non-test web src) | 327 | `invoices.ts:164,166,167,169,170,182,183` with correct generic/body types | no call at `invoices.ts:149` |
| P3b | line grep `\b(apiClient\|refreshClient)\.(get\|post\|put\|patch\|delete)\b` outside `api/` | 5 — **undercount** | — | misses `PermissionsContext.tsx:115`, `PlatformRoleGate.tsx:27` (`.get` on the next line); AST value 7 used |
| P4 | `grep -c '^enum '` / `'^model '` on pinned `schema.prisma` | 66 / 105 | `schema.prisma:55 enum InvoiceStatus {` | field line `:1387 status InvoiceStatus @default(DUE)` |
| P5 | route matcher (specific before generic) | 325/327 routed | `invoices.ts:166 → GET /invoices/open-prepayments/{customerId}` (controller :31) | not captured by a `/{id}` route |
| P6 | plugin `openapi.ApiResponse(...)` grep in `dist/src` | 358 (224/131/3) | `invoices.controller.js:66 openapi.ApiResponse({ status: 200, type: Object })` | hand-written `swagger_1.ApiResponse` — 0 in src (P8) |
| P7 | document analysis (`analyze-openapi.cjs`) | §5.1 | `POST /v1/invoices` body `$ref CreateInvoiceDto` | `GET /v1/invoices` has no body |
| P8 | `grep -rnoE '@Api(Property\|PropertyOptional\|Response\|OkResponse\|CreatedResponse\|Body\|Query\|Param\|Tags\|ExcludeEndpoint\|ExcludeController\|Extra\|HideProperty)\b' src` (non-spec) | 1 hit = docstring ⟹ 0 in use | positive control: same pattern on the string `@ApiProperty()` → 1; `export declare function ApiProperty` in swagger d.ts → 1 | — |
| P9 | generator packages in `package-lock.json` | 0 | control `"node_modules/@nestjs/swagger"` → 1 | — |
| P10 | `pagedFindMany` with `include` | regex 11 (**undercount**), AST **12** of 30 | `branches.service.ts:33`, `maintenance.service.ts:63` (include on a later line), `fiscal.service.ts:51` (AST only — nested parens beat the regex) | `activities.service.ts:31`, `customers.service.ts:59` (no include) |
| P11 | pre-load side-effect grep on `dist/src` | 0 files | control `dist/scripts/openapi-snapshot.js` matched; `setInterval` control `@nestjs/schedule/dist/scheduler.orchestrator.js` matched | `dist/src/app.module.js` not matched |
| P12 | `Record<…>` maps (AST) | 69; 45 by named literal sets; 10 by indexed types | `pages/invoices/statusMeta.ts:3 Record<InvoiceStatus,…>` | `api/tasks.ts:83 SCREEN_ROUTES Record<string,string>` (counted as a `string` key) |
| P13 | importer count | `Branch` 22 | independent multiline grep → 22 files | — |
| P14 | return-type extraction (type checker) | 363; 0 `any` | `GET /customers/{id}/summary` → 5 fields incl. `prepaid`; `POST /auth/login` → `accessToken,user` | `DELETE /invoices/{id}` → `void` |
| P15 | `dist` staleness | 9 controllers, 10 DTOs newer; 117 vs 119 DTO files | `find src -name '*.controller.ts' -newer dist/src/app.module.js` | contract equal to snapshot 716/716 |
| P16 | `@Body` coverage in the document | 152/156 | 4 named misses (§5.1) | — |
| P17 | document labels | 0 property descriptions, 0 `x-enum*`, 0 Arabic chars | 716 response descriptions found (all empty) | — |

---

## 11. My own probe errors caught during the scan (corrected before any figure above)

1. `grep -cE '^enum …'` 66 → 68 between two runs: not a probe error — the other session edited the file; fixed by pinning to `40af110`.
2. Client calls outside `src/api`: line grep 5 → AST **7** (chained `.get` on the next line).
3. `pagedFindMany`+`include`: multiline regex 11 → AST **12** (`fiscal.service.ts:51` has two-level nested parentheses).
4. Response-type extraction, first pass: 243/363 routes with fields; unions (`ListResult`), intersections (`({requestedBy}&{…})[]`), array-intersections (listed Array methods as fields) and unions of arrays (`never[] | Row[]`) were not unwrapped → final 323 + 40 `void` = 363. Union-of-object merging first took the first member's symbol (a child typed `"BATCH"` only) → now TypeScript's synthetic union property.
5. Heuristic Prisma-model matching produced false pairs (`StockLevelRow→InventoryWriteOff`, `TrashItem→Customer`, `ReportLine→Currency`, `TaskTarget→AuditLog`) → replaced by the type-checker pairing; a Prisma model is reported only when it has the same name.
6. Request pairing first compared the **base** type for `Partial<X>`/`Omit<X,…>` bodies → 17 "required-ness" differences, 15 of them artifacts; bodies are now evaluated as sent → 2 remain.
7. `Exclude<CustomerKind,'LEGACY_UNDECLARED'>` was read as the literal it excludes → fixed by evaluating `Exclude/Extract`.
8. Exact-tie enum matching picked `MaintenancePriority` for `TaskPriority` → same-name preference.
9. Composite literal aliases (`TaxCategory`, `DerivedQuoteStatus`, three `Exclude<>` aliases) were initially unresolved → expanded (5).
10. Earlier drafts reported `ExpiringBatch.source/qtyKind` and `PosSaleResponse.docType/status/zatcaStatus` as enum drift — artifacts of items 4 and of resolving fields inherited through `Invoice &` in the wrong file; the server types are identical (`"BATCH" | "LEGACY_MOVEMENT"`, `"RECEIVED" | "REMAINING"`).

---

## 12. Limits (what was not measured)

* The document comes from a `dist` built 2026-09-23 08:41 (operation contract identical to the committed snapshot); DTOs edited after it may carry different property sets in a fresh build (e.g. `VatFiledDto`: 2 properties in the document, 5 declared at HEAD).
* Response comparisons use static TypeScript types; the `include` gap (11 pairings) is the one measured place where runtime JSON has more than the static type. The server was not run and no JSON was captured.
* Decimal→string and Date→ISO-string at runtime are the standard `Decimal.prototype.toJSON` / `JSON.stringify` behaviour; not observed on a live response.
* "Server returns N fields the web type omits" counts every column of Prisma rows returned whole (ids, `companyId`, timestamps, `base*` amounts).
* The 3 intersection body types (§1.4) and 53 untyped object-literal bodies were listed, not field-compared.
* How the Swagger plugin would describe `Decimal`-typed class properties (if response DTOs were introduced) was not tested.

---

## Appendix A — Full mirror table (319 rows)

Legend: `web/` = `apps/web/src/`, `api/` = `apps/api/`. "server file:line" for inferred response shapes is the controller method of the first pairing. "from doc today?" = derivable from the OpenAPI document as it is produced today. "FIELD DRIFT" = the web enum types a response field whose Prisma column enum is wider. "absent on some routes" = required web field missing from the static server type of that route (see §6 items 8–9 for which are runtime-real).

| # | web type | web file:line | server counterpart | server file:line | kind | twice? | from doc today? | differences found |
|---|---|---|---|---|---|---|---|---|
| 1 | AccountType | web/api/accounts.ts:4 | server const array (not exported) ACCOUNT_TYPES | api/src/accounts/dto/create-account.dto.ts:3 | enum (literal set) | yes | yes (inline enum at CreateAccountDto.type; no named schema) | values identical · name differs (ACCOUNT_TYPES) |
| 2 | Account | web/api/accounts.ts:6 | Prisma model Account (apps/api/prisma/schema.prisma:1165); inferred return of GET /accounts (+4 more pairings) | api/src/accounts/accounts.controller.ts:19 | response shape | yes | no (no response schema in doc) | absent on some routes: openingDateDeclared@POST /accounts, openingDateDeclared@PATCH /accounts/{id}, openingDateDeclared@POST /journal (+1) · server returns 3 field(s) the web type omits · Decimal→web string ×2 · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 3 | AccountInput | web/api/accounts.ts:19 | CreateAccountDto / UpdateAccountDto (body typed Partial<Omit<AccountInput, 'code'>>) | api/src/accounts/dto/create-account.dto.ts:5 / apps/api/src/accounts/dto/update-account.dto.ts:5 | request DTO | yes | yes (component schema) | same fields |
| 4 | AccountsSummary | web/api/accounts.ts:30 | inferred return of GET /accounts/summary | api/src/accounts/accounts.controller.ts:26 | response shape | yes | no (no response schema in doc) | server returns 5 field(s) the web type omits |
| 5 | Sector | web/api/activities.ts:5 | server const array SECTORS | api/src/activities/sectors.ts:33 | enum (literal set) | yes | yes (inline enum at CreateActivityDto.sector; no named schema) | values identical · name differs (SECTORS) |
| 6 | Activity | web/api/activities.ts:17 | inferred return of GET /activities (+2 more pairings) | api/src/activities/activities.controller.ts:29 | response shape | yes | no (no response schema in doc) | absent on some routes: branchCount@POST /activities, productCount@POST /activities, branchCount@PATCH /activities/{id} (+1) · server returns 3 field(s) the web type omits · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 7 | ActivityInput | web/api/activities.ts:38 | CreateActivityDto / UpdateActivityDto (body typed Partial<ActivityInput>) | api/src/activities/dto/create-activity.dto.ts:4 / apps/api/src/activities/dto/update-activity.dto.ts:4 | request DTO | yes | yes (component schema) | web-only (400 under forbidNonWhitelisted if sent): disabled |
| 8 | ScreenChangePreview | web/api/activities.ts:46 | explicit server type ScreenChangePreview (apps/api/src/activities/primary-activity.service.ts:26); inferred return of GET /activities/primary/preview (+1 more pairings) | api/src/activities/activities.controller.ts:43 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 9 | ApiKeyRow | web/api/apiKeys.ts:4 | explicit server type ApiKeyView (apps/api/src/api-keys/api-keys.service.ts:12); inferred return of GET /api-keys (+1 more pairings) | api/src/api-keys/api-keys.controller.ts:23 | response shape | yes | no (no response schema in doc) | Date→web string ×3 |
| 10 | CreatedApiKey | web/api/apiKeys.ts:16 | inferred return of POST /api-keys | api/src/api-keys/api-keys.controller.ts:29 | response shape | yes | no (no response schema in doc) | Date→web string ×3 |
| 11 | UsageRow | web/api/apiKeys.ts:36 | explicit server type UsageView (apps/api/src/api-keys/integration-usage.service.ts:14); inferred return of GET /api-keys/usage .rows | api/src/api-keys/api-keys.controller.ts:41 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 12 | AttendanceStatus | web/api/attendance.ts:3 | Prisma enum AttendanceStatus | api/prisma/schema.prisma:2672 | enum (literal set) | yes | yes (inline enum at RecordAttendanceDto.status; no named schema) | values identical |
| 13 | AttendanceRecord | web/api/attendance.ts:5 | Prisma model AttendanceRecord (apps/api/prisma/schema.prisma:2680); inferred return of GET /attendance (+2 more pairings) | api/src/attendance/attendance.controller.ts:20 | response shape | yes | no (no response schema in doc) | absent on some routes: employee@GET /attendance · server returns 4 field(s) the web type omits · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 14 | RecordAttendanceInput | web/api/attendance.ts:16 | RecordAttendanceDto | api/src/attendance/dto/attendance.dto.ts:6 | request DTO | yes | yes (component schema) | same fields |
| 15 | AuditEntry | web/api/audit.ts:3 | inferred return of GET /audit-log | api/src/audit/audit.controller.ts:24 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 16 | AuditFilters | web/api/audit.ts:19 | ListAuditQueryDto | api/src/audit/dto/list-audit-query.dto.ts:12 | query-string DTO | yes | yes (operation query parameters) | params passed via Object.fromEntries (not seen by the call probe); dto-only: action + PagedQueryDto page/pageSize/search |
| 17 | Bank | web/api/banks.ts:3 | Prisma model Bank (apps/api/prisma/schema.prisma:2709); inferred return of GET /banks (+6 more pairings) | api/src/banks/banks.controller.ts:114 | response shape | yes | no (no response schema in doc) | server returns 10 field(s) the web type omits · Decimal→web string ×2 · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 18 | BankInput | web/api/banks.ts:14 | CreateBankDto / UpdateBankDto (body typed Partial<BankInput>) | api/src/banks/dto/create-bank.dto.ts:4 / apps/api/src/banks/dto/update-bank.dto.ts:3 | request DTO | yes | yes (component schema) | web-only (400 under forbidNonWhitelisted if sent): branchId [UpdateBankDto] · dto-only: currency,exchangeRate |
| 19 | CodeBandStatus | web/api/banks.ts:26 | explicit server type BandStatus (apps/api/src/accounts/code-bands.ts:139); inferred return of GET /banks/code-band (+1 more pairings) | api/src/banks/banks.controller.ts:127 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 20 | ReconciliationLedgerRow | web/api/banks.ts:45 | explicit server type ReconciliationLedgerRow (apps/api/src/banks/reconciliation.service.ts:234); inferred return of GET /banks/{id}/reconciliation .ledger .rows | api/src/banks/banks.controller.ts:77 | response shape | yes | no (no response schema in doc) | server returns 8 field(s) the web type omits |
| 21 | ReconciliationOverview | web/api/banks.ts:57 | inferred return of GET /banks/{id}/reconciliation | api/src/banks/banks.controller.ts:77 | response shape | yes | no (no response schema in doc) | nullability: bank: server non-null, web \|null; statement: server non-null, web \|null |
| 22 | CashDepositStatus | web/api/banks.ts:86 | Prisma enum CashDepositStatus | api/prisma/schema.prisma:4262 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 23 | CashDeposit | web/api/banks.ts:87 | Prisma model CashDeposit (apps/api/prisma/schema.prisma:4270); inferred return of GET /banks/cash-deposits .items (+2 more pairings) | api/src/banks/banks.controller.ts:58 | response shape | yes | no (no response schema in doc) | absent on some routes: drawer@POST /banks/cash-deposits/{depositId}/void, bank@POST /banks/cash-deposits/{depositId}/void · server returns 7 field(s) the web type omits · Date→web string ×1 · nullability: journalEntryId: server \|null, web string |
| 24 | CashDepositList | web/api/banks.ts:102 | inferred return of GET /banks/cash-deposits | api/src/banks/banks.controller.ts:58 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 25 | CashDepositInput | web/api/banks.ts:107 | CreateCashDepositDto | api/src/banks/dto/cash-deposit.dto.ts:4 | request DTO | yes | yes (component schema) | same fields |
| 26 | NetworkSettlementStatus | web/api/banks.ts:122 | Prisma enum NetworkSettlementStatus | api/prisma/schema.prisma:4318 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 27 | NetworkSettlement | web/api/banks.ts:123 | Prisma model NetworkSettlement (apps/api/prisma/schema.prisma:4327); inferred return of GET /banks/network-settlements .items (+2 more pairings) | api/src/banks/banks.controller.ts:32 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits |
| 28 | NetworkTransitSummary | web/api/banks.ts:143 | inferred return of GET /banks/network-settlements .summary (+1 more pairings) | api/src/banks/banks.controller.ts:32 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 29 | NetworkSettlementList | web/api/banks.ts:149 | inferred return of GET /banks/network-settlements | api/src/banks/banks.controller.ts:32 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 30 | OpenNetworkReceipts | web/api/banks.ts:153 | inferred return of GET /banks/network-settlements/open | api/src/banks/banks.controller.ts:39 | response shape | yes | no (no response schema in doc) | nullability: receipts: server non-null, web \|null |
| 31 | NetworkSettlementInput | web/api/banks.ts:158 | CreateNetworkSettlementDto | api/src/banks/dto/network-settlement.dto.ts:4 | request DTO | yes | yes (component schema) | same fields |
| 32 | BranchActivity | web/api/branches.ts:4 | inferred return of POST /branches .activity (+1 more pairings) | api/src/branches/branches.controller.ts:28 | response shape | yes | no (no response schema in doc) | server returns 6 field(s) the web type omits |
| 33 | Branch | web/api/branches.ts:10 | Prisma model Branch (apps/api/prisma/schema.prisma:693); inferred return of GET /branches (+2 more pairings) | api/src/branches/branches.controller.ts:23 | response shape | yes | no (no response schema in doc) | absent on some routes: activity@GET /branches · server returns 5 field(s) the web type omits · web X[] vs server T[] \| Paged<T> |
| 34 | BranchInput | web/api/branches.ts:21 | CreateBranchDto / UpdateBranchDto (body typed Partial<BranchInput>) | api/src/branches/dto/create-branch.dto.ts:3 / apps/api/src/branches/dto/update-branch.dto.ts:3 | request DTO | yes | yes (component schema) | dto-only: activityId,activityId [UpdateBranchDto] |
| 35 | BranchSummaryRow | web/api/branches.ts:38 | inferred return of GET /reports/branch-summary .branches (+2 more pairings) | api/src/reports/reports.controller.ts:196 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 36 | BranchSummary | web/api/branches.ts:46 | inferred return of GET /reports/branch-summary | api/src/reports/reports.controller.ts:196 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 37 | CashDrawerAccount | web/api/cashDrawers.ts:4 | inferred return of POST /cash-drawers .account (+1 more pairings) | api/src/cash-drawers/cash-drawers.controller.ts:34 | response shape | yes | no (no response schema in doc) | Decimal→web string ×1 |
| 38 | CashDrawer | web/api/cashDrawers.ts:12 | Prisma model CashDrawer (apps/api/prisma/schema.prisma:4222); inferred return of GET /cash-drawers (+2 more pairings) | api/src/cash-drawers/cash-drawers.controller.ts:23 | response shape | yes | no (no response schema in doc) | absent on some routes: branch@GET /cash-drawers, account@GET /cash-drawers · server returns 4 field(s) the web type omits · web X[] vs server T[] \| Paged<T> |
| 39 | CashDrawerInput | web/api/cashDrawers.ts:22 | CreateCashDrawerDto | api/src/cash-drawers/dto/create-cash-drawer.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 40 | ActorType | web/api/client.ts:21 | server inline union AuthUserView.actorType | api/src/auth/auth.service.ts:19 | enum (literal set) | yes | no (value set not in doc) | values identical · name differs (actorType) · note: identical to the inline union; the Prisma enum ActorType (schema.prisma:40) is wider by INTEGRATION |
| 41 | AccountStatus | web/api/client.ts:23 | Prisma enum AccountStatus | api/prisma/schema.prisma:33 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 42 | PlatformRole | web/api/client.ts:26 | Prisma enum PlatformRole | api/prisma/schema.prisma:187 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 43 | AuthUser | web/api/client.ts:28 | inferred return of POST /auth/refresh .user (+2 more pairings) | api/src/auth/auth.controller.ts:61 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits |
| 44 | RefreshResult | web/api/client.ts:49 | inferred return of POST /auth/refresh | api/src/auth/auth.controller.ts:61 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 45 | CompanyStatus | web/api/companies.ts:4 | Prisma enum AccountStatus | api/prisma/schema.prisma:33 | enum (literal set) | yes | no (value set not in doc) | values identical · name differs (AccountStatus) |
| 46 | Company | web/api/companies.ts:6 | Prisma model Company (apps/api/prisma/schema.prisma:308); inferred return of GET /companies (+3 more pairings) | api/src/companies/companies.controller.ts:27 | response shape | yes | no (no response schema in doc) | server returns 33 field(s) the web type omits · Date→web string ×3 · web X[] vs server T[] \| Paged<T> |
| 47 | CompanyInput | web/api/companies.ts:17 | CreateCompanyDto / UpdateCompanyDto (body typed Partial<CompanyInput>) | api/src/companies/dto/create-company.dto.ts:3 / apps/api/src/companies/dto/update-company.dto.ts:3 | request DTO | yes | yes (component schema) | web-only (400 under forbidNonWhitelisted if sent): subStart [UpdateCompanyDto],subEnd [UpdateCompanyDto] |
| 48 | CompanyProfile | web/api/companyProfile.ts:3 | inferred return of GET /company-profile (+1 more pairings) | api/src/company-profile/company-profile.controller.ts:20 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits |
| 49 | CompanyProfileInput | web/api/companyProfile.ts:34 | UpdateCompanyProfileDto | api/src/company-profile/dto/update-company-profile.dto.ts:6 | request DTO | yes | yes (component schema) | dto-only: writeOffRequiresTwoPersons,leaveApprovalRequiresTwoPersons,creditLimitHardBlock |
| 50 | CompanyUserStatus | web/api/companyUsers.ts:4 | server const array (not exported) STATUSES | api/src/company-users/dto/update-company-user.dto.ts:3 | enum (literal set) | yes | yes (inline enum at UpdateCompanyUserDto.status; no named schema) | values identical · name differs (STATUSES) · FIELD DRIFT: CompanyUser.status vs Prisma AccountStatus: server-only ["CLOSED"] |
| 51 | CompanyUser | web/api/companyUsers.ts:6 | Prisma model CompanyUser (apps/api/prisma/schema.prisma:581); inferred return of GET /company-users (+2 more pairings) | api/src/company-users/company-users.controller.ts:22 | response shape | yes | no (no response schema in doc) | absent on some routes: permissionTemplate@GET /company-users, branches@GET /company-users · server returns 4 field(s) the web type omits · enum: status: Prisma AccountStatus — web-only [] / server-only ["CLOSED"] · web X[] vs server T[] \| Paged<T> |
| 52 | CompanyUserInput | web/api/companyUsers.ts:20 | CreateCompanyUserDto | api/src/company-users/dto/create-company-user.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 53 | SubProcessorEntry | web/api/consent.ts:4 | UpsertSubProcessorDto fields / Prisma Json column on responses | api/src/consent/dto/consent.dto.ts:12 | request+response (nested) | yes | no | on responses the server type of ConsentVersion.entries is Prisma JsonValue (untyped) |
| 54 | ConsentVersion | web/api/consent.ts:12 | inferred return of GET /processing-agreement .current (+5 more pairings) | api/src/consent/consent.controller.ts:34 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · Date→web string ×2 · nullability: entries: server \|null, web SubProcessorEntry[] |
| 55 | ConsentState | web/api/consent.ts:21 | inferred return of GET /processing-agreement (+1 more pairings) | api/src/consent/consent.controller.ts:34 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 56 | SubProcessor | web/api/consent.ts:31 | Prisma model SubProcessor (apps/api/prisma/schema.prisma:6049); inferred return of GET /admin/processing-agreement .subProcessors (+2 more pairings) | api/src/consent/consent.controller.ts:58 | response shape | yes | no (no response schema in doc) | Date→web string ×2 |
| 57 | ConsentOverview | web/api/consent.ts:37 | inferred return of GET /admin/processing-agreement | api/src/consent/consent.controller.ts:58 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 58 | ContractStatus | web/api/contracts.ts:5 | Prisma enum ContractStatus | api/prisma/schema.prisma:3193 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 59 | ContractCycle | web/api/contracts.ts:6 | server const array CONTRACT_CYCLES | api/src/contracts/dto/create-contract.dto.ts:4 | enum (literal set) | yes | yes (inline enum at CreateContractDto.cycle; no named schema) | values identical · name differs (CONTRACT_CYCLES) |
| 60 | Furnished | web/api/contracts.ts:7 | server const array FURNISHED_OPTIONS | api/src/contracts/dto/create-contract.dto.ts:5 | enum (literal set) | yes | yes (inline enum at CreateContractDto.furnished; no named schema) | values identical · name differs (FURNISHED_OPTIONS) |
| 61 | ContractClassification | web/api/contracts.ts:10 | Prisma enum ContractClassification | api/prisma/schema.prisma:3215 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 62 | ContractVatInclusion | web/api/contracts.ts:12 | Prisma enum ContractVatInclusion | api/prisma/schema.prisma:3245 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 63 | DeclaredClassification | web/api/contracts.ts:13 | server const array CONTRACT_CLASSIFICATIONS | api/src/contracts/dto/create-contract.dto.ts:13 | enum (literal set) | yes | yes (inline enum at CreateContractDto.classification; no named schema) | values identical · name differs (CONTRACT_CLASSIFICATIONS) |
| 64 | DeclaredVatInclusion | web/api/contracts.ts:14 | server const array CONTRACT_VAT_INCLUSIONS | api/src/contracts/dto/create-contract.dto.ts:15 | enum (literal set) | yes | yes (inline enum at CreateContractDto.vatInclusion; no named schema) | values identical · name differs (CONTRACT_VAT_INCLUSIONS) |
| 65 | InstallmentStatus | web/api/contracts.ts:16 | Prisma enum InstallmentStatus | api/prisma/schema.prisma:3251 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 66 | PaymentMethod | web/api/contracts.ts:17 | DTO @IsIn literal RecordPaymentDto.method | api/src/contracts/dto/record-payment.dto.ts:4 | enum (literal set) | yes | yes (inline enum at RefundDto.method; no named schema) | values identical · name differs (method) · FIELD DRIFT: RentPayment.method vs Prisma PaymentMethod: server-only ["CARD"] |
| 67 | Installment | web/api/contracts.ts:19 | Prisma model Installment (apps/api/prisma/schema.prisma:4634); inferred return of GET /contracts/{id} .installments (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | web-optional absent: gross?,settled?,remaining? · server returns 14 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×1 |
| 68 | RentPayment | web/api/contracts.ts:31 | Prisma model RentPayment (apps/api/prisma/schema.prisma:4945); inferred return of GET /contracts/{id} .payments (+15 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 9 field(s) the web type omits · Decimal→web string ×3 · Date→web string ×1 · enum: method: Prisma PaymentMethod — web-only [] / server-only ["CARD"] |
| 69 | Contract | web/api/contracts.ts:44 | Prisma model Contract (apps/api/prisma/schema.prisma:3918); inferred return of GET /contracts/{id} (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 7 field(s) the web type omits · Decimal→web string/string \| null ×3 · Date→web string ×3 |
| 70 | HandoverType | web/api/contracts.ts:84 | Prisma enum HandoverType | api/prisma/schema.prisma:3593 | enum (literal set) | yes | yes (inline enum at CreateHandoverDto.type; no named schema) | values identical |
| 71 | HandoverStatus | web/api/contracts.ts:85 | Prisma enum HandoverStatus | api/prisma/schema.prisma:3600 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 72 | ItemCondition | web/api/contracts.ts:86 | Prisma enum ItemCondition | api/prisma/schema.prisma:3608 | enum (literal set) | yes | yes (inline enum at HandoverItemDto.condition; no named schema) | values identical |
| 73 | HandoverItem | web/api/contracts.ts:88 | Prisma model HandoverItem (apps/api/prisma/schema.prisma:3660); inferred return of GET /contracts/{id} .handovers .items (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits |
| 74 | ContractHandover | web/api/contracts.ts:95 | Prisma model ContractHandover (apps/api/prisma/schema.prisma:3622); inferred return of GET /contracts/{id} .handovers (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 5 field(s) the web type omits · Date→web string ×2 |
| 75 | HandoverItemInput | web/api/contracts.ts:109 | HandoverItemDto | api/src/contracts/dto/handover.dto.ts:11 | request DTO | yes | yes (component schema) | same fields |
| 76 | CreateHandoverInput | web/api/contracts.ts:115 | CreateHandoverDto | api/src/contracts/dto/handover.dto.ts:24 | request DTO | yes | yes (component schema) | same fields |
| 77 | UpdateHandoverInput | web/api/contracts.ts:124 | UpdateHandoverDto | api/src/contracts/dto/handover.dto.ts:55 | request DTO | yes | yes (component schema) | same fields |
| 78 | KeyMoneyDirection | web/api/contracts.ts:135 | Prisma enum KeyMoneyDirection | api/prisma/schema.prisma:3686 | enum (literal set) | yes | yes (inline enum at RecordKeyMoneyDto.direction; no named schema) | values identical |
| 79 | ContractKeyMoney | web/api/contracts.ts:137 | Prisma model ContractKeyMoney (apps/api/prisma/schema.prisma:3697); inferred return of GET /contracts/{id} .keyMoney (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 6 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×1 |
| 80 | RecordKeyMoneyInput | web/api/contracts.ts:147 | RecordKeyMoneyDto | api/src/contracts/dto/key-money.dto.ts:6 | request DTO | yes | yes (component schema) | dto-only: branchId,currency,exchangeRate |
| 81 | ClaimKind | web/api/contracts.ts:154 | Prisma enum ClaimKind | api/prisma/schema.prisma:3731 | enum (literal set) | yes | yes (inline enum at CreateClaimDto.kind; no named schema) | values identical |
| 82 | ClaimStatus | web/api/contracts.ts:155 | Prisma enum ClaimStatus | api/prisma/schema.prisma:3739 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 83 | ContractClaim | web/api/contracts.ts:157 | Prisma model ContractClaim (apps/api/prisma/schema.prisma:3755); inferred return of GET /contracts/{id} .claims (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 6 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×2 |
| 84 | CreateClaimInput | web/api/contracts.ts:171 | CreateClaimDto | api/src/contracts/dto/claim.dto.ts:9 | request DTO | yes | yes (component schema) | dto-only: branchId,currency,exchangeRate |
| 85 | DepositType | web/api/contracts.ts:178 | Prisma enum DepositType | api/prisma/schema.prisma:3806 | enum (literal set) | yes | yes (inline enum at RecordDepositDto.type; no named schema) | values identical |
| 86 | DepositHolder | web/api/contracts.ts:181 | Prisma enum DepositHolder | api/prisma/schema.prisma:3820 | enum (literal set) | yes | yes (inline enum at RecordDepositDto.holder; no named schema) | values identical |
| 87 | DepositStatus | web/api/contracts.ts:182 | Prisma enum DepositStatus | api/prisma/schema.prisma:3827 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 88 | DeductionKind | web/api/contracts.ts:183 | Prisma enum DeductionKind | api/prisma/schema.prisma:3837 | enum (literal set) | yes | yes (inline enum at DeductionDto.kind; no named schema) | values identical |
| 89 | DepositDeduction | web/api/contracts.ts:185 | Prisma model DepositDeduction (apps/api/prisma/schema.prisma:3899); inferred return of GET /contracts/{id} .deposits .deductions (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Decimal→web string ×1 |
| 90 | ContractDeposit | web/api/contracts.ts:192 | Prisma model ContractDeposit (apps/api/prisma/schema.prisma:3848); inferred return of GET /contracts/{id} .deposits (+14 more pairings) | api/src/contracts/contracts.controller.ts:130 | response shape | yes | no (no response schema in doc) | server returns 6 field(s) the web type omits · Decimal→web string/string \| null ×2 · Date→web string ×2 |
| 91 | RecordDepositInput | web/api/contracts.ts:210 | RecordDepositDto | api/src/contracts/dto/deposit.dto.ts:9 | request DTO | yes | yes (component schema) | dto-only: branchId,currency,exchangeRate |
| 92 | SettleDepositInput | web/api/contracts.ts:218 | SettleDepositDto | api/src/contracts/dto/deposit.dto.ts:50 | request DTO | yes | yes (component schema) | same fields |
| 93 | CreateContractInput | web/api/contracts.ts:223 | CreateContractDto | api/src/contracts/dto/create-contract.dto.ts:17 | request DTO | yes | yes (component schema) | dto-only: branchId,currency,exchangeRate |
| 94 | UpdateContractInput | web/api/contracts.ts:241 | UpdateContractDto | api/src/contracts/dto/update-contract.dto.ts:7 | request DTO | yes | yes (component schema) | same fields |
| 95 | SettlementBasis | web/api/contracts.ts:254 | server const array (not exported) SETTLEMENT_BASES | api/src/contracts/dto/cancel-contract.dto.ts:4 | enum (literal set) | yes | yes (inline enum at CancelContractDto.settlementBasis; no named schema) | values identical · name differs (SETTLEMENT_BASES) |
| 96 | CancelContractInput | web/api/contracts.ts:256 | CancelContractDto | api/src/contracts/dto/cancel-contract.dto.ts:17 | request DTO | yes | yes (component schema) | dto-only: unearnedDisposition |
| 97 | RecordPaymentInput | web/api/contracts.ts:267 | RecordPaymentDto | api/src/contracts/dto/record-payment.dto.ts:4 | request DTO | yes | yes (component schema) | dto-only: branchId,currency,exchangeRate |
| 98 | ContractListItem | web/api/contracts.ts:281 | inferred return of GET /contracts .items | api/src/contracts/contracts.controller.ts:36 | response shape | yes | no (no response schema in doc) | web-optional absent: claimsOutstanding?,depositsHeld? · server returns 6 field(s) the web type omits · Decimal→web string/string \| null ×3 · Date→web string ×3 |
| 99 | ContractListResponse | web/api/contracts.ts:283 | explicit server type Paged (apps/api/src/common/pagination/paged.util.ts:6); inferred return of GET /contracts | api/src/contracts/contracts.controller.ts:36 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 100 | ListContractsParams | web/api/contracts.ts:290 | ListContractsQueryDto | api/src/contracts/dto/list-contracts-query.dto.ts:11 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 101 | RenewContractInput | web/api/contracts.ts:304 | RenewContractDto | api/src/contracts/dto/renew-contract.dto.ts:6 | request DTO | yes | yes (component schema) | same fields |
| 102 | ContractAttachment | web/api/contracts.ts:355 | Prisma model ContractAttachment (apps/api/prisma/schema.prisma:4027); inferred return of GET /contracts/{contractId}/attachments (+1 more pairings) | api/src/contracts/contracts.controller.ts:117 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 103 | ClaimAttachment | web/api/contracts.ts:381 | Prisma model ClaimAttachment (apps/api/prisma/schema.prisma:4051); inferred return of GET /contracts/claims/{claimId}/attachments (+1 more pairings) | api/src/contracts/contracts.controller.ts:72 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 104 | HandoverPhoto | web/api/contracts.ts:405 | Prisma model HandoverPhoto (apps/api/prisma/schema.prisma:4075); inferred return of GET /contracts/handovers/{handoverId}/photos (+1 more pairings) | api/src/contracts/contracts.controller.ts:98 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 105 | Currency | web/api/currencies.ts:3 | Prisma model Currency (apps/api/prisma/schema.prisma:1059); inferred return of GET /currencies (+2 more pairings) | api/src/currencies/currencies.controller.ts:25 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Decimal→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 106 | CurrencyInput | web/api/currencies.ts:12 | CreateCurrencyDto / UpdateCurrencyDto (body typed Partial<Omit<CurrencyInput, 'code'>>) | api/src/currencies/dto/create-currency.dto.ts:3 / apps/api/src/currencies/dto/update-currency.dto.ts:5 | request DTO | yes | yes (component schema) | same fields |
| 107 | ExchangeRate | web/api/currencies.ts:19 | Prisma model ExchangeRate (apps/api/prisma/schema.prisma:1082); inferred return of GET /currencies/rates (+1 more pairings) | api/src/currencies/currencies.controller.ts:31 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 108 | ExchangeRateInput | web/api/currencies.ts:27 | UpsertExchangeRateDto | api/src/currencies/dto/upsert-exchange-rate.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 109 | CustomerKind | web/api/customers.ts:8 | Prisma enum CustomerKind | api/prisma/schema.prisma:1229 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 110 | NewCustomerKind | web/api/customers.ts:10 | server const array CUSTOMER_KINDS | api/src/customers/dto/create-customer.dto.ts:5 | enum (literal set) | yes | yes (inline enum at CreateCustomerDto.kind; no named schema) | values identical · name differs (CUSTOMER_KINDS) |
| 111 | BuyerIdScheme | web/api/customers.ts:19 | server const array BUYER_ID_SCHEMES | api/src/customers/dto/create-customer.dto.ts:9 | enum (literal set) | yes | yes (inline enum at CreateCustomerDto.otherIdScheme; no named schema) | values identical · name differs (BUYER_ID_SCHEMES) |
| 112 | Customer | web/api/customers.ts:34 | Prisma model Customer (apps/api/prisma/schema.prisma:1240); inferred return of GET /customers (+10 more pairings) | api/src/customers/customers.controller.ts:21 | response shape | yes | no (no response schema in doc) | server returns 9 field(s) the web type omits · Decimal→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 113 | CustomerSummary | web/api/customers.ts:51 | inferred return of GET /customers/{id}/summary | api/src/customers/customers.controller.ts:28 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits |
| 114 | CustomerInput | web/api/customers.ts:58 | CreateCustomerDto / UpdateCustomerDto (body typed Partial<CustomerInput>) | api/src/customers/dto/create-customer.dto.ts:12 / apps/api/src/customers/dto/update-customer.dto.ts:5 | request DTO | yes | yes (component schema) | dto-only: street,buildingNumber,district,city,postalCode,street [UpdateCustomerDto],buildingNumber [UpdateCustomerDto],district [UpdateCustomerDto],city [UpdateCustomerDto],postalCode [UpdateCustomerDto] · enum: otherIdScheme: web-only [""] / dto-only [] |
| 115 | MarketingChannel | web/api/customers.ts:86 | server const array MARKETING_CHANNELS | api/src/customers/marketing-consent.util.ts:35 | enum (literal set) | yes | yes (inline enum at RecordMarketingConsentDto.channel; no named schema) | values identical · name differs (MARKETING_CHANNELS) |
| 116 | ConsentSource | web/api/customers.ts:89 | server const array CONSENT_SOURCES | api/src/customers/marketing-consent.util.ts:42 | enum (literal set) | yes | yes (inline enum at RecordMarketingConsentDto.source; no named schema) | values identical · name differs (CONSENT_SOURCES) |
| 117 | MarketingVerdict | web/api/customers.ts:91 | server type MarketingVerdict | api/src/customers/marketing-consent.util.ts:61 | response shape | yes | no (no response schema in doc) | union of objects; same-name exported server type |
| 118 | MarketingConsentEvent | web/api/customers.ts:93 | inferred return of GET /customers/{id}/marketing-consent .events (+1 more pairings) | api/src/customers/customers.controller.ts:38 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×2 |
| 119 | MarketingConsentState | web/api/customers.ts:104 | inferred return of GET /customers/{id}/marketing-consent | api/src/customers/customers.controller.ts:38 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 120 | DelegationRow | web/api/delegations.ts:12 | explicit server type DelegationRow (apps/api/src/delegations/chain-source.ts:29); inferred return of GET /delegations/{granteeId} .links (+3 more pairings) | api/src/delegations/delegations.controller.ts:54 | response shape | yes | no (no response schema in doc) | Date→web string ×2 |
| 121 | DelegationView | web/api/delegations.ts:24 | explicit server type DelegationView (apps/api/src/delegations/delegations.service.ts:42); inferred return of GET /delegations/{granteeId} | api/src/delegations/delegations.controller.ts:54 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 122 | LogNode | web/api/delegations.ts:32 | explicit server type LogNode (apps/api/src/delegations/delegation-log.ts:101); inferred return of GET /delegations/log .roots (+1 more pairings) | api/src/delegations/delegations.controller.ts:48 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 123 | DelegationLog | web/api/delegations.ts:46 | inferred return of GET /delegations/log | api/src/delegations/delegations.controller.ts:48 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 124 | DeletionRequestStatus | web/api/deletionRequests.ts:4 | Prisma enum DeletionRequestStatus | api/prisma/schema.prisma:2512 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 125 | AccountRequestKind | web/api/deletionRequests.ts:6 | Prisma enum AccountRequestKind | api/prisma/schema.prisma:2521 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 126 | AccountRequestOutcome | web/api/deletionRequests.ts:8 | Prisma enum AccountRequestOutcome | api/prisma/schema.prisma:2528 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 127 | DeletionRequest | web/api/deletionRequests.ts:10 | inferred return of GET /deletion-request (+4 more pairings) | api/src/deletion-requests/deletion-requests.controller.ts:44 | response shape | yes | no (no response schema in doc) | server returns 8 field(s) the web type omits · Date→web string ×2 |
| 128 | DecisionPreview | web/api/deletionRequests.ts:24 | explicit server type DecisionPreview (apps/api/src/deletion-requests/deletion-requests.service.ts:25); inferred return of GET /admin/deletion-requests .preview | api/src/deletion-requests/deletion-requests.controller.ts:109 | response shape | yes | no (no response schema in doc) | web X[] vs server T[] \| Paged<T> |
| 129 | AdminDeletionRequest | web/api/deletionRequests.ts:29 | inferred return of GET /admin/deletion-requests (+1 more pairings) | api/src/deletion-requests/deletion-requests.controller.ts:109 | response shape | yes | no (no response schema in doc) | server returns 5 field(s) the web type omits · Date→web string ×2 · web X[] vs server T[] \| Paged<T> |
| 130 | AccountClosureState | web/api/deletionRequests.ts:40 | inferred return of GET /deletion-request/account | api/src/deletion-requests/deletion-requests.controller.ts:51 | response shape | yes | no (no response schema in doc) | Date→web string ×4 |
| 131 | ApprovalResult | web/api/deletionRequests.ts:48 | inferred return of POST /admin/deletion-requests/{id}/approve | api/src/deletion-requests/deletion-requests.controller.ts:120 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×1 · enum: outcome: server literal union — web-only ["DELETED"] / server-only [] |
| 132 | ClosureArchive | web/api/deletionRequests.ts:58 | inferred return of GET /deletion-request/archive | api/src/deletion-requests/deletion-requests.controller.ts:58 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 133 | EmployeeStatus | web/api/employees.ts:3 | Prisma enum EmployeeStatus | api/prisma/schema.prisma:49 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 134 | Employee | web/api/employees.ts:5 | Prisma model Employee (apps/api/prisma/schema.prisma:2424); inferred return of GET /employees (+3 more pairings) | api/src/employees/employees.controller.ts:20 | response shape | yes | no (no response schema in doc) | server returns 4 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 135 | EmployeeInput | web/api/employees.ts:18 | CreateEmployeeDto / UpdateEmployeeDto (body typed Partial<EmployeeInput>) | api/src/employees/dto/create-employee.dto.ts:5 / apps/api/src/employees/dto/update-employee.dto.ts:4 | request DTO | yes | yes (component schema) | web-only (400 under forbidNonWhitelisted if sent): branchId [UpdateEmployeeDto] |
| 136 | UploadedFile | web/api/files.ts:3 | inferred return of POST /files | api/src/files/files.controller.ts:35 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 137 | DownloadUrlResult | web/api/files.ts:10 | inferred return of GET /files/download-url | api/src/files/files.controller.ts:41 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 138 | FiscalPeriodStatus | web/api/fiscal.ts:3 | Prisma enum FiscalPeriodStatus | api/prisma/schema.prisma:1125 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 139 | FiscalPeriod | web/api/fiscal.ts:5 | Prisma model FiscalPeriod (apps/api/prisma/schema.prisma:1133); inferred return of POST /fiscal-years .periods (+2 more pairings) | api/src/fiscal/fiscal.controller.ts:24 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×1 |
| 140 | FiscalYear | web/api/fiscal.ts:14 | Prisma model FiscalYear (apps/api/prisma/schema.prisma:1101); inferred return of GET /fiscal-years (+1 more pairings) | api/src/fiscal/fiscal.controller.ts:18 | response shape | yes | no (no response schema in doc) | absent on some routes: periods@GET /fiscal-years · server returns 3 field(s) the web type omits · Date→web string ×2 · web X[] vs server T[] \| Paged<T> |
| 141 | FiscalYearInput | web/api/fiscal.ts:22 | CreateFiscalYearDto | api/src/fiscal/dto/create-fiscal-year.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 142 | IntegrationKind | web/api/integrations.ts:3 | Prisma enum IntegrationKind | api/prisma/schema.prisma:4407 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 143 | IntegrationConnection | web/api/integrations.ts:5 | Prisma model IntegrationConnection (apps/api/prisma/schema.prisma:4417); inferred return of GET /integrations (+2 more pairings) | api/src/integrations/integrations.controller.ts:49 | response shape | yes | no (no response schema in doc) | Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 144 | StockMovementType | web/api/inventory.ts:5 | Prisma enum StockMovementType | api/prisma/schema.prisma:5269 | enum (literal set) | yes | yes (inline enum at CreateStockMovementDto.type; no named schema) | values identical |
| 145 | StockStatus | web/api/inventory.ts:6 | server literal union StockStatus | api/src/inventory/inventory.service.ts:23 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 146 | StockMovement | web/api/inventory.ts:8 | Prisma model StockMovement (apps/api/prisma/schema.prisma:5284); inferred return of GET /inventory/movements .items (+2 more pairings) | api/src/inventory/inventory.controller.ts:72 | response shape | yes | no (no response schema in doc) | server returns 11 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×1 |
| 147 | StockMovementInput | web/api/inventory.ts:22 | CreateStockMovementDto | api/src/inventory/dto/create-stock-movement.dto.ts:6 | request DTO | yes | yes (component schema) | dto-only: branchId |
| 148 | ExpiringBatch | web/api/inventory.ts:37 | inferred return of GET /inventory/expiring .rows | api/src/inventory/inventory.controller.ts:86 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 149 | ExpiringStockResponse | web/api/inventory.ts:54 | inferred return of GET /inventory/expiring | api/src/inventory/inventory.controller.ts:86 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 150 | StockLevelRow | web/api/inventory.ts:60 | inferred return of GET /inventory/stock-levels | api/src/inventory/inventory.controller.ts:66 | response shape | yes | no (no response schema in doc) | web X[] vs server T[] \| Paged<T> |
| 151 | StockMovementListResponse | web/api/inventory.ts:69 | explicit server type Paged (apps/api/src/common/pagination/paged.util.ts:6); inferred return of GET /inventory/movements | api/src/inventory/inventory.controller.ts:72 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 152 | ListStockMovementsParams | web/api/inventory.ts:76 | ListMovementsQueryDto | api/src/inventory/dto/list-movements-query.dto.ts:10 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 153 | InvoiceLine | web/api/invoices.ts:8 | Prisma model InvoiceLine (apps/api/prisma/schema.prisma:1636); inferred return of GET /invoices .lines (+6 more pairings) | api/src/invoices/invoices.controller.ts:24 | response shape | yes | no (no response schema in doc) | server returns 7 field(s) the web type omits · Decimal→web string ×4 · web X[] vs server T[] \| Paged<T> |
| 154 | InvoiceStatus | web/api/invoices.ts:30 | Prisma enum InvoiceStatus | api/prisma/schema.prisma:55 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 155 | InvoiceDocType | web/api/invoices.ts:35 | Prisma enum InvoiceDocType | api/prisma/schema.prisma:76 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 156 | Invoice | web/api/invoices.ts:37 | Prisma model Invoice (apps/api/prisma/schema.prisma:1374); inferred return of GET /invoices (+6 more pairings) | api/src/invoices/invoices.controller.ts:24 | response shape | yes | no (no response schema in doc) | web-optional absent: posPayments?,zatcaStamped?,stampError? · absent on some routes: outstanding@POST /invoices, creditedTotal@POST /invoices, zatcaQr@POST /invoices (+15) · server returns 32 field(s) the web type omits · Decimal→web string ×3 · Date→web string ×3 · web X[] vs server T[] \| Paged<T> |
| 157 | ZatcaInvoiceStatus | web/api/invoices.ts:94 | Prisma enum ZatcaStatus | api/prisma/schema.prisma:63 | enum (literal set) | yes | no (value set not in doc) | values identical · name differs (ZatcaStatus) |
| 158 | InvoiceLineInput | web/api/invoices.ts:96 | InvoiceLineDto | api/src/invoices/dto/invoice-line.dto.ts:3 | request DTO | yes | yes (component schema) | dto-only: productId,taxRate,returnsLineId,returnCondition · required-ness: taxCategory (web required, dto ?) |
| 159 | CreateInvoiceInput | web/api/invoices.ts:108 | CreateInvoiceDto | api/src/invoices/dto/create-invoice.dto.ts:6 | request DTO | yes | yes (component schema) | dto-only: currency,exchangeRate |
| 160 | OpenPrepayment | web/api/invoices.ts:131 | inferred return of GET /invoices/open-prepayments/{customerId} | api/src/invoices/invoices.controller.ts:31 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 161 | UpdateInvoiceInput | web/api/invoices.ts:152 | UpdateInvoiceDto | api/src/invoices/dto/update-invoice.dto.ts:6 | request DTO | yes | yes (component schema) | web-only (400 under forbidNonWhitelisted if sent): issuedAt,issuedOffsetMin,creditOverride,prepaymentInvoiceIds · dto-only: currency,exchangeRate |
| 162 | CreateCreditNoteInput | web/api/invoices.ts:154 | CreateCreditNoteDto | api/src/invoices/dto/create-credit-note.dto.ts:5 | request DTO | yes | yes (component schema) | dto-only: eventDate |
| 163 | CreateDebitNoteInput | web/api/invoices.ts:172 | CreateDebitNoteDto | api/src/invoices/dto/create-debit-note.dto.ts:5 | request DTO | yes | yes (component schema) | dto-only: eventDate |
| 164 | JournalLine | web/api/journal.ts:4 | Prisma model JournalLine (apps/api/prisma/schema.prisma:2954); inferred return of GET /journal .items .lines (+2 more pairings) | api/src/journal/journal.controller.ts:19 | response shape | yes | no (no response schema in doc) | server returns 7 field(s) the web type omits · Decimal→web string ×2 |
| 165 | JournalEntry | web/api/journal.ts:12 | Prisma model JournalEntry (apps/api/prisma/schema.prisma:2832); inferred return of GET /journal .items (+2 more pairings) | api/src/journal/journal.controller.ts:19 | response shape | yes | no (no response schema in doc) | absent on some routes: reversedBy@POST /journal, reversalOf@POST /journal, reversedBy@POST /journal/{id}/reverse (+1) · server returns 10 field(s) the web type omits · Decimal→web string ×2 · Date→web string ×1 |
| 166 | JournalLineInput | web/api/journal.ts:26 | JournalLineDto | api/src/journal/dto/journal-line.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 167 | CreateJournalEntryInput | web/api/journal.ts:32 | CreateJournalEntryDto | api/src/journal/dto/create-journal-entry.dto.ts:6 | request DTO | yes | yes (component schema) | dto-only: branchId,currency,exchangeRate |
| 168 | JournalListResponse | web/api/journal.ts:38 | explicit server type Paged (apps/api/src/common/pagination/paged.util.ts:6); inferred return of GET /journal | api/src/journal/journal.controller.ts:19 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 169 | ListJournalParams | web/api/journal.ts:45 | ListJournalQueryDto | api/src/journal/dto/list-journal-query.dto.ts:11 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 170 | LeaveType | web/api/leaves.ts:3 | Prisma model LeaveType (apps/api/prisma/schema.prisma:2596); inferred return of GET /leaves/types (+2 more pairings) | api/src/leaves/leaves.controller.ts:24 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · web X[] vs server T[] \| Paged<T> |
| 171 | LeaveTypeInput | web/api/leaves.ts:10 | CreateLeaveTypeDto / UpdateLeaveTypeDto (body typed Partial<LeaveTypeInput>) | api/src/leaves/dto/leave.dto.ts:7 / apps/api/src/leaves/dto/leave.dto.ts:25 | request DTO | yes | yes (component schema) | same fields |
| 172 | LeaveStatus | web/api/leaves.ts:16 | Prisma enum LeaveRequestStatus | api/prisma/schema.prisma:2583 | enum (literal set) | yes | no (value set not in doc) | values identical · name differs (LeaveRequestStatus) |
| 173 | LeaveRequest | web/api/leaves.ts:18 | Prisma model LeaveRequest (apps/api/prisma/schema.prisma:2621); inferred return of GET /leaves/requests (+3 more pairings) | api/src/leaves/leaves.controller.ts:50 | response shape | yes | no (no response schema in doc) | absent on some routes: employee@GET /leaves/requests, leaveType@GET /leaves/requests · server returns 6 field(s) the web type omits · Date→web string ×3 · web X[] vs server T[] \| Paged<T> |
| 174 | LeaveRequestInput | web/api/leaves.ts:37 | CreateLeaveRequestDto | api/src/leaves/dto/leave.dto.ts:42 | request DTO | yes | yes (component schema) | same fields |
| 175 | LeaveBalance | web/api/leaves.ts:45 | inferred return of GET /leaves/balance | api/src/leaves/leaves.controller.ts:84 | response shape | yes | no (no response schema in doc) | nullability: types: server non-null, web \|null |
| 176 | MaintenancePriority | web/api/maintenance.ts:5 | Prisma enum MaintenancePriority | api/prisma/schema.prisma:3442 | enum (literal set) | yes | yes (inline enum at CreateMaintenanceDto.priority; no named schema) | values identical |
| 177 | MaintenanceStatus | web/api/maintenance.ts:9 | Prisma enum MaintenanceStatus | api/prisma/schema.prisma:3454 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 178 | MaintenanceRequest | web/api/maintenance.ts:11 | Prisma model MaintenanceRequest (apps/api/prisma/schema.prisma:3468); inferred return of GET /maintenance (+7 more pairings) | api/src/maintenance/maintenance.controller.ts:30 | response shape | yes | no (no response schema in doc) | absent on some routes: property@GET /maintenance, unit@GET /maintenance · server returns 6 field(s) the web type omits · Decimal→web string \| null ×1 · Date→web string ×4 · web X[] vs server T[] \| Paged<T> |
| 179 | CreateMaintenanceInput | web/api/maintenance.ts:35 | CreateMaintenanceDto | api/src/maintenance/dto/maintenance.dto.ts:10 | request DTO | yes | yes (component schema) | same fields |
| 180 | UpdateMaintenanceInput | web/api/maintenance.ts:45 | UpdateMaintenanceDto | api/src/maintenance/dto/maintenance.dto.ts:41 | request DTO | yes | yes (component schema) | same fields |
| 181 | MfaStatus | web/api/mfa.ts:4 | inferred return of GET /auth/mfa | api/src/common/mfa/mfa.controller.ts:28 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 182 | NotificationKind | web/api/notifications.ts:5 | Prisma enum NotificationKind | api/prisma/schema.prisma:3375 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 183 | AppNotification | web/api/notifications.ts:17 | inferred return of GET /notifications .notifications (+1 more pairings) | api/src/notifications/notifications.controller.ts:31 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×2 |
| 184 | NotificationList | web/api/notifications.ts:30 | inferred return of GET /notifications | api/src/notifications/notifications.controller.ts:31 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 185 | EscalationRun | web/api/notifications.ts:38 | inferred return of POST /notifications/run-escalation | api/src/notifications/notifications.controller.ts:61 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 186 | WarrantyCheckRun | web/api/notifications.ts:55 | inferred return of POST /notifications/run-warranty-check | api/src/notifications/notifications.controller.ts:73 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 187 | GovernmentObligation | web/api/obligations.ts:4 | Prisma model GovernmentObligation (apps/api/prisma/schema.prisma:5736); inferred return of GET /obligations (+1 more pairings) | api/src/obligations/obligations.controller.ts:21 | response shape | yes | no (no response schema in doc) | server returns 4 field(s) the web type omits · web X[] vs server T[] \| Paged<T> |
| 188 | RentDeclarationSection | web/api/obligations.ts:12 | explicit server type RentDeclarationSection (apps/api/src/obligations/obligations.service.ts:39); inferred return of GET /obligations/vat-declaration .rent | api/src/obligations/obligations.controller.ts:27 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 189 | SalesBoxes | web/api/obligations.ts:33 | explicit server type SalesBoxes (apps/api/src/obligations/obligations.service.ts:817); inferred return of GET /obligations/vat-declaration .boxes | api/src/obligations/obligations.controller.ts:27 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 190 | VatPeriodType | web/api/obligations.ts:47 | server literal union VatPeriodType | api/src/common/vat/vat-period.util.ts:19 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 191 | VatPeriodQuery | web/api/obligations.ts:50 | VatFiledDto | api/src/obligations/dto/vat-filed.dto.ts:10 | request DTO | yes | yes (component schema) | web is a 2-branch union (quarter XOR month) the DTO cannot express; dto-only (HEAD): periodChoice, refundRequested; stale doc lists year+quarter as required |
| 192 | VatDeclaration | web/api/obligations.ts:52 | inferred return of GET /obligations/vat-declaration | api/src/obligations/obligations.controller.ts:27 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · nullability: proportional: server non-null, web \|null |
| 193 | VatRatioView | web/api/obligations.ts:146 | inferred return of GET /obligations/vat-ratio | api/src/obligations/obligations.controller.ts:49 | response shape | yes | no (no response schema in doc) | nullability: suggestion: server non-null, web \|null |
| 194 | PaymentMethod | web/api/payments.ts:6 | Prisma enum PaymentMethod | api/prisma/schema.prisma:3284 | enum (literal set) | yes | yes (inline enum at CreatePaymentDto.method; no named schema) | values identical |
| 195 | PaymentAllocation | web/api/payments.ts:8 | Prisma model PaymentAllocation (apps/api/prisma/schema.prisma:4819); inferred return of GET /payments .allocations (+4 more pairings) | api/src/payments/payments.controller.ts:25 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Decimal→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 196 | Payment | web/api/payments.ts:15 | Prisma model Payment (apps/api/prisma/schema.prisma:4726); inferred return of GET /payments (+4 more pairings) | api/src/payments/payments.controller.ts:25 | response shape | yes | no (no response schema in doc) | server returns 5 field(s) the web type omits · Decimal→web string ×2 · Date→web string ×2 · web X[] vs server T[] \| Paged<T> |
| 197 | UnallocatedFate | web/api/payments.ts:45 | DTO @IsIn literal CreatePaymentDto.unallocated | api/src/payments/dto/payment.dto.ts:33 | enum (literal set) | yes | yes (inline enum at CreatePaymentDto.unallocated; no named schema) | values identical · name differs (unallocated) |
| 198 | OpenInvoice | web/api/payments.ts:49 | inferred return of GET /payments/open-invoices/{customerId} | api/src/payments/payments.controller.ts:32 | response shape | yes | no (no response schema in doc) | Decimal→web string ×1 · Date→web string ×2 · enum: status: Prisma InvoiceStatus — web types it as string |
| 199 | AllocationInput | web/api/payments.ts:62 | AllocationDto | api/src/payments/dto/payment.dto.ts:6 | request DTO | yes | yes (component schema) | same fields |
| 200 | PaymentInput | web/api/payments.ts:67 | CreatePaymentDto | api/src/payments/dto/payment.dto.ts:33 | request DTO | yes | yes (component schema) | same fields |
| 201 | PlatformDecisionAction | web/api/platformDecisions.ts:8 | Prisma enum PlatformDecisionAction | api/prisma/schema.prisma:200 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 202 | PlatformDecisionStatus | web/api/platformDecisions.ts:9 | Prisma enum PlatformDecisionStatus | api/prisma/schema.prisma:206 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 203 | PlatformDecision | web/api/platformDecisions.ts:11 | Prisma model PlatformDecision (apps/api/prisma/schema.prisma:221); inferred return of GET /admin/decisions (+1 more pairings) | api/src/platform/platform-decisions.controller.ts:48 | response shape | yes | no (no response schema in doc) | absent on some routes: requestedBy@POST /admin/decisions, decidedBy@POST /admin/decisions · server returns 3 field(s) the web type omits · Date→web string ×3 |
| 204 | PosPaymentMethod | web/api/pos.ts:5 | DTO @IsIn literal CreatePosSaleDto.paymentMethod | api/src/pos/dto/pos.dto.ts:70 | enum (literal set) | yes | yes (inline enum at SyncPosSaleDto.paymentMethod; no named schema) | values identical · name differs (paymentMethod) |
| 205 | PosPaymentPart | web/api/pos.ts:7 | PosPaymentPartDto | api/src/pos/dto/pos.dto.ts:46 | request DTO | yes | yes (component schema) | same fields |
| 206 | PosShift | web/api/pos.ts:12 | Prisma model PosShift (apps/api/prisma/schema.prisma:4156); inferred return of GET /pos/shifts/current (+2 more pairings) | api/src/pos/pos.controller.ts:29 | response shape | yes | no (no response schema in doc) | absent on some routes: salesCount@POST /pos/shifts, cashTotal@POST /pos/shifts, cardTotal@POST /pos/shifts (+1) · server returns 3 field(s) the web type omits · Decimal→web string/string \| null ×2 · Date→web string ×2 · web X[] vs server T[] \| Paged<T> |
| 207 | ClosedShift | web/api/pos.ts:30 | inferred return of POST /pos/shifts/{id}/close | api/src/pos/pos.controller.ts:48 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits · Decimal→web string/string \| null ×2 · Date→web string ×2 |
| 208 | PosSaleLine | web/api/pos.ts:35 | PosSaleLineDto | api/src/pos/dto/pos.dto.ts:55 | request DTO | yes | yes (component schema) | same fields |
| 209 | StockDeductionReport | web/api/pos.ts:43 | explicit server type StockDeductionReport (apps/api/src/pos/pos.service.ts:63); inferred return of POST /pos/sales .stockDeduction | api/src/pos/pos.controller.ts:61 | response shape | yes | no (no response schema in doc) | server returns 5 field(s) the web type omits |
| 210 | PosClearance | web/api/pos.ts:57 | inferred return of POST /pos/sales .clearance | api/src/pos/pos.controller.ts:61 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 211 | PosSaleResponse | web/api/pos.ts:62 | inferred return of POST /pos/sales (+1 more pairings) | api/src/pos/pos.controller.ts:61 | response shape | yes | no (no response schema in doc) | web-required but absent from every paired server type: relatedInvoice,replacesInvoice,replacedBy,outstanding,creditedTotal · web-optional absent: invoiceType? · server returns 30 field(s) the web type omits · Decimal→web string ×3 · Date→web string ×3 |
| 212 | PosOfflineIncidents | web/api/pos.ts:77 | inferred return of GET /pos/incidents | api/src/pos/pos.controller.ts:36 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 213 | Product | web/api/products.ts:4 | Prisma model Product (apps/api/prisma/schema.prisma:2343); inferred return of GET /inventory/movements .items .product (+7 more pairings) | api/src/inventory/inventory.controller.ts:72 | response shape | yes | no (no response schema in doc) | server returns 5 field(s) the web type omits · Decimal→web string ×3 · web X[] vs server T[] \| Paged<T> |
| 214 | ProductInput | web/api/products.ts:28 | CreateProductDto / UpdateProductDto (body typed Partial<ProductInput>) | api/src/products/dto/create-product.dto.ts:3 / apps/api/src/products/dto/update-product.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 215 | Ownership | web/api/properties.ts:3 | server const array OWNERSHIP_TYPES | api/src/properties/dto/create-property.dto.ts:3 | enum (literal set) | yes | yes (inline enum at CreatePropertyDto.ownership; no named schema) | values identical · name differs (OWNERSHIP_TYPES) |
| 216 | ActivityType | web/api/properties.ts:4 | server const array ACTIVITY_TYPES | api/src/properties/dto/create-property.dto.ts:4 | enum (literal set) | yes | yes (inline enum at CreatePropertyDto.activityType; no named schema) | values identical · name differs (ACTIVITY_TYPES) |
| 217 | Property | web/api/properties.ts:6 | Prisma model Property (apps/api/prisma/schema.prisma:3043); inferred return of GET /properties (+3 more pairings) | api/src/properties/properties.controller.ts:20 | response shape | yes | no (no response schema in doc) | server returns 4 field(s) the web type omits · Decimal→web string \| null ×2 · Date→web string ×2 · web X[] vs server T[] \| Paged<T> |
| 218 | PropertyInput | web/api/properties.ts:25 | CreatePropertyDto / UpdatePropertyDto (body typed Partial<PropertyInput>) | api/src/properties/dto/create-property.dto.ts:6 / apps/api/src/properties/dto/update-property.dto.ts:4 | request DTO | yes | yes (component schema) | same fields |
| 219 | PurchaseDocType | web/api/purchases.ts:6 | Prisma enum PurchaseDocType | api/prisma/schema.prisma:1776 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 220 | Purchase | web/api/purchases.ts:8 | Prisma model Purchase (apps/api/prisma/schema.prisma:1788); inferred return of GET /purchases (+4 more pairings) | api/src/purchases/purchases.controller.ts:108 | response shape | yes | no (no response schema in doc) | absent on some routes: allocated@POST /purchases, credited@POST /purchases, remaining@POST /purchases (+9) · server returns 12 field(s) the web type omits · Decimal→web string ×3 · Date→web string ×3 |
| 221 | PurchaseStatus | web/api/purchases.ts:44 | Prisma enum PurchaseStatus | api/prisma/schema.prisma:1767 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 222 | CreatePurchaseInput | web/api/purchases.ts:46 | CreatePurchaseDto | api/src/purchases/dto/create-purchase.dto.ts:8 | request DTO | yes | yes (component schema) | dto-only: currency,exchangeRate,inputVatUse,lines,warehouseId,receiveNow |
| 223 | UpdatePurchaseInput | web/api/purchases.ts:67 | UpdatePurchaseDto | api/src/purchases/dto/update-purchase.dto.ts:8 | request DTO | yes | yes (component schema) | dto-only: currency,exchangeRate,lines,warehouseId,inputVatUse |
| 224 | SupplierNoteLineInput | web/api/purchases.ts:75 | SupplierNoteLineDto | api/src/purchases/dto/create-supplier-note.dto.ts:9 | request DTO | yes | yes (component schema) | same fields |
| 225 | SupplierNoteInput | web/api/purchases.ts:86 | CreateSupplierNoteDto | api/src/purchases/dto/create-supplier-note.dto.ts:43 | request DTO | yes | yes (component schema) | same fields |
| 226 | IncorporationReport | web/api/purchases.ts:99 | inferred return of GET /purchases/incorporation-report | api/src/purchases/purchases.controller.ts:102 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 227 | PurchaseAttachment | web/api/purchases.ts:109 | Prisma model PurchaseAttachment (apps/api/prisma/schema.prisma:4127); inferred return of GET /purchases/{purchaseId}/attachments (+1 more pairings) | api/src/purchases/purchases.controller.ts:131 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 228 | QuoteStatus | web/api/quotes.ts:5 | Prisma enum QuoteStatus | api/prisma/schema.prisma:4519 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 229 | DerivedQuoteStatus | web/api/quotes.ts:7 | server literal union DerivedQuoteStatus | api/src/quotes/quotes.service.ts:64 | enum (literal set) | yes | no (value set not in doc) | values identical · note: same composition QuoteStatus \| EXPIRED (composite, so the value-set index missed it) |
| 230 | QuoteLine | web/api/quotes.ts:9 | Prisma model QuoteLine (apps/api/prisma/schema.prisma:4586); inferred return of GET /quotes/{id} .lines (+3 more pairings) | api/src/quotes/quotes.controller.ts:29 | response shape | yes | no (no response schema in doc) | server returns 6 field(s) the web type omits · Decimal→web string ×3 |
| 231 | Quote | web/api/quotes.ts:21 | Prisma model Quote (apps/api/prisma/schema.prisma:4529); inferred return of GET /quotes (+4 more pairings) | api/src/quotes/quotes.controller.ts:23 | response shape | yes | no (no response schema in doc) | absent on some routes: customer@GET /quotes, lines@GET /quotes, derivedStatus@POST /quotes (+1) · server returns 7 field(s) the web type omits · Decimal→web string ×3 · Date→web string ×4 · web X[] vs server T[] \| Paged<T> |
| 232 | QuoteLineInput | web/api/quotes.ts:42 | QuoteLineDto | api/src/quotes/dto/quote.dto.ts:6 | request DTO | yes | yes (component schema) | dto-only: productId,discount,taxRate · required-ness: taxCategory (web required, dto ?) |
| 233 | QuoteInput | web/api/quotes.ts:52 | CreateQuoteDto | api/src/quotes/dto/quote.dto.ts:54 | request DTO | yes | yes (component schema) | dto-only: currency,exchangeRate |
| 234 | ReminderChannel | web/api/reminders.ts:5 | Prisma enum ReminderChannel | api/prisma/schema.prisma:3308 | enum (literal set) | yes | yes (inline enum at SendReminderDto.channel; no named schema) | values identical |
| 235 | ReminderPolicy | web/api/reminders.ts:7 | UpdateReminderPolicyDto (body typed Partial<ReminderPolicy>) | api/src/reminders/dto/reminder.dto.ts:8 | request DTO (+also in a response) | yes | yes (component schema) | same fields |
| 236 | DueReminder | web/api/reminders.ts:19 | inferred return of GET /reminders/due .reminders | api/src/reminders/reminders.controller.ts:32 | response shape | yes | no (no response schema in doc) | Decimal→web string ×1 · Date→web string ×2 · nullability: lastSentAt: server non-null, web \|null |
| 237 | DueReminders | web/api/reminders.ts:37 | inferred return of GET /reminders/due | api/src/reminders/reminders.controller.ts:32 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 238 | SentReminder | web/api/reminders.ts:46 | inferred return of POST /reminders/installments/{installmentId}/send (+1 more pairings) | api/src/reminders/reminders.controller.ts:38 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits · Date→web string ×1 |
| 239 | ReportLine | web/api/reports.ts:8 | inferred return of GET /reports/income-statement .revenue (+4 more pairings) | api/src/reports/reports.controller.ts:48 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 240 | IncomeStatement | web/api/reports.ts:14 | inferred return of GET /reports/income-statement | api/src/reports/reports.controller.ts:48 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 241 | BalanceSheet | web/api/reports.ts:25 | inferred return of GET /reports/balance-sheet | api/src/reports/reports.controller.ts:54 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 242 | CashFlow | web/api/reports.ts:36 | inferred return of GET /reports/cash-flow | api/src/reports/reports.controller.ts:60 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 243 | ReportRange | web/api/reports.ts:50 | ReportRangeDto | api/src/reports/dto/report-range.dto.ts:3 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 244 | PropertyOccupancy | web/api/reports.ts:55 | inferred return of GET /reports/property-kpis .occupancy | api/src/reports/reports.controller.ts:42 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 245 | PropertyKpis | web/api/reports.ts:68 | inferred return of GET /reports/property-kpis | api/src/reports/reports.controller.ts:42 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 246 | DashboardSummary | web/api/reports.ts:96 | inferred return of GET /reports/dashboard | api/src/reports/reports.controller.ts:35 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 247 | BankDifference | web/api/reports.ts:113 | inferred return of GET /reports/bank-difference | api/src/reports/reports.controller.ts:78 | response shape | yes | no (no response schema in doc) | nullability: rows: server non-null, web \|null |
| 248 | DeferredRevenue | web/api/reports.ts:135 | inferred return of GET /reports/deferred-revenue | api/src/reports/reports.controller.ts:71 | response shape | yes | no (no response schema in doc) | nullability: outstanding: server non-null, web \|null |
| 249 | TrialBalanceRow | web/api/reports.ts:154 | inferred return of GET /reports/trial-balance .rows | api/src/reports/reports.controller.ts:129 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 250 | TrialBalance | web/api/reports.ts:163 | inferred return of GET /reports/trial-balance | api/src/reports/reports.controller.ts:129 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 251 | AgingRow | web/api/reports.ts:190 | explicit server type ExposureRow (apps/api/src/reports/receivables-exposure.util.ts:48); inferred return of GET /reports/receivables-aging .rows | api/src/reports/reports.controller.ts:100 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 252 | RentAgingRow | web/api/reports.ts:204 | explicit server type RentReceivableRow (apps/api/src/reports/receivables-exposure.util.ts:74); inferred return of GET /reports/receivables-aging .rentRows | api/src/reports/reports.controller.ts:100 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 253 | AgingReport | web/api/reports.ts:218 | inferred return of GET /reports/receivables-aging | api/src/reports/reports.controller.ts:100 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 254 | AgingParams | web/api/reports.ts:230 | AgingDto | api/src/reports/dto/report-range.dto.ts:26 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 255 | LedgerRow | web/api/reports.ts:251 | explicit server type LedgerRow (apps/api/src/reports/ledger.util.ts:49); inferred return of GET /reports/ledger .rows (+1 more pairings) | api/src/reports/reports.controller.ts:136 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 256 | LedgerReport | web/api/reports.ts:271 | inferred return of GET /reports/ledger | api/src/reports/reports.controller.ts:136 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits |
| 257 | StatementReport | web/api/reports.ts:286 | inferred return of GET /reports/statement | api/src/reports/reports.controller.ts:154 | response shape | yes | no (no response schema in doc) | nullability: account: server non-null, web \|null |
| 258 | LedgerParams | web/api/reports.ts:290 | LedgerDto | api/src/reports/dto/report-range.dto.ts:49 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 259 | StatementParams | web/api/reports.ts:298 | StatementDto | api/src/reports/dto/report-range.dto.ts:64 | query-string DTO | yes | yes (operation query parameters) | same parameter names as the doc (measured) |
| 260 | ReservationStatus | web/api/reservations.ts:4 | Prisma enum ReservationStatus | api/prisma/schema.prisma:3159 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 261 | Reservation | web/api/reservations.ts:6 | Prisma model Reservation (apps/api/prisma/schema.prisma:3171); inferred return of GET /reservations (+2 more pairings) | api/src/reservations/reservations.controller.ts:18 | response shape | yes | no (no response schema in doc) | absent on some routes: unit@GET /reservations · server returns 2 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×2 · web X[] vs server T[] \| Paged<T> |
| 262 | ReservationInput | web/api/reservations.ts:18 | CreateReservationDto | api/src/reservations/dto/create-reservation.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 263 | ScriptAudience | web/api/scripts.ts:3 | Prisma enum ScriptAudience | api/prisma/schema.prisma:5758 | enum (literal set) | yes | yes (inline enum at CreateScriptDto.audience; no named schema) | values identical |
| 264 | MessageScript | web/api/scripts.ts:5 | Prisma model MessageScript (apps/api/prisma/schema.prisma:5773); inferred return of GET /scripts (+3 more pairings) | api/src/scripts/scripts.controller.ts:20 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 265 | ScriptInput | web/api/scripts.ts:14 | CreateScriptDto / UpdateScriptDto (body typed Partial<ScriptInput>) | api/src/scripts/dto/create-script.dto.ts:5 / apps/api/src/scripts/dto/update-script.dto.ts:4 | request DTO | yes | yes (component schema) | same fields |
| 266 | SubscriptionStatus | web/api/subscription.ts:3 | inferred return of GET /subscription (+1 more pairings) | api/src/subscription/subscription.controller.ts:27 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 267 | SupplierPaymentMethod | web/api/supplierPayments.ts:6 | DTO @IsIn literal RecordPaymentDto.method | api/src/contracts/dto/record-payment.dto.ts:4 | enum (literal set) | yes | yes (inline enum at RefundDto.method; no named schema) | values identical · name differs (method) · FIELD DRIFT: SupplierPayment.method vs Prisma PaymentMethod: server-only ["CARD"] |
| 268 | SupplierPaymentAllocation | web/api/supplierPayments.ts:8 | Prisma model SupplierPaymentAllocation (apps/api/prisma/schema.prisma:4921); inferred return of GET /supplier-payments .allocations (+3 more pairings) | api/src/purchases/supplier-payments.controller.ts:25 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Decimal→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 269 | SupplierPayment | web/api/supplierPayments.ts:16 | Prisma model SupplierPayment (apps/api/prisma/schema.prisma:4856); inferred return of GET /supplier-payments (+3 more pairings) | api/src/purchases/supplier-payments.controller.ts:25 | response shape | yes | no (no response schema in doc) | server returns 2 field(s) the web type omits · Decimal→web string ×2 · Date→web string ×2 · enum: method: Prisma PaymentMethod — web-only [] / server-only ["CARD"] · web X[] vs server T[] \| Paged<T> |
| 270 | OpenPurchase | web/api/supplierPayments.ts:41 | inferred return of GET /supplier-payments/open-purchases/{supplierId} | api/src/purchases/supplier-payments.controller.ts:32 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×2 · enum: status: Prisma PurchaseStatus — web types it as string |
| 271 | SupplierAllocationInput | web/api/supplierPayments.ts:56 | SupplierAllocationDto | api/src/purchases/dto/supplier-payment.dto.ts:6 | request DTO | yes | yes (component schema) | same fields |
| 272 | SupplierPaymentInput | web/api/supplierPayments.ts:61 | CreateSupplierPaymentDto | api/src/purchases/dto/supplier-payment.dto.ts:21 | request DTO | yes | yes (component schema) | same fields |
| 273 | Supplier | web/api/suppliers.ts:4 | Prisma model Supplier (apps/api/prisma/schema.prisma:1724); inferred return of GET /purchases .supplier (+8 more pairings) | api/src/purchases/purchases.controller.ts:108 | response shape | yes | no (no response schema in doc) | server returns 4 field(s) the web type omits |
| 274 | SupplierInput | web/api/suppliers.ts:13 | CreateSupplierDto / UpdateSupplierDto (body typed Partial<SupplierInput>) | api/src/suppliers/dto/create-supplier.dto.ts:3 / apps/api/src/suppliers/dto/update-supplier.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 275 | SupplierSummary | web/api/suppliers.ts:26 | inferred return of GET /suppliers/{id}/summary | api/src/suppliers/suppliers.controller.ts:28 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 276 | SupportGrantStatus | web/api/supportAccess.ts:3 | Prisma enum SupportGrantStatus | api/prisma/schema.prisma:4438 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 277 | SupportGrant | web/api/supportAccess.ts:5 | inferred return of GET /support-access/admin (+5 more pairings) | api/src/support-access/support-access.controller.ts:52 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×4 · web X[] vs server T[] \| Paged<T> |
| 278 | SupportLogLine | web/api/supportAccess.ts:25 | inferred return of GET /support-access/log | api/src/support-access/support-access.controller.ts:79 | response shape | yes | no (no response schema in doc) | web-required but absent from every paired server type: grant · server returns 3 field(s) the web type omits · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 279 | TaskStatus | web/api/tasks.ts:11 | server const array TASK_STATUSES | api/src/tasks/task-model.ts:60 | enum (literal set) | yes | yes (inline enum at TransitionTaskDto.to; no named schema) | values identical · name differs (TASK_STATUSES) |
| 280 | TaskPriority | web/api/tasks.ts:13 | Prisma enum TaskPriority | api/prisma/schema.prisma:5832 | enum (literal set) | yes | yes (inline enum at CreateMaintenanceDto.priority; no named schema) | values identical |
| 281 | TaskAssigneeKind | web/api/tasks.ts:18 | Prisma enum TaskAssigneeKind | api/prisma/schema.prisma:5885 | enum (literal set) | yes | yes (inline enum at CreateTaskDto.assigneeKind; no named schema) | values identical |
| 282 | TaskLogLine | web/api/tasks.ts:21 | explicit server type TaskLogView (apps/api/src/tasks/tasks.service.ts:65); inferred return of GET /tasks/{id}/log | api/src/tasks/tasks.controller.ts:73 | response shape | yes | no (no response schema in doc) | Date→web string ×1 |
| 283 | TaskTarget | web/api/tasks.ts:31 | explicit server type TaskTarget (apps/api/src/tasks/task-visibility.ts:24); inferred return of GET /tasks/mine .target (+3 more pairings) | api/src/tasks/tasks.controller.ts:45 | response shape | yes | no (no response schema in doc) | web X[] vs server T[] \| Paged<T> |
| 284 | MyTask | web/api/tasks.ts:36 | inferred return of GET /tasks/mine (+3 more pairings) | api/src/tasks/tasks.controller.ts:45 | response shape | yes | no (no response schema in doc) | Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 285 | TaskCounters | web/api/tasks.ts:55 | explicit server type TaskCounters (apps/api/src/tasks/tasks.service.ts:90); inferred return of GET /tasks/counters | api/src/tasks/tasks.controller.ts:51 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 286 | CreateTaskInput | web/api/tasks.ts:60 | CreateTaskDto | api/src/tasks/dto/create-task.dto.ts:11 | request DTO | yes | yes (component schema) | same fields |
| 287 | ScreenActionMap | web/api/templates.ts:52 | server type ScreenActionMap | api/src/templates/screens.ts:46 | response shape | yes | no (no response schema in doc) | mapped Record type; same-name exported server type |
| 288 | PermissionTemplate | web/api/templates.ts:54 | Prisma model PermissionTemplate (apps/api/prisma/schema.prisma:277); inferred return of GET /companies .permissionTemplate (+8 more pairings) | api/src/companies/companies.controller.ts:27 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · Date→web string ×1 · web X[] vs server T[] \| Paged<T> |
| 289 | TemplateInput | web/api/templates.ts:66 | CreateTemplateDto / UpdateTemplateDto (body typed Partial<TemplateInput>) | api/src/templates/dto/create-template.dto.ts:4 / apps/api/src/templates/dto/update-template.dto.ts:4 | request DTO | yes | yes (component schema) | same fields |
| 290 | BankTx | web/api/transactions.ts:4 | inferred return of GET /transactions .items (+2 more pairings) | api/src/transactions/transactions.controller.ts:19 | response shape | yes | no (no response schema in doc) | server returns 8 field(s) the web type omits · Decimal→web string ×1 · Date→web string ×1 |
| 291 | TransactionInput | web/api/transactions.ts:17 | CreateTransactionDto / UpdateTransactionDto (body typed Partial<TransactionInput>) | api/src/transactions/dto/create-transaction.dto.ts:4 / apps/api/src/transactions/dto/update-transaction.dto.ts:4 | request DTO | yes | yes (component schema) | dto-only: currency,exchangeRate,currency [UpdateTransactionDto],exchangeRate [UpdateTransactionDto] |
| 292 | BankTxListResponse | web/api/transactions.ts:27 | explicit server type Paged (apps/api/src/common/pagination/paged.util.ts:6); inferred return of GET /transactions | api/src/transactions/transactions.controller.ts:19 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 293 | TrashItem | web/api/trash.ts:3 | inferred return of GET /trash .groups .items | api/src/trash/trash.controller.ts:20 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 294 | TrashGroup | web/api/trash.ts:16 | inferred return of GET /trash .groups | api/src/trash/trash.controller.ts:20 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 295 | TrashList | web/api/trash.ts:22 | inferred return of GET /trash | api/src/trash/trash.controller.ts:20 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 296 | UnitStatus | web/api/units.ts:3 | server literal union UnitStatus | api/src/units/units.service.ts:15 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 297 | Unit | web/api/units.ts:5 | Prisma model Unit (apps/api/prisma/schema.prisma:3111); inferred return of GET /contracts .items .unit (+21 more pairings) | api/src/contracts/contracts.controller.ts:36 | response shape | yes | no (no response schema in doc) | absent on some routes: status@GET /contracts, currentTenant@GET /contracts, reservedBy@GET /contracts (+81) · server returns 5 field(s) the web type omits · Decimal→web string ×1 |
| 298 | UnitInput | web/api/units.ts:23 | CreateUnitDto / UpdateUnitDto (body typed Partial<Omit<UnitInput, 'propertyId' \| 'unitNo'>>) | api/src/units/dto/create-unit.dto.ts:3 / apps/api/src/units/dto/update-unit.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 299 | Warehouse | web/api/warehouses.ts:3 | Prisma model Warehouse (apps/api/prisma/schema.prisma:5231); inferred return of GET /inventory/movements .items .warehouse (+10 more pairings) | api/src/inventory/inventory.controller.ts:72 | response shape | yes | no (no response schema in doc) | absent on some routes: itemCount@GET /inventory/movements, totalQty@GET /inventory/movements, itemCount@POST /inventory/movements (+11) · server returns 4 field(s) the web type omits |
| 300 | WarehouseInput | web/api/warehouses.ts:13 | CreateWarehouseDto / UpdateWarehouseDto (body typed Partial<WarehouseInput>) | api/src/warehouses/dto/create-warehouse.dto.ts:3 / apps/api/src/warehouses/dto/update-warehouse.dto.ts:3 | request DTO | yes | yes (component schema) | same fields |
| 301 | WarrantyCore | web/api/warranties.ts:4 | inferred return of POST /warranties (+1 more pairings) | api/src/warranties/warranties.controller.ts:42 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · Date→web string ×4 |
| 302 | Warranty | web/api/warranties.ts:29 | Prisma model Warranty (apps/api/prisma/schema.prisma:3541); inferred return of GET /warranties | api/src/warranties/warranties.controller.ts:20 | response shape | yes | no (no response schema in doc) | web-required but absent from every paired server type: property,unit,supplier,_count · server returns 1 field(s) the web type omits · Date→web string ×4 · web X[] vs server T[] \| Paged<T> |
| 303 | WarrantyInput | web/api/warranties.ts:34 | CreateWarrantyDto | api/src/warranties/dto/warranty.dto.ts:7 | request DTO | yes | yes (component schema) | same fields |
| 304 | WarrantyUpdate | web/api/warranties.ts:48 | UpdateWarrantyDto | api/src/warranties/dto/warranty.dto.ts:50 | request DTO | yes | yes (component schema) | dto-only: subject,unitId,provider,supplierId,startDate,endDate,reference,terms,notes |
| 305 | ZatcaOnboardingStatus | web/api/zatca.ts:3 | Prisma enum ZatcaOnboardingStatus | api/prisma/schema.prisma:106 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 306 | ZatcaOnboarding | web/api/zatca.ts:7 | inferred return of GET /zatca/onboarding (+3 more pairings) | api/src/zatca/zatca.controller.ts:27 | response shape | yes | no (no response schema in doc) | server returns 3 field(s) the web type omits · Date→web string ×1 |
| 307 | ZatcaSubmissionResult | web/api/zatca.ts:29 | inferred return of POST /zatca/invoices/{id}/submit | api/src/zatca/zatca.controller.ts:53 | response shape | yes | no (no response schema in doc) | server returns 1 field(s) the web type omits · Date→web string ×1 |
| 308 | ZatcaUnreported | web/api/zatca.ts:45 | inferred return of GET /zatca/unreported | api/src/zatca/zatca.controller.ts:60 | response shape | yes | no (no response schema in doc) | Date→web string ×1 · nullability: oldestIssueDate: server non-null, web \|null; items: server non-null, web \|null |
| 309 | LoginResponse | web/auth/AuthContext.tsx:4 | inferred return of POST /auth/login (+1 more pairings) | api/src/auth/auth.controller.ts:26 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 310 | Grant | web/auth/PermissionsContext.tsx:38 | server type Grant | api/src/delegations/permission-tree.ts:108 | response shape | yes | no (no response schema in doc) | string alias; same-name server type |
| 311 | ExtinctionReason | web/auth/PermissionsContext.tsx:40 | server literal union ExtinctionReason | api/src/delegations/extinguished.ts:34 | enum (literal set) | yes | no (value set not in doc) | values identical |
| 312 | ExtinguishedGrant | web/auth/PermissionsContext.tsx:43 | explicit server type ExtinguishedGrant (apps/api/src/delegations/extinguished.ts:36); inferred return of GET /delegations/{granteeId} .extinguished (+1 more pairings) | api/src/delegations/delegations.controller.ts:54 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 313 | ChainView | web/auth/PermissionsContext.tsx:51 | explicit server type ChainView (apps/api/src/delegations/permissions.service.ts:40); inferred return of GET /me/permissions .chains | api/src/delegations/permissions.controller.ts:32 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 314 | TreeNode | web/auth/PermissionsContext.tsx:55 | explicit server type TreeNode (apps/api/src/delegations/permission-tree.ts:26); inferred return of GET /me/permissions .tree (+1 more pairings) | api/src/delegations/permissions.controller.ts:32 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 315 | MePermissions | web/auth/PermissionsContext.tsx:62 | explicit server type MePermissions (apps/api/src/delegations/permissions.service.ts:19); inferred return of GET /me/permissions | api/src/delegations/permissions.controller.ts:32 | response shape | yes | no (no response schema in doc) | no field-level difference found |
| 316 | MoneyText | web/lib/money.ts:41 | — |  | web-only encoding alias | no | no | MoneyText = string — web convention for serialized Decimal; no server type |
| 317 | PercentText | web/lib/money.ts:44 | — |  | web-only encoding alias | no | no | PercentText = string — web convention; no server type |
| 318 | DeclarableTaxCategory | web/lib/vat.ts:22 | server const array DECLARABLE_TAX_CATEGORIES | api/src/common/vat/line-tax.util.ts:45 | enum (literal set) | yes | yes (inline enum at InvoiceLineDto.taxCategory; no named schema) | values identical · name differs (DECLARABLE_TAX_CATEGORIES) |
| 319 | TaxCategory | web/lib/vat.ts:23 | Prisma enum TaxCategory | api/prisma/schema.prisma:3233 | enum (literal set) | yes | no (value set not in doc) | values identical |
