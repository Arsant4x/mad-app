# الدعوى (أ) — حقنُ العميل والصنف بين المنشآت

> **الشجرةُ المقروءة:** `D:\worktrees\outbox-266` — رأسُها `eda979a2` (`main` مع تغييرٍ في الطابور لا يمسّ الموضوع)، والشجرةُ نظيفة (`git status --short` فارغ).
> **الحدُّ:** قراءةٌ وبحثٌ فقط — لا اختبار ولا `prisma` ولا قاعدة. كلُّ حكمٍ هنا **بالقراءة**، وما يحتاج قياساً حيّاً مسمّىً في §٤ و§٦.
> **أداتان للقراءة كُتبتا في مجلد الجلسة المؤقّت ولم تمسّا المستودع:** `fkscan.mjs` (يحلّل `schema.prisma` ويعدّ كلَّ مفتاحٍ مفردٍ من نموذجٍ للمستأجر إلى نموذجٍ للمستأجر ويسأل: أله أخٌ مركّب؟) و`nofk.mjs` (يسرد أعمدة `…Id` على نماذج المستأجر بلا أيّ علاقة). **مصادقةُ المسبار الأول:** عدّ `186` مفتاحاً مركّباً، ويطابقه `grep -c "fields: \[companyId, [a-zA-Z]*\], references: \[companyId, id\]" schema.prisma` = **`186`**؛ وحالةٌ يجب أن يجدها (`marketing_consents.customerId`) وجدها، وحالةٌ يجب ألّا يجدها (`invoices.customerId`) لم يسردها.

---

## (1) الدعوى بنصّها

> «أ. حقنُ العميل والصنف بين المنشآت (المتوقَّعُ ساقطٌ بالمفتاح المركّب، فأثبته).» — هل تستطيع المنشأةُ أ أن تكتب في مستنداتها (فواتير · عروض · مشتريات · بيع كاشير · عقود · حركات مخزون…) معرّفَ عميلٍ أو صنفٍ (أو أيّ معرّفٍ مملوكٍ لمستأجر) يخصّ المنشأةَ ب عبر الـAPI؟

---

## (2) ما تقوله الشيفرة اليوم — بالموضع

### ٢-١ لماذا كانت الدعوى ممكنةً أصلاً (الآلية)

- كلُّ كتابةٍ للمستأجر تجري في `runInTenantContext` — امتدادُ الحقن يضع `companyId` في الصفّ، و`set_config('app.company_id', …)` يجعل RLS يرفض صفّاً لغير المنشأة (`apps/api/src/common/tenant/tenant-prisma.service.ts:11-18` و`:46-61`). **فالصفُّ نفسُه صفُّ أ دائماً** — والسؤالُ هو **المعرّفُ الذي يشير إليه**.
- المفتاحُ المفرد (`customerId → customers.id`) **لا يسأل عن المنشأة**، وفحصُ السلامة المرجعية في Postgres **يتجاوز RLS** (سلوكٌ موثَّقٌ لـPostgres، لا من هذا المستودع — انظر §٧). فقبل `ق-١٢٥٢` كان المفردُ يقبل معرّفَ ب ما دام موجوداً في أيّ منشأة، والطبقةُ الوحيدة هي فحصُ الخدمة.
- **`ق-١٢٥٢`** (`docs/decisions.md:3330`): «المفتاحُ المركّب `(companyId, id)` يُبنى بجانب القائم لا بدلَه … بلا فعلٍ عند الحذف (`NO ACTION`) … (ب) إدراجُ معرّفِ منشأةٍ أخرى يُرفض». ونتائجُه (`docs/decisions.md:3334`): **`150`** قيداً في أربع دفعات، و«المستثنى معلَن: `company_user_branches` … و`permission_templates`».

### ٢-٢ المفاتيح المركّبة على `customerId` و`productId` (و`supplierId`) — بالموضع

كلُّها في الدفعة ① `apps/api/prisma/migrations/20260921190000_composite_fk_b1_parties_references/migration.sql` (رأسُها `:1-5`: «بلا فعلٍ … المركّبُ حارسُ كتابةٍ يرفض معرّفَ منشأةٍ أخرى … صفرُ صفٍّ عابر في ٥٦ مفتاحاً»)، والهدفُ `customers_companyId_id_key` (`:26`) و`products_companyId_id_key` (`:41`) و`suppliers_companyId_id_key` (`:44`)، وفي المخطّط `@@unique([companyId, id])` على `Customer` (`schema.prisma:1342`).

| الجدول.العمود | المركّب في المخطّط | القيد في الهجرة ① | الحكم |
|---|---|---|---|
| `invoices.customerId` | `schema.prisma:1406` | `:62` | ✅ |
| `quotes.customerId` | `schema.prisma:4908` | `:158` | ✅ |
| `payments.customerId` | `schema.prisma:5109` | `:167` | ✅ |
| `contracts.customerId` | `schema.prisma:4152` | `:143` | ✅ |
| `journal_lines.customerId` | `schema.prisma:3233` | `:128` | ✅ |
| **`marketing_consents.customerId`** | **لا يوجد** — مفردٌ فقط `schema.prisma:1370` | الهجرة `20260923170000_marketing_consent/migration.sql:39-40` مفردٌ `CASCADE` وحده | ❌ **بلا مركّب** |
| `invoice_lines.productId` | `schema.prisma:1699` | `:71` | ✅ |
| `quote_lines.productId` | `schema.prisma:4977` | `:164` | ✅ |
| `purchase_lines.productId` | `schema.prisma:1987` | `:80` | ✅ |
| `stock_movements.productId` | `schema.prisma:5729` | `:188` | ✅ |
| `inventory_layers.productId` | `schema.prisma:5898` | `:200` | ✅ |
| `stock_batches.productId` | `schema.prisma:5986` | `:206` | ✅ |
| `inventory_write_offs.productId` | `schema.prisma:6208` | `:215` | ✅ |
| **`stock_opening_lines.productId` · `warehouseId`** | **لا علاقةَ إطلاقاً** — عمودان نصّيان `schema.prisma:2492-2493` | — | ❌ **بلا مفتاحٍ أصلاً** (مفردٍ ولا مركّب) |
| `purchases.supplierId` | `schema.prisma:1832` | `:74` | ✅ |
| `supplier_payments.supplierId` | `schema.prisma:5239` | `:176` | ✅ |
| `journal_lines.supplierId` | `schema.prisma:3240` | `:131` | ✅ |
| `warranties.supplierId` | `schema.prisma:3787` | `:140` | ✅ |

**المسحُ الكامل للمفاتيح المفردة بين نماذج المستأجر** (`fkscan.mjs`): `191` مفتاحاً، منها `186` لها أخٌ مركّب و**`5` بلا مركّب**:

| المفتاحُ بلا مركّب | الموضع | ما يسدّه اليوم |
|---|---|---|
| `marketing_consents.customerId → Customer` | `schema.prisma:1370` | فحصُ الخدمة وحده (`customers.service.ts:226-227`) |
| `company_users.loginIdentityId → LoginIdentity` | `schema.prisma:607` | مُشغِّلُ `company_users_identity_follows` كما يقول تعليقُ `company-users.service.ts:108-109` (لم أقرأ نصَّ المشغِّل — §٧) |
| `company_users.permissionTemplateId → PermissionTemplate` | `schema.prisma:618` | الأصلُ ثنائيُّ النطاق (قوالبُ عامّة `companyId NULL`) فالمركّبُ مستحيلٌ بنيوياً — مستثنىً معلَنٌ في `ق-١٢٥٦`؛ والخدمةُ تفحص: `company-users.service.ts:74-77` و`:131-136` |
| `api_keys.permissionTemplateId → PermissionTemplate` | `schema.prisma:833` | السببُ نفسُه؛ والخدمةُ تفحص `OR: [{ companyId }, { companyId: null }]` — `api-keys.service.ts:104` |
| `support_access_logs.grantId → SupportAccessGrant` | `schema.prisma:4871` | خارجُ الموضوع (كتابةُ المنصّة) — لم يُفحص |

و`nofk.mjs` سرد أعمدةَ `…Id` بلا أيّ علاقة على نماذج المستأجر؛ الداخلُ في الموضوع منها: `stock_opening_lines.productId`/`warehouseId` (`schema.prisma:2492-2493`) و`tasks.targetId` (`schema.prisma:6430` — مرجعٌ متعدّدُ الأشكال لا يقبل مفتاحاً)؛ والباقي معرّفاتُ فاعلين (`actorId` · `createdById` …) خارجَ الموضوع.

### ٢-٣ الحارسُ القائم — ماذا يُثبت وماذا لا

`apps/api/test/composite-fk-guard.e2e-spec.ts`:
- ① (`:77-107`) يطابق **ما أُعلن مركّباً في المخطّط** بما في الكتالوج في الاتجاهين، ويطبع العدد. **لا يسأل: أكلُّ مفردٍ بين مستأجرَين له مركّب؟** — فعلاقةٌ جديدة تُكتب بمفردٍ وحده (كما وقع في `marketing_consents` بعد الدفعات بيومين: `20260923170000`) **تمرّ من الحارس صامتة**.
- ②–⑤ (`:110-128` · `:142-238`) تُثبت الرفضَ `23503` باسم القيد بكتابةٍ خامٍ `UPDATE` داخل سياق أ — **على مستوى القاعدة لا عبر الـAPI**.
- **بحثٌ عن اختبار API يرسل معرّفَ ب في جسم طلب أ:** `grep -lnE "customerId: (b|companyB|other|foreign)\w*\.|productId: (b|companyB|other|foreign)\w*\." apps/api/test/*.ts` ⟵ ملفٌّ واحد `customer-kind.e2e-spec.ts:146` وهو **مشترٍ أجنبيّ (تصدير)** لا منشأةٌ أخرى. **ومسبارُ التحكّم** `grep -lnE "customerId: (a|customerA|cust)\w*"` ⟵ يجد ثلاثة ملفات. **والسابقةُ الوحيدة التي وُجدت بالبحث عن «cross tenant»:** `journal-tenant-isolation.e2e-spec.ts:107-120` — قيدٌ يدويّ من ب على حسابات أ ⟵ `404` ولا صفّ. ⚠️ **حدُّ البحث:** بالتسمية؛ اختبارٌ بأسماء متغيّراتٍ أخرى قد يفوته.

### ٢-٤ طبقةُ الخدمة — مسارٌ مسارٌ (من يرفض معرّفَ ب قبل القاعدة؟)

**القاعدةُ في القراءة:** `tx.<model>.findUnique({ where: { id } })` داخل `runInTenantContext` ⟵ RLS يُخفي صفَّ ب ⟵ `null` ⟵ رفضٌ مسمّى. وحيث لا قراءةَ قبل الكتابة، **المركّبُ وحده يرفض** ⟵ خطأ `Prisma` ليس `HttpException` ⟵ **`500` عامّ** (`apps/api/src/common/i18n/http-exception.filter.ts:25-26` و`:46-56`)، و`retryOnUniqueConflict` يعيد رميه كما هو (`common/retry-on-conflict.util.ts:40-41` و`:53-62` — `P2002` وحده يُعاد).

| المسار | المعرّف | فحصُ الخدمة | الناتجُ المتوقَّع بالقراءة |
|---|---|---|---|
| `POST /invoices` | `customerId` | `assertBuyerKindDeclared` — `customers/buyer-kind.util.ts:19-20` (من `invoices.service.ts:550`، **قبل** الترقيم `:558`) | `404 customer_not_found` |
| `POST /invoices` | `lines[].productId` | `priceLines` ⟵ `resolveLineTax`: «صنفٌ لا يُرى (غيرُ موجود أو لمنشأةٍ أخرى) يُردّ باسمه» — `common/vat/line-tax.util.ts:117-131` | `400 product_not_found` |
| `PATCH /invoices/:id` | `customerId` | كلُّ `customerId` يُعدّ «محتوى موقَّعاً» فيُرفض لكلِّ صادرة `409` (`invoices.service.ts:737-773`)؛ فسطرُ `:776` لا يُبلَغ | `409 invoice_issued_locked` |
| `POST /quotes` | `customerId` · `lines[].productId` | `quotes.service.ts:135-136` · `resolveLineTaxes` (`:36`) | `404` · `400` |
| **`PATCH /quotes/:id`** | **`customerId`** | **لا فحص** — `quotes.service.ts:188` يكتبه كما وصل (`UpdateQuoteDto.customerId` اختياريّ `@IsString` — `quotes/dto/quote.dto.ts:81-84`)؛ بحثتُ في `update` (`:173-212`) عن `customer.findUnique` فلا شيء، والتحكّم: `:135` يجده في `create` | **`500`** (يرفضه `quotes_companyId_customerId_fkey` — الهجرة ① `:158`) |
| `POST/PATCH /contracts` | `customerId` | `linkableCustomer` — `contracts.service.ts:669-673` (من `:193` و`:282-283`) | `404` |
| `POST /payments` | `customerId` · `bankId` · `allocations[].invoiceId` | `payments.service.ts:158-159` · `:164-165` · `SELECT … FOR UPDATE` خامٌ تحت RLS — `common/settlement/settlement.util.ts:161-166` | `404` |
| بيعُ الكاشير | `lines[].productId` · `customerId` | `pos.service.ts:523-527` · `:532` | `404` |
| `POST /inventory/movements` | `productId` · `warehouseId` · `toWarehouseId` | `inventory.service.ts:74-83` | `404` |
| `POST /inventory/write-offs` | `productId` · `warehouseId` | `inventory/write-offs.service.ts:124-127` | `404` |
| `POST /inventory/opening` | `lines[].productId` · `warehouseId` | `inventory/stock-openings.service.ts:122-130` | `404` |
| `POST /customers/:id/marketing-consent` | `:id` | `customers.service.ts:226-227` | `404` |
| **`POST /purchases`** | **`supplierId`** | **لا فحص** — `purchases.service.ts:131`. بحثتُ `supplier.findUnique\|supplier.findFirst\|supplier_not_found` في `purchases/` فوجدتُه في `supplier-payments.service.ts:140-141` وحده (مسبارُ تحكّمٍ يجد) | **`500`** + **رقمُ `PUR` محروق** (انظر أدناه) |
| **`POST /purchases`** | **`lines[].productId`** | **لا فحص** — `purchases.service.ts:172`؛ و`unitCodesFor` تُسقط الغائبَ صامتة (`common/units/product-unit-codes.util.ts:15-16`) | **`500`** + `PUR` محروق |
| **`POST /purchases`** | **`warehouseId`** | `resolveReceiptWarehouse` يُعيد الصريحَ بلا قراءة (`purchases/purchase-receipt.util.ts:70-75`) ⟵ `goods_receipts` (`goods-receipts.service.ts:88-95`، قيدُ `:83` في ①) | **`500`** + `PUR` و`GR` محروقان |
| **`PATCH /purchases/:id`** | **`supplierId`** · **`lines[].productId`** | **لا فحص** — `purchases.service.ts:273` · `:362` (والقراءةُ الوحيدة قبلها للشراء نفسِه `:252-253`) | **`500`** |
| **`POST /purchases/:id/supplier-credit-note`** (و`-debit-note`) | **`lines[].productId`** لسطرٍ **بلا** `returnsPurchaseLineId` | `assertReturnLinesBelong` يتخطّى السطرَ بلا مرجع (`common/adjustment/adjustment-note.util.ts:87`)؛ والكتابة `supplier-notes.service.ts:170` | **`500`** + `SCN`/`SDN` محروق (الترقيم `:125-127` قبل الإنشاء `:131`) |
| **`POST/PATCH /branches`** | **`warehouseId`** · **`propertyId`** | **لا فحص** — `branches.service.ts:48-49` · `:73-74` (مالكُ المنشأة وحده `:38`) | **`500`** (القيدان ① `:53` · ④ `:37`) |
| **`POST/PATCH /transactions`** | **`bankId`** | `assertBoxInBranch` **يعود صامتاً** على صندوقٍ `null` (`branches/branch-scope.util.ts:94`) ثم يُكتب المعرّف (`transactions.service.ts:80-85` · `:112-115`) | **`500`** (القيد ① `:110`) |
| **`PATCH /warranties/:id`** | **`supplierId`** | **لا فحص** في التعديل `warranties.service.ts:145` — والإنشاءُ يفحص (`:104-106`) | **`500`** (القيد ① `:140`) |
| `POST /tasks` | `targetId` | فحصُ **صلاحية الشاشة** لا وجودِ المستند (`tasks.service.ts:172-175`)؛ `INSERT` خام (`:181-184`)؛ ولا مفتاحَ على العمود | **`201`** بمعرّفٍ لا يُطابَق — لا تسريب (أ يعرف المعرّفَ أصلاً، وفتحُه `404` تحت RLS)، لكنه مرجعٌ غيرُ مُتحقَّق |

**أثرٌ جانبيٌّ مقيسٌ بالقراءة:** الترقيمُ يزيد العدّادَ **على منفذٍ خاصّ يلتزم وحده** (`common/document-sequence.util.ts:102-108`؛ `common/sequence-allocator.ts:120-131` — `sequencePort()` و`$transaction` مستقلّة). فالرفضُ من القاعدة **بعد** الترقيم يُرجع معاملةَ العمل **ولا يُرجع الرقم**: في الشراء `nextPurchaseNumber` (`purchases.service.ts:123`) يسبق `tx.purchase.create` (`:126`). والفاتورةُ تعرف هذا وتفحص قبل الترقيم عمداً (`invoices.service.ts:544-548`: «رفضٌ بعد `nextDocumentNumber` يحرق رقماً في كل محاولة»).

### ٢-٥ `stock_opening_lines` — لماذا لا تُحقَن رغم غياب المفتاح

كاتبُه الوحيد `stock-openings.service.ts:195-209` ينسخ `productId`/`warehouseId` من السطر الذي فُحص (`:122-130`)، ويشير إلى حركته بمركّب (`movementTenant` — `schema.prisma:2484`؛ الهجرة ③ `:54`) وحركتُه تحمل مركّبَ الصنف والمستودع (① `:188` · `:191`). **فالحقيقةُ في الحركة محروسة، والعمودان نسخةٌ غيرُ محروسة** — يفترقان بكتابةٍ خامٍ فقط.

### ٢-٦ انحرافُ توثيقٍ صغير

تعليقُ `Product` (`schema.prisma:2524-2527`): «Deliberately not a hard FK from InvoiceLine» — **باطلٌ اليوم**: `InvoiceLine.product` مفتاحٌ `Restrict` (`schema.prisma:1697`) ومعه المركّب (`:1699`).

---

## (3) حكمٌ مبدئيّ بالقراءة

**الدعوى بصيغتها («تستطيع أ أن تكتب في مستنداتها معرّفَ عميلٍ أو صنفٍ لـب») — ساقطةٌ بالقراءة**، بطبقتين حيث وُجدتا وبطبقةٍ واحدة حيث لا:

1. **على مستوى القاعدة:** كلُّ عمودِ `customerId`/`productId`/`supplierId` على جداول المستندات يحمل مركّباً (§٢-٢ — `5/6` للعميل · `7/8` للصنف · `4/4` للمورّد)، والمركّبُ يُكتب في عبارةٍ واحدة مع الصفّ فيسقط العابرُ `23503` (مُثبَتٌ على أربع عيّنات في `composite-fk-guard ②–⑤`). والاستثناءان (`marketing_consents.customerId` · `stock_opening_lines.productId/warehouseId`) **مسدودان بالخدمة** اليوم (§٢-٤ · §٢-٥).
2. **على مستوى الخدمة:** المساراتُ الرئيسة (الفاتورة · العرض عند إنشائه · العقد · القبض · الكاشير · المخزون · الافتتاح · الموافقة) تقرأ المعرّفَ تحت RLS وترفض مسمّاةً.

**لكنّ ثلاث بقايا قائمة — ليست حقناً بل ثقوبٌ في «الطبقتين»:**

| # | البقية | لماذا تهمّ |
|---|---|---|
| ب١ | **ثمانيةُ مسارات بلا طبقة خدمة** (`PATCH /quotes` · `POST/PATCH /purchases` بالمورّد والصنف والمستودع · إشعاراتُ المورّد · `branches` · `transactions` · `PATCH /warranties`) — **المركّبُ وحده** يمنعها | الردُّ `500` عامّ لا رفضٌ مسمّى، ويُبلَّغ متتبّعَ الأخطاء عطلاً (`http-exception.filter.ts:28-29`)، **ويحرق أرقامَ `PUR`/`GR`/`SCN`/`SDN`**؛ **وقبل `2026-09-21` كانت هذه حقناً حقيقياً** (المفردُ وحده يقبل) — والهجرة ① تقول إن العدّ قبلها صفر (`:5`) |
| ب٢ | **علاقتان بلا مركّب** بعد `ق-١٢٥٢`: `marketing_consents.customerId` (وُلدت `2026-09-23` بمفردٍ وحده) و`stock_opening_lines.productId/warehouseId` (بلا مفتاح) | الطبقةُ الثانية غائبة؛ خدمةٌ تُعدَّل يوماً بلا فحصٍ تفتحها **بصمت** |
| ب٣ | **لا حارسَ اكتمال**: `composite-fk-guard ①` يطابق المُعلَنَ بالكتالوج ولا يطلب مركّباً لكلِّ مفردٍ بين مستأجرَين | هو الذي سمح بـب٢؛ **وكلُّ جدولٍ قادم** يكرّره |

**وما لا يُحسم بالقراءة وحدها:** (أ) أنّ القيودَ قائمةٌ فعلاً على قاعدة التطوير والمنشور (`convalidated`) — يُقاس في §٦؛ (ب) أنّ الردَّ على ب١ هو `500` بعينه ولا يلتقطه وسيطٌ لم أقرأه — يُقاس في §٤؛ (ج) أنّ فحصَ السلامة المرجعية يتجاوز RLS فعلاً مع `FORCE` (أساسُ أن المفردَ كان يقبل) — سلوكُ Postgres لا شيفرةُ المستودع.

---

## (4) كيف تُقاس حيّاً — اختبار `e2e`

**الملف:** `apps/api/test/cross-tenant-references.e2e-spec.ts` — بنمط `composite-fk-guard.e2e-spec.ts:56-73` (`registerIsolatedCompany(app, 'xtr-a')` و`'xtr-b'` من `test/isolated-company.ts:24`، والتنظيفُ `removeIsolatedCompany`) وبسابقة `journal-tenant-isolation.e2e-spec.ts:107-120`.

**التهيئة (من ب):** عميلٌ `POST /customers {kind:'NATURAL', name}` · صنفٌ `POST /products {name, price}` · مورّدٌ `POST /suppliers {name}` · مستودعٌ · صندوقٌ `POST /banks {name, kind:'BANK_ACCOUNT', openingDate}` (نمطُ `composite-fk-guard:146`). **ومن أ:** عميلٌ ومورّدٌ وصنفٌ وعرضُ سعر وفرعٌ وضمانٌ وحركةٌ بنكية — أصولٌ خاصّةٌ بأ تُستعمل حيث يلزم مستندٌ قائم.

**المسبارُ الذي يقرأ الأثر:** داخل `tenantPrisma.runInTenantContext(a.companyId, …)` — `SELECT count(*) FROM "<table>" WHERE "<col>" = $1` بمعرّف ب. **ومصادقتُه قبل كلِّ شيء:** الاستعلامُ نفسُه بمعرّف أ بعد إنشاءٍ مشروع ⟵ `≥ 1` (يجب أن يجد)، وبمعرّف ب ⟵ `0` (يجب ألّا يجد).

### المجموعةُ الأولى — «لا حقن» (يجب أن تمرّ اليوم؛ تسقط إن كانت الدعوى قائمة)

لكلِّ حالة: `expect(res.status).toBeGreaterThanOrEqual(400)` **و** عدُّ صفوف أ التي تحمل معرّفَ ب = `0`.

| # | الطلب (بتوكن أ) | الجدولُ المعدود |
|---|---|---|
| ١ | `POST /invoices {customerId: B.customer, issueDate, dueDate, lines:[{description, quantity:1, unitPrice:100, taxRate:15}]}` | `invoices.customerId` |
| ٢ | `POST /invoices {customerId: A.customer, lines:[{…, productId: B.product}]}` | `invoice_lines.productId` |
| ٣ | `POST /quotes` بعميل ب ثم بصنف ب | `quotes` · `quote_lines` |
| ٤ | `PATCH /quotes/:A.quote {customerId: B.customer}` ثم قراءةُ العرض | `quotes.customerId` = عميلُ أ لم يتغيّر |
| ٥ | `POST /purchases {supplierId: B.supplier, date, subtotal: 200}` (نمطُ `default-chart.e2e-spec.ts:112`) | `purchases.supplierId` |
| ٦ | `POST /purchases {supplierId: A.supplier, date, subtotal: 100, receiveNow:false, lines:[{description, productId: B.product, quantity:1, unitPrice:100}]}` | `purchase_lines.productId` |
| ٧ | `POST /purchases {…, lines:[صنفُ أ], warehouseId: B.warehouse}` | `goods_receipts.warehouseId` |
| ٨ | `PATCH /purchases/:A.purchase {supplierId: B.supplier}` | `purchases.supplierId` |
| ٩ | `POST /purchases/:A.purchase/supplier-credit-note {reason, lines:[{description, productId: B.product, quantity:1, unitPrice:10}]}` | `purchase_lines.productId` |
| ١٠ | `POST /contracts {…, customerId: B.customer}` · `POST /payments {customerId: B.customer, …}` · `POST /inventory/movements {productId: B.product, warehouseId: A.wh, …}` · `POST /inventory/write-offs` · `POST /inventory/opening` | الجداولُ المقابلة |
| ١١ | `PATCH /branches/:A.branch {warehouseId: B.warehouse}` · `PATCH /transactions/:A.tx {bankId: B.bank}` · `PATCH /warranties/:A.w {supplierId: B.supplier}` | `branches` · `bank_transactions` · `warranties` |
| ١٢ | `POST /customers/:B.customer/marketing-consent {channel:'SMS', granted:true, source:'IN_PERSON'}` | `marketing_consents.customerId` |

⚠️ **توكيدٌ ضيّقٌ لا واسع** (`CLAUDE.md` 2026-08-13): «`≥ 400` وحده» يمرّ على `500` من سببٍ آخر (عطلٌ في التهيئة). فكلُّ حالةٍ تُسبَق بنسختها **المشروعة** بمعرّف أ وتُوكَّد `201/200` — فيثبت أن المسارَ بلغ موضعَ الكتابة، وأن الفرقَ هو المعرّفُ وحده.

### المجموعةُ الثانية — «رفضٌ مسمّى» (تسقط على الشيفرة الحالية — تُثبت ب١)

الحالاتُ ٤ · ٥ · ٦ · ٧ · ٨ · ٩ · ١١ بتوكيدٍ ضيّق: `expect(res.status).toBe(404)` (أو `400` للصنف كما في `line-tax.util.ts:128`) **و**`res.body.message` = نصُّ `customer_not_found` / `supplier_not_found` / `product_not_found` / `warehouse_not_found` / `bank_not_found`. **اليوم: `500`** بـ`internal_error`. وحالةٌ إضافية لأثر الترقيم: `document_sequences.last` لـ`PUR` قبل الحالة ٥ وبعدها (داخل سياق أ) ⟵ **اليوم يزيد `1`** رغم الرفض، وبعد الإصلاح لا يزيد.

### الإثباتُ بالعكس للمجموعة الأولى (أن المركّبَ هو ما يمنع ب١)

على **قاعدةٍ نظيفةٍ مخصّصة** (لا `mad_app` المشتركة — `§6.13` وقاعدةُ «مورد مشترك»): `ALTER TABLE "purchases" DROP CONSTRAINT "purchases_companyId_supplierId_fkey";` ⟵ **يُفحص وقوعُ الكسر** (`SELECT count(*) FROM pg_constraint WHERE conname = 'purchases_companyId_supplierId_fkey'` = `0`) ⟵ الحالة ٥ **تسقط** (`201` وعدٌّ `1`) — فيثبت أن لا طبقةَ غيرَه — ⟵ يُعاد القيدُ بنصّه من ① `:74` ويُعاد التشغيل أخضر. **والعددُ الكلّيُّ للاختبارات يبقى كما هو** بين التشغيلين (`§8.8`: «`0 total` ليس سقوطاً»).

---

## (5) الإصلاح — لأن البقايا قائمة (الدعوى نفسُها ساقطة)

### ٥-١ طبقةُ الخدمة على المسارات الثمانية — **قبل الترقيم**

| الموضع | الإضافة |
|---|---|
| `quotes.service.ts:182-188` | إن وصل `dto.customerId`: `tx.customer.findUnique` ⟵ `404 customer_not_found` (نصُّ `:135-136` نفسُه — يُستخرج دالّةً واحدة للمسارين) |
| `purchases.service.ts:119-126` (قبل `nextPurchaseNumber` `:123`) و`:272-273` | `tx.supplier.findUnique` ⟵ `404 supplier_not_found` |
| `purchases.service.ts` (إنشاءً وتعديلاً) و`supplier-notes.service.ts:128-130` | دالّةٌ مشتركة `assertProductsVisible(tx, lines)` في `common/units/` أو بجانب `productTaxFor` (`line-tax.util.ts:117`) — تقرأ الأصنافَ مرّةً وتردّ `400 product_not_found` لأيّ معرّفٍ غائب. **ولا تُعدَّل `unitCodesFor`** لتصير صارمة: مستهلكوها الآخرون (الفاتورة والعرض) يفحصون قبلها، وصرامتُها تغيّر رسائلَهم |
| `purchase-receipt.util.ts:70-75` | المستودعُ الصريح يُقرأ ⟵ `404 warehouse_not_found` — ويُستدعى **قبل** `nextPurchaseNumber` حين يُرسَل (وإلا بقي `PUR` يُحرق) |
| `branches.service.ts:43-49` و`:73-74` | قراءةُ `warehouse`/`property` ⟵ `404` |
| `transactions.service.ts:80` و`:114` | `bank` غائب ⟵ `404 bank_not_found` (نمطُ `payments.service.ts:164-165`) قبل `assertBoxInBranch` |
| `warranties.service.ts:137-145` | نصُّ الإنشاء `:104-106` نفسُه |

### ٥-٢ طبقةُ القاعدة على العلاقتين الناقصتين

- **`marketing_consents`:** علاقةٌ `customerTenant Customer @relation("MarketingConsent_customerId_tenant", fields: [companyId, customerId], references: [companyId, id], onDelete: NoAction, onUpdate: NoAction)` وأختُها على `Customer`؛ وهجرةٌ جديدة: `ALTER TABLE "marketing_consents" ADD CONSTRAINT "marketing_consents_companyId_customerId_fkey" FOREIGN KEY ("companyId","customerId") REFERENCES "customers"("companyId","id") ON DELETE NO ACTION ON UPDATE NO ACTION;`. **والمفردُ يبقى حاملَ `CASCADE`** — والمحوُ عبر `marketing_consents_append_only` (`20260923180000_marketing_consent_erasure/migration.sql:36-48`) لا يتأثّر: المركّبُ `NO ACTION` يُفحص آخرَ الجملة بعد أن يكون التسلسلُ قد محا الابن (تجربةُ `ق-١٢٥٦` (أ)).
- **`stock_opening_lines.productId/warehouseId`:** قرارٌ للمالك بين (i) مركّبٍ وحده `NO ACTION` — يكفي حارساً للكتابة ولا يغيّر الحذف: حذفُ الصنف محبوسٌ أصلاً بـ`Restrict` حركةِ السطر (`StockMovement.product` — `schema.prisma:5727`)؛ و(ii) مفردٍ `Restrict` + مركّب كنمط `ق-١٢٥٢`. ⚠️ **وفي (i)** يقرأ `retainingReferencesOf` العلاقةَ المركّبة وحدَها بـ`NoAction` فلا يعدّها مرجعاً حافظاً (`trash/trash-retention.util.ts:39-44`) — وهو الصحيح هنا.

### ٥-٣ حارسُ الاكتمال — يسدّ ب٣

في `composite-fk-guard.e2e-spec.ts` (أو حارسٍ ساكنٍ في `src/common` يقرأ `Prisma.dmmf` كما يفعل `trash-retention.util.ts:32-36`): **كلُّ علاقةٍ مفردةٍ من نموذجٍ يحمل `companyId` إلى نموذجٍ يحمل `companyId` لها أختٌ `[companyId, X]`** — إلا قائمةً مسمّاةً بسببها **تنقص ولا تزيد**: `company_users.loginIdentityId` (مشغِّل) · `company_users.permissionTemplateId` و`api_keys.permissionTemplateId` (أصلٌ ثنائيّ النطاق) · `support_access_logs.grantId` (يُقرَّر). **ويطبع العدَّ** (`191` مفرداً · `186` مركّباً اليوم) ويتحقّق أنه قرأ شيئاً (`> 0`).

### ٥-٤ ما ينكسر

- الرسائلُ على ب١ تتحوّل `500 ⟵ 404/400` — لم أجد اختباراً يوكّد `500` على هذه المسارات (بحثٌ لم أُجرِه بنمطٍ مصادَق — §٧).
- قراءةٌ إضافيةٌ واحدة لكلِّ شراء/إشعار — كلفةٌ دون ملّي‑ثانيتين على نمط `§4` (قياسُ `SELECT 1` ≈ `0.885 ms`).
- هجرةُ المركّب الجديدة **تفشل** على قاعدةٍ فيها صفٌّ عابر — فالقياسُ §٦ شرطٌ قبلها؛ و`composite-fk-guard ①` يصير `187` في الاتجاهين تلقائياً (مشتقٌّ من المخطّط `:28-46`).
- `dimension-coverage.live.spec.ts:78` و`:239` يقرآن المفردَ وحده عمداً — لا يتأثّران؛ ومولّدُ المخطّط `review-247/fk-schema-gen.mjs` المذكورُ في `ق-١٢٥٢` **ليس في المستودع** (`ls apps/api/scripts | grep -i "fk\|composite"` ⟵ لا شيء) — فالإضافةُ بيدٍ تُعلَن أو يُستحضر المولّد.

### ٥-٥ الإثباتُ بالعكس للإصلاح — بصياغةٍ محتملة لا مصطنعة (`§8.8` الوجه الثاني)

- **ب١:** يُحذف فحصُ المورّد من `purchases.create` ⟵ الحالة ٥ في المجموعة الثانية تعود `500` وتزيد `document_sequences` — **ويُفحص وقوعُ الكسر** (`git diff` يُظهر السطرَ محذوفاً) قبل القراءة، **والسكربتُ يقف إن وجد ما لم يُلتزم** (`§8.8` الوجه الخامس). وصياغةٌ ثانية محتملة: فحصٌ بـ`findFirst({ where: { id, companyId: <من الطلب> } })` بدل سياق RLS — يجب أن تسقط هي أيضاً (أي أن الحارسَ يوكّد الرفضَ لا شكلَ الاستعلام).
- **ب٢:** يُسقَط المركّبُ الجديد في معاملةٍ مُرجَعة بدور المدير ويُحقَن صفٌّ عابر في `marketing_consents` ⟵ يمرّ؛ ومع المركّب ⟵ `23503` باسم `marketing_consents_companyId_customerId_fkey` (نمطُ `composite-fk-guard ②`).
- **ب٣:** تُحذف العلاقةُ المركّبة الجديدة من المخطّط ⟵ حارسُ الاكتمال يسقط **مسمّياً** `marketing_consents.customerId`؛ **وحالتُه السليمة** (الشجرةُ بعد الإصلاح) تمرّ — فلا يُقبل حارسٌ يسقط دائماً (`§8.15`).

---

## (6) أرقامٌ تُقاس على قاعدة التطوير قبل التغيير

⚠️ **الجداولُ تحت `FORCE RLS`**: العدُّ بدور `app_user` بلا سياق **يعود صفراً بنجاح** (`CLAUDE.md` قاعدة 2026-08-12). فالاستعلاماتُ ①–④ **بالدور الخارق** (`mad_app`)، ويُثبَت الدورُ أولاً:

```sql
-- ٠) مصادقةُ الآلية: الدورُ يتجاوز RLS فعلاً
SELECT current_user, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user;
-- المتوقَّع: rolsuper = true (وإلا فكلُّ صفرٍ بعده عمى لا نفي)
```

```sql
-- ①) الهجراتُ الأربع مطبَّقة
SELECT migration_name, finished_at FROM _prisma_migrations
WHERE migration_name LIKE '20260921%composite_fk%' ORDER BY 1;
-- المتوقَّع: 4 صفوف بـ finished_at غير فارغ
```

```sql
-- ②) المركّباتُ على العميل والصنف والمورّد — قائمةٌ ومُتحقَّقة
SELECT c.conname, c.conrelid::regclass AS child, c.confrelid::regclass AS parent, c.convalidated,
       (SELECT array_agg(a.attname ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols
FROM pg_constraint c
WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 2
  AND c.confrelid IN ('customers'::regclass, 'products'::regclass, 'suppliers'::regclass)
ORDER BY 3, 2;
-- المتوقَّع: customers 5 · products 7 · suppliers 4 — وكلُّها convalidated = true

SELECT count(*) FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace AND array_length(conkey, 1) = 2;
-- المتوقَّع: 186 (عدُّ المخطّط اليوم)
```

```sql
-- ③) بقايا عابرةٌ في العلاقتين بلا مركّب (بالدور الخارق)
SELECT count(*) AS consent_cross
FROM marketing_consents m JOIN customers c ON c.id = m."customerId"
WHERE c."companyId" <> m."companyId";

SELECT
  count(*) FILTER (WHERE p.id IS NULL)                         AS opening_product_dangling,
  count(*) FILTER (WHERE p."companyId" <> l."companyId")       AS opening_product_cross,
  count(*) FILTER (WHERE w.id IS NULL)                         AS opening_wh_dangling,
  count(*) FILTER (WHERE w."companyId" <> l."companyId")       AS opening_wh_cross,
  count(*) FILTER (WHERE m."productId" <> l."productId"
                      OR m."warehouseId" <> l."warehouseId")    AS opening_vs_movement_mismatch,
  count(*)                                                     AS opening_lines_total
FROM stock_opening_lines l
LEFT JOIN products   p ON p.id = l."productId"
LEFT JOIN warehouses w ON w.id = l."warehouseId"
JOIN stock_movements m ON m.id = l."movementId";
```

```sql
-- ③-مصادقة) المسبارُ يرى صفّاً عابراً معلوماً — على جدولٍ مؤقّت (لا مشغِّلات ولا RLS ولا كتابة حقيقية)
BEGIN;
CREATE TEMP TABLE probe_mc AS SELECT * FROM marketing_consents LIMIT 1;
UPDATE probe_mc SET "customerId" = (SELECT id FROM customers WHERE "companyId" <> probe_mc."companyId" LIMIT 1);
SELECT count(*) FROM probe_mc m JOIN customers c ON c.id = m."customerId" WHERE c."companyId" <> m."companyId";  -- يجب 1
ROLLBACK;
-- ⚠️ إن كان marketing_consents فارغاً فالمصادقةُ تُبنى من صفٍّ مصطنع: INSERT في الجدول المؤقّت بمنشأةٍ وعميلٍ من منشأتين
```

```sql
-- ④) أثرُ الترقيم (دلالةٌ لا حكم): فجواتُ PUR بين العدّاد وأعلى رقمٍ قائم
SELECT s."companyId", s."last",
       max(nullif(regexp_replace(p.no, '^PUR-', ''), '')::int) AS max_existing,
       count(p.id) AS purchases_with_pur
FROM document_sequences s
LEFT JOIN purchases p ON p."companyId" = s."companyId" AND p.no LIKE 'PUR-%'
WHERE s.kind = 'PUR'
GROUP BY 1, 2
HAVING s."last" <> coalesce(max(nullif(regexp_replace(p.no, '^PUR-', ''), '')::int), 0);
-- ⚠️ الفجوةُ لها أسبابٌ أخرى (أيّ رفضٍ بعد الترقيم) — فلا تُنسب إلى حقنٍ بلا تقسيمٍ بمصادرها (§8.7 الوجه السابع عشر)
```

**وبديلٌ بلا دورٍ خارق** (إن لم يُتَح): الاستعلامُ ③ داخل سياق كلِّ منشأة — `BEGIN; SELECT set_config('app.company_id', '<id>', true); …` — مع `LEFT JOIN` وعدِّ `p.id IS NULL`: صفُّ أ الذي يشير إلى صنف ب **يظهر «يتيماً»** لأن RLS يُخفي الأصل؛ فيُعدّ «يتيماً أو عابراً» معاً، ويُفرَّق بينهما بالدور الخارق لاحقاً. **ويُدار على المنشآت كلّها** (قاعدة 2026-08-12: عدٌّ خارج السياق يرى الغياب).

---

## (7) ما لا أعرفه

1. **لم يُشغَّل شيء.** كلُّ «المتوقَّع» في §٢-٤ قراءة؛ وأنّ `P2003` من كتابةٍ متداخلة يصل مرشِّحَ الاستثناءات فيصير `500` — قراءةٌ لـ`http-exception.filter.ts:46-56` ولم أجد مُلتقِطاً آخر (`grep -rln "PrismaClientKnownRequestError" common/` ⟵ `retry-on-conflict.util.ts` وحده)؛ **ولم أقرأ كلَّ المعترِضات العامّة** (`main.ts`/`app.module.ts`).
2. **تجاوزُ فحص السلامة المرجعية لـRLS مع `FORCE`** — معرفةٌ عن Postgres لا مقروءةٌ هنا؛ و`composite-fk-guard ②–⑤` يُثبت الرفضَ بالمركّب ولا يُثبت أن المفردَ **كان** يقبل (تجربةُ `ق-١٢٥٦` (د) تقول ذلك: «بلا المركّب مرّ العابر»).
3. **حالُ القاعدة المنشورة** (`test-app.rikzapp.com`): هل طُبّقت الدفعاتُ الأربع؟ غيرُ مقروء — §٦ ①.
4. **مشغِّلُ `company_users_identity_follows`** لم أقرأ نصَّه — الاعتمادُ على تعليق `company-users.service.ts:108-109`.
5. **`support_access_logs.grantId`** — لم أفحص كاتبَه.
6. **بحثُ الاختبارات القائمة بالتسمية**: قد يوجد اختبارُ API عابرٌ بأسماء متغيّراتٍ لم يطابقها نمطي؛ ولم أبحث عن اختبارٍ يوكّد `500` على مسارات ب١.
7. **المساراتُ غيرُ المفحوصة سطراً سطراً:** الحجوزات والصيانة والوحدات والحضور والإجازات قُرئ فحصُها بـ`grep` (كلُّها تقرأ المعرّفَ قبل الكتابة: `reservations.service.ts:28-29` · `maintenance.service.ts:96-104` · `units.service.ts:28-29` · `attendance.service.ts:44-45` · `leaves.service.ts:132-135`) لا بقراءةٍ كاملة؛ وتكاليفُ الشحن (`landed-costs.service.ts:84-100`) كذلك؛ ومساراتُ الاستيراد/المزامنة الجماعية إن وُجدت لم أبحث عنها.
8. **`tasks.targetId`**: لا مفتاحَ ولا فحصَ وجود — حكمتُ «لا تسريب» لأن أ يعرف المعرّفَ أصلاً والفتحَ يمرّ بـRLS؛ **ولم أقرأ شاشةَ فتح الهدف** لأتحقّق أنها لا تكشف شيئاً عن هدفٍ غائب.

---

## مراجعةٌ عدائية

> **المُراجِع:** وكيلُ تحقّقٍ مستقلّ — قراءةٌ وبحثٌ فقط على `D:\worktrees\outbox-266` (الرأس `eda979a2`، مقروءٌ بـ`git log -1`). لا اختبار ولا قاعدة ولا تعديلَ في المستودع. كتبتُ مسباراً مستقلاً في مجلد الجلسة المؤقّت (`fk2.cjs` — يحلّل `schema.prisma` بلا أن يعيد استعمالَ أداة التقرير).

### أ. ما صمد بالتحقّق (الحكمُ قائم)

- **الحكمُ «ساقطةٌ للعميل والصنف» يصمد.** مسباري المستقلّ أعطى الأرقامَ نفسَها: `191` مفرداً بين نموذجَي مستأجر · `186` لها مركّب · والخمسةُ الناقصة هي نفسُها (`schema.prisma:607` · `:618` · `:833` · `:1370` · `:4871`). ومصادقتُه: `grep -cE "fields: \[companyId, [a-zA-Z]*\], references: \[companyId, id\]"` = `186`، والحالتان المعلومتان (`marketing_consents.customerId` يُسرد · `invoices.customerId` لا يُسرد) كما في التقرير.
- **العدُّ لكلِّ أصل** (بحثٌ في المخطّط عن `@relation` إلى `Customer|Product|Supplier`): مركّباتُ العميل `5` (`:1406` `:3233` `:4152` `:4908` `:5109`) ومفرداتُه `6` (الزائدُ `:1370`)؛ الصنفُ `7` مركّباً و`7` مفرداً؛ المورّدُ `4`/`4` — فتوقّعُ §٦ ② (`5 · 7 · 4` و`186`) صحيح.
- **قرأتُ كلَّ موضعٍ في جدول §٢-٢ وجدول §٢-٤ و§٢-٥ و§٢-٦** فطابق نصُّه ما نُسب إليه، ومنها: `quotes.service.ts:135-136` و`:188` · `purchases.service.ts:123` `:126` `:131` `:172` `:273` `:362` · `supplier-notes.service.ts:125-127` `:131` `:170` · `adjustment-note.util.ts:87` · `branches.service.ts:48-49` `:73-74` · `transactions.service.ts:80-85` `:112-115` · `branch-scope.util.ts:94` · `warranties.service.ts:104-106` `:145` · `sequence-allocator.ts:120-131` (الزيادةُ على منفذٍ خاصّ تلتزم وحدَها — فالحرقُ مؤكَّد) · `invoices.service.ts:545-550` `:558` `:737` `:772` `:776` · الهجرة ① `:26` `:41` `:44` `:53` `:62` … `:215` · ④ `:37` · ③ `:54`.
- **لا مُلتقِطَ لـ`P2003` يحوّله رفضاً مسمّى:** `grep -rn "P2003\|23503" src --include=*.ts` (بلا `.spec`) ⟵ أربعةُ مواضع كلُّها مساراتُ **حذف** (`accounts.service.ts:238` · `cash-drawers.service.ts:295` · `companies.service.ts:226` · `trash.service.ts:204`). والمزوّداتُ العامّة (`app.module.ts:171` حارسُ التحديد · `audit.module.ts:14` معترضُ التدقيق · `main.ts:57` `:69`) لا تمسّ الخطأ — فـ`500` عبر `http-exception.filter.ts:46-56` هو المتوقَّعُ بالقراءة (يسدّ §٧ ١ جزئياً).

### ب. تصحيحاتٌ — مرتّبةٌ بالأهمية

**١) 🔴 الإثباتُ بالعكس في §٤ أعمى — ولن يسقط كما يَعِد.** يقترح إسقاطَ `purchases_companyId_supplierId_fkey` وتوقّعَ أن الحالة ٥ تصير `201` وعدُّها `1` «فيثبت أن لا طبقةَ غيرَه». **وليس كذلك:** بعد `tx.purchase.create({… include: PURCHASE_INCLUDE })` (`purchases.service.ts:126`، والتضمينُ `supplier: true` علاقةٌ **مطلوبة** — `:25`) يُقرأ المورّدُ تحت RLS فيغيب، ثم يُفكّ `created.supplier.name` **بلا شرط** في `:216` (ومعه `:206` حين `receiveNow`)، ثم `postPurchaseEntry` يكتب `supplierId` على سطر القيد (`:211-212`) فيرفضه **مركّبٌ ثانٍ** `journal_lines_companyId_supplierId_fkey` (الهجرة ① `:131`). فالحالةُ تبقى `500` وعدُّها `0` بعد الكسر — **أخضرُ على كسرٍ مقصود**، ويُقرأ خطأً «الإثباتُ فشل» أو «المركّبُ ليس الحارس». **العيّنةُ الصالحة** مسارٌ علاقتُه اختياريةٌ ولا ترحيلَ بعده: `PATCH /warranties/:id {supplierId: B}` بإسقاط `warranties_companyId_supplierId_fkey` (`WARRANTY_INCLUDE.supplier` اختياريّ — `warranties.service.ts:26`؛ لا قيدَ بعد التحديث `:139-153`) ⟵ المتوقَّع `200` بـ`supplier: null` وعدٌّ `1`؛ أو `PATCH /branches/:id {warehouseId: B}` (`BRANCH_INCLUDE` اختياريّ — `branches.service.ts:14`). **والأمرُ نفسُه في الحالة ٧**: إسقاطُ مركّب `goods_receipts` وحدَه يترك `stock_movements_companyId_warehouseId_fkey` (① `:191`) يرفض في `writeShelfAndPost`.

**٢) 🟠 ادّعاءٌ تاريخيٌّ في ب١ أوسعُ من الشيفرة.** «وقبل `2026-09-21` كانت هذه حقناً حقيقياً (المفردُ وحده يقبل)» — **لا ينطبق على كلِّ الثمانية.** `POST /purchases` و`PATCH /purchases` بالمورّد كانا يسقطان `500` بلا المركّب: `created.supplier.name` (`:216`) و`updated.supplier.name` (`:378` · `:402` · `:413`) يُفكّان علاقةً مطلوبةً يخفيها RLS — **هذا مؤكَّدٌ بالقراءة** (فكُّ `null`). و`PATCH /quotes` (`QUOTE_INCLUDE.customer` مطلوبة — `quotes.service.ts:22`) و`transactions` (`TX_INCLUDE.bank` مطلوبة — `transactions.service.ts:11`) **مرجَّحٌ** سقوطُهما بسلوك Prisma على علاقةٍ مطلوبةٍ تعود فارغة (خطأ «Inconsistent query result») — **سلوكُ مكتبةٍ غيرُ مقيسٍ هنا** (`@prisma/client ^5.22.0` — `apps/api/package.json:39`). **الحقنُ الحقيقيُّ قبل المركّب** كان في العلاقات الاختيارية وحدَها: `branches` · `warranties` · `purchase_lines.productId` · سطورُ إشعار المورّد.

**٣) 🟠 مساراتٌ من صنف ب١ فاتت الجدول (§٢-٤) — ثلاثة:**

| المسار | لماذا لا تفحصه الخدمة | الناتجُ بالقراءة |
|---|---|---|
| **`POST /invoices/:id/credit-note`** بسطرٍ `returnsLineId` يشير إلى **سطرٍ خدميّ** في الأصل (`productId` فارغ) ومعه `productId: B.product` | `assertReturnLinesBelong` يتخطّى مقارنةَ الصنف حين يكون صنفُ الأصل فارغاً (`adjustment-note.util.ts:93`: `source.productId && l.productId && …`)؛ و`priceLines` يستثني من قراءة الأصناف كلَّ سطرٍ له أصلٌ في `originals` (`invoices.service.ts:100` · `:107-109`) | الترقيمُ `CN` (`invoices.service.ts:1033`) **قبل** `invoice.create` (`:1037`) الذي يكتب `productId` (`:1064`) ⟵ `invoice_lines_companyId_productId_fkey` ⟵ **`500` + `CN` محروق** |
| **`POST /purchases/:id/supplier-credit-note`** بالشكل نفسه (`returnsPurchaseLineId` إلى سطرٍ خدميّ + صنفُ ب) | `supplier-notes.service.ts:95` يُبقي الصنفَ المُرسَل، و`:101-105` يتخطّى المقارنةَ للسبب نفسِه | `500` + `SCN` محروق (مسارُ التقرير في `:89` يغطّي السطرَ **بلا** مرجع وحدَه) |
| **`POST /purchases/:id/receipts {warehouseId: B}`** (`purchases.controller.ts:72`) و**`PATCH /purchases/:id {warehouseId: B, lines}`** | `resolveReceiptWarehouse` يُعيد الصريحَ بلا قراءة (`purchase-receipt.util.ts:70-75`)، يُستدعى في `goods-receipts.service.ts:152` ثم الترقيمُ `:153`؛ وفي التعديل عبر `createImplicitWithinTx` (`purchases.service.ts:375-379` ⟵ `goods-receipts.service.ts:88-89`) | `500` + `GR` محروق |

⚠️ **وملاحظةٌ خارج الدعوى كشفها السطرُ الأول:** السطرُ الخدميّ نفسُه يقبل **صنفاً من المنشأة أ** لم يُبَع فيه — عيبُ منطقٍ (مرتجعُ صنفٍ لم يُبَع) لا عبورَ منشأة؛ لم أتتبّع أثرَه على الرفّ (`returnStockedLines`).

**٤) 🟠 §٢-٣ «السابقةُ الوحيدة» خاطئ — توجد اختباراتُ API عابرة:** `ls apps/api/test | grep -i isolat` ⟵ `18` ملفاً، ومنها ما يرسل معرّفَ منشأةٍ أخرى في جسم الطلب: `inventory-tenant-isolation.e2e-spec.ts:157-161` (ب يُنشئ حركةً بصنف أ ومستودعه ⟵ `404`) · `contracts-tenant-isolation.e2e-spec.ts:204-208` (ب يُنشئ عقداً بوحدة أ **وعميل أ** ⟵ `404`) · `reservations-tenant-isolation.e2e-spec.ts:154-158`. **وحدُّها:** لا يعدّ أيٌّ منها الصفوف؛ واختبارُ العقد لا يعزل العميل — الوحدةُ تُفحص أولاً (`contracts.service.ts:186` قبل `:193`)؛ **ولا شيء** على `invoices`/`quotes`/`purchases` بالعميل أو الصنف. فالتصميمُ في §٤ ما زال لازماً، لكن السطرَ «الوحيدة» يُصحَّح.

**٥) 🟠 تصميمُ الإصلاح §٥-١ يناقض عنوانَه في موضعٍ واحد:** يضع فحصَ الصنف لإشعار المورّد في `supplier-notes.service.ts:128-130` — **وهذا بعد الترقيم** (`:125-127`)، فيبقى `SCN`/`SDN` يُحرق. الموضعُ الصحيح قبل `:125` (ويُضمّ إليه سطرُ «المرجع الخدميّ» من ٣). وكذلك فحصُ المستودع الصريح يلزم في `goods-receipts.service.ts` قبل `:153`، وفي `purchases.service.ts` قبل `:123` حين يُرسَل.

**٦) 🟠 حارسُ الاكتمال §٥-٣ لا «يسدّ ب٣» كما يَعِد:** هو على **العلاقات**، فلا يرى **عموداً بلا علاقةٍ أصلاً** — وهو بالضبط الوجهُ الثاني من ب٢ (`stock_opening_lines.productId/warehouseId` — `schema.prisma:2492-2493`). ولا يرى أبناءً **بلا `companyId`**: `companies.primaryActivityId → BusinessActivity` (`schema.prisma:506`؛ يُكتب من الطلب بعد فحصٍ في السياق `primary-activity.service.ts:78-84` ثم بـ`this.prisma` خارجه `:96-99`) و`company_user_branches.branchId → Branch` (`schema.prisma:805`؛ فحصُ الخدمة `company-users.service.ts:209-215`). فيلزمه **ذراعٌ ثانية**: كلُّ عمود `…Id String` على نموذجٍ للمستأجر إمّا له علاقة أو في قائمةٍ مسمّاةٍ بسببها (فاعلون · `tasks.targetId` متعدّدُ الأشكال …).

**٧) 🟡 تصنيفٌ ناقص في §٢-٢ («والباقي معرّفاتُ فاعلين»):** ثلاثةُ أعمدةٍ **تُرسَل من الطلب** وتشير إلى صفوفٍ مملوكةٍ للمستأجر **بلا أيّ مفتاح** (مقروءٌ من الهجرات: `grep REFERENCES` على `tasks`/`task_logs`/`delegation_logs` ⟵ مفتاحُ `companyId` وحدَه — `20260813180000_tasks/migration.sql:50` · `20260813090000_task_log/migration.sql:34` · `20260812150000_delegation_log/migration.sql:37`): `tasks.assigneeId` (`schema.prisma:6417`؛ القاعدةُ تقيّد `OWNER` وحدَه — `20260912110000_task_assignee_kind/migration.sql` `tasks_owner_assignee_is_company` — والخدمةُ `tasks.service.ts:147-155`) · `delegation_logs.granteeId` (`schema.prisma:6504`؛ الخدمة `delegations.service.ts:155-157`) · `task_logs.taskId` (`schema.prisma:6470`؛ يكتبه النظام). **كلُّها مفحوصةٌ بالخدمة فلا حقنَ** — لكنها طبقةٌ واحدة كب٢، وتُسمّى لا تُطوى تحت «فاعلين».

**٨) 🟡 صياغةُ الحكم:** الدعوى تسأل عن «أيّ معرّفٍ مملوكٍ لمستأجر». و`tasks.targetId` **يُكتب فعلاً** بمعرّف ب (`tasks.service.ts:172-187`؛ `201`) — التقريرُ يقوله في الجدول ولا يقوله في §٣. الأدقّ: «ساقطةٌ لكلِّ عمودٍ له مفتاح ولكلِّ مسارٍ يفحص؛ **وقائمةٌ شكلاً** في `tasks.targetId` بلا أثرٍ مقروء — لا يُحلّ الهدفُ في الخادم (`tasks.service.ts:317` ينسخه كما هو)».

### ج. ما فحصتُه ولم أجد فيه خطأ

- **SQL §٦:** ⓪ يصادق الدور قبل الصفر؛ ①–④ بالدور الخارق فلا تعمى بـRLS؛ `pg_constraint` و`_prisma_migrations` خارج RLS أصلاً؛ ونمطُ ① `LIKE '20260921%composite_fk%'` يطابق الأسماءَ الأربعة (`ls -d 2026092119*`). والبديلُ «داخل سياق كلِّ منشأة» صحيحُ المنطق (يتيمٌ أو عابر). لا عدَّ يعود صفراً بسبب RLS في الصيغة المقترحة.
- **المجموعةُ الأولى في §٤ ليست عمياء** بشرطها المكتوب (نسخةٌ مشروعةٌ `201` قبل كلِّ حالة + عدٌّ داخل سياق أ مُصادَقٌ بحالتين)، وتسقط لو قام حقن. **والعيبُ في الإثبات بالعكس وحدَه** (ب ١).
- **§٥-٢:** قراءةُ `retainingReferencesOf` صحيحة — علاقةٌ مركّبةٌ وحدَها تسقط إلى نفسها (`trash-retention.util.ts:42`) وحذفُها `NoAction` فتُتخطّى (`:43-44`). ومفتاحُ `marketing_consents` المفرد `CASCADE` والمشغِّل يسمح بالحذف حين يغيب العميل (`20260923180000_marketing_consent_erasure/migration.sql:40-44`)، فمركّبٌ `NO ACTION` بجانبه على نمط التجربة المعلَنة (`decisions.md:3334`) لا يعارضه.
- **المولّد** `fk-schema-gen.mjs` ليس في المستودع كما قيل — وهو موجودٌ في `D:\mad-app-scratch\review-247\fk-schema-gen.mjs` (خارج المستودع).

### د. حدُّ هذه المراجعة

لم أُشغّل شيئاً؛ «مرجَّحٌ» في ب ٢ سلوكُ Prisma لا شيفرةُ المستودع. ولم أقرأ `returnStockedLines` حتى آخره، ولا كلَّ مسارات `banks/*` سطراً سطراً (قرأتُ مواضعَ الفحص بـ`grep`: `cash-deposits.service.ts:68-71` · `network-settlements.service.ts:154` · `reconciliation` `:170-180` — كلُّها تقرأ قبل الكتابة).
