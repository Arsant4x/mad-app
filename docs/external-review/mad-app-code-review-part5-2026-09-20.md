# مراجعة كود Mad App، الجزء الخامس: التنفيذ والقياس والترتيب

ثلاثة أقسام: تتمة العلاجات الخمسة بما نقص من الجزء الرابع (الملفات بالاسم، الهجرات والقواعد نصاً، المراحل، ما ينكسر)، قواعد بناء الواجهة القابلة للفرض، والقياس الفعلي على قاعدة مبذورة. ثم ترتيب تنفيذ الملاحظات كلها وما لا يستحق الإصلاح.

## ١. تتمة العلاجات الخمسة

### ١.١ العزل بمفتاح مركب

الجزء الرابع أعطى الجداول والهجرة. ما نقص:

**الترتيب على مراحل** (كل مرحلة هجرة مستقلة قابلة للتراجع):

| المرحلة | الهدف | المصادر التي تُعدَّل | ملفات الشيفرة | الفحص قبل الهجرة |
|---|---|---|---|---|
| ١ | `customers` | `invoices`، `payments`، `quotes`، `contracts`، `journal_lines` | `invoices.service.ts:497`، `payments.service.ts:111`، `quotes.service.ts:97`، `contracts.service.ts:624`، `journal-posting.util.ts:140` | `SELECT i.id FROM invoices i JOIN customers c ON c.id=i."customerId" WHERE c."companyId"<>i."companyId"` وأربعة مثله |
| ٢ | `products`، `warehouses` | `invoice_lines`، `purchase_lines`، `quote_lines`، `stock_movements` (عمودان)، `inventory_layers`، `stock_batches`، `inventory_write_offs`، `goods_receipts`، `branches.warehouseId` | `sale-fulfilment.util.ts:96`، `inventory.service.ts:66`، `purchases.service.ts` | كما أعلاه لكل زوج |
| ٣ | `accounts`، `banks`، `branches` | `journal_lines`، `journal_entries.openingForAccountId`، `banks.accountId`، `cash_drawers.accountId`، `payments.bankId`، `supplier_payments.bankId`، `rent_payments.bankId`، `bank_transactions`، وكل `branchId` (15) | `branch-scope.util.ts` (`resolveBranchId` تقرأ الفرع في السياق أصلاً) | |
| ٤ | `contracts`، `contract_installments`، `units`، `properties`، `suppliers` | 10 + 3 + 5 + 5 + 4 مرجعاً | `contracts.service.ts:407` (`installment.contractId !== contractId` قائم) | |
| ٥ | `invoices`، `purchases` (المراجع الذاتية) | `payment_allocations`، `pos_payments`، `quotes.convertedInvoiceId`، `invoices.relatedInvoiceId/replacesInvoiceId`، `payments.refundsInvoiceId`، `supplier_payment_allocations`، `goods_receipts.purchaseId`، `landed_cost_distributions` | `settlement.util.ts:150` (يقفل بـ `FOR UPDATE` تحت RLS، فالمرجع الأجنبي لا يُقفل ويعود فارغاً: مغلق فعلاً) | |

**القياس**: على قاعدة مبذورة بـ 111 ألف فاتورة و1500 عميل (القسم ٣): `ADD CONSTRAINT UNIQUE ("companyId", id)` على `customers` 4 مللي ثانية، `ADD CONSTRAINT ... NOT VALID` 1.5 مللي ثانية، `VALIDATE CONSTRAINT` 26 مللي ثانية. الهجرة بلا قفل يُذكر. وأُثبت الحقن قبلها: إدراج فاتورة في `c1000` بعميل من `c10000` تحت RLS بدور `app_user` نجح (صف واحد)، والعميل غير مرئي من المنشأة (صفر)، وبعد المفتاح المركب رُفض الإدراج بـ `violates foreign key constraint`.

**ما ينكسر وكيف يُهاجَر**:
- `Prisma` يتطلب أن يكون `companyId` في `fields` على العلاقة؛ التوليد `prisma generate` يغير أنواع `*CreateInput` المعتمدة على `connect` فقط، والمشروع لا يستعمل `connect` (صفر مواضع)، فالكسر التركيبي محصور في `*UncheckedCreateInput` التي تبقى كما هي.
- `tenantScopeExtension` تحقن `companyId` في `create` (`tenant-scope.extension.ts:227`)؛ يبقى، ويُزال حين تصير كل الكتابات صريحة.
- `TENANT_SCOPE_EXCEPTIONS` و`rls-coverage.live.spec.ts`: يُضاف إليهما فحص `dmmf`: لكل علاقة بين نموذجين مستأجرين إما `fields` تحمل `companyId` أو إعلان `@declared`. هذا الفحص يحل محل حرّاس التغطية النصية.
- الاختبارات: `test/*-tenant-isolation.e2e-spec.ts` تكسب اختباراً موحداً: "إدراج بمعرّف منشأة أخرى يعود 404 من الخدمة و`23503` من القاعدة".
- البيانات القائمة: إن وُجد صف يخالف (الاستعلام في العمود الأخير)، يُعالج يدوياً قبل الهجرة؛ التقدير من طبيعة الثغرة أنه صفر أو بضعة صفوف.

**`resolveOwned` وقاعدة الشجرة** (الطبقة الأولى، تُنفَّذ قبل الهجرات):

`src/common/tenant/resolve-owned.util.ts`:
```ts
type Owned = 'customer'|'supplier'|'product'|'warehouse'|'bank'|'account'|'branch'|'unit'|'property'|'contract'|'installment'|'invoice'|'purchase'|'employee'|'cashDrawer'|'leaveType';
export async function resolveOwned<M extends Owned, S>(tx: Prisma.TransactionClient, model: M, id: string, select?: S) {
  const row = await (tx[model] as { findUnique: (a: unknown) => Promise<unknown> }).findUnique({ where: { id }, select: select ?? { id: true } });
  if (!row) throw new NotFoundException(MSG[`${model}_not_found` as keyof typeof MSG]);
  return row as S extends undefined ? { id: string } : Prisma.Result<typeof tx[M], { select: S }, 'findUnique'>;
}
```
قاعدة `ESLint` (`eslint-rules/owned-id-resolved.js`): في أي `CallExpression` اسمه `create`/`createMany`/`update` على `tx.<model>`، لكل خاصية في `data` اسمها ينتهي بـ `Id` وقيمتها `MemberExpression` جذرها `dto`، يُطلب في جسم الدالة الحاوية استدعاء `resolveOwned(...)` يمرر نفس التعبير؛ وإلا `error`. الاستثناء بتعليق `// owned: <سبب>` قبل السطر، ويُعد في العدّاد (١.٥).

### ١.٢ نسخة واحدة تُقرأ

الجزء الرابع أعطى الجدول. ما نقص: الهجرات والمشغّلات نصاً، والمراحل.

**المرحلة أ (يوم): منع الكتابة من الخارج**
- `invoices/dto/update-invoice.dto.ts:25`: حذف `status`. `invoices.service.ts:690` يُحذف السطر.
- `reports.service.ts:541` و`:315` و`AccountsPage.tsx:119`: تقرأ من `journal_lines` لا من `balance`. استعلام واحد يخدم الثلاثة:
```sql
SELECT a.id, a.code, a.name, a.type,
       COALESCE(SUM(CASE WHEN a.type IN ('asset','expense') THEN l.debit - l.credit ELSE l.credit - l.debit END),0) AS balance
FROM accounts a LEFT JOIN journal_lines l ON l."accountId" = a.id
LEFT JOIN journal_entries e ON e.id = l."journalEntryId" AND e.date <= $asOf
GROUP BY a.id;
```
  قِيس بـ 300 ألف سطر: 134 مللي ثانية (القسم ٣).

**المرحلة ب (أسبوع): الحالة المشتقة بمشغّل**
`prisma/migrations/<ts>_derived_invoice_status/migration.sql`:
```sql
CREATE OR REPLACE FUNCTION invoice_recompute_status(p_invoice text) RETURNS void AS $$
UPDATE invoices i SET status = CASE
    WHEN i."docType" <> 'INVOICE' THEN 'PAID'
    WHEN COALESCE(s.paid,0) >= i.total - 0.005 THEN 'PAID'
    WHEN COALESCE(s.paid,0) > 0.005 THEN 'PARTIAL'
    ELSE 'DUE' END::"InvoiceStatus"
FROM (SELECT COALESCE(SUM(amount),0) paid FROM payment_allocations WHERE "invoiceId" = p_invoice) s
WHERE i.id = p_invoice;
$$ LANGUAGE sql;
CREATE OR REPLACE FUNCTION payment_allocations_touch() RETURNS trigger AS $$
BEGIN
  PERFORM invoice_recompute_status(COALESCE(NEW."invoiceId", OLD."invoiceId"));
  IF TG_OP = 'UPDATE' AND NEW."invoiceId" <> OLD."invoiceId" THEN PERFORM invoice_recompute_status(OLD."invoiceId"); END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER payment_allocations_touch AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
  FOR EACH ROW EXECUTE FUNCTION payment_allocations_touch();
-- تصحيح القائم مرة واحدة
SELECT invoice_recompute_status(id) FROM invoices;
```
`OVERDUE` يُحذف من التخزين ويُحسب في القراءة: `invoices.service.ts:109` `outstandingOf` تُعيد `overdue: dueDate < today && outstanding > 0`، و`InvoiceListView.tsx:119` يرشح عليه. تُحذف `recomputeInvoiceStatus` (`payments.service.ts:502`) و`syncSettlementStatus` (`invoices.service.ts:373`).

المشغّل تحت RLS: الدوال بـ `SECURITY INVOKER` (الافتراضي) تعمل في سياق المعاملة نفسها فترى صفوف المنشأة. مقبول لأن `invoiceId` لا يعبر المنشآت بعد ١.١ مرحلة ٥.

المثل لـ `purchases.status` على `supplier_payment_allocations`، ولـ `contract_installments.status` على `rent_payments`.

**المرحلة ج (أسبوع): المخزون**
```sql
CREATE MATERIALIZED VIEW stock_levels AS
SELECT "companyId","productId","warehouseId",
       SUM(CASE WHEN type IN ('IN','ADJUSTMENT') THEN qty WHEN type='OUT' THEN -qty ELSE -qty END) AS qty
FROM stock_movements GROUP BY 1,2,3
UNION ALL
SELECT "companyId","productId","toWarehouseId", SUM(qty) FROM stock_movements WHERE type='TRANSFER' GROUP BY 1,2,3;
CREATE UNIQUE INDEX ON stock_levels ("companyId","productId","warehouseId");
```
لا تحمل RLS (العرض المادي لا يقبلها)، فتُقرأ عبر دالة `SECURITY DEFINER` تُرشح بـ `current_setting('app.company_id')`، أو تُستبدل بجدول `stock_levels` يُحدَّث بمشغّل `AFTER INSERT` على `stock_movements` (أفضل: صف واحد لكل صنف ومستودع، RLS عادية). تُحذف `computeStockQuantities` و`currentStockQty` (`stock-quantity.util.ts:17` و`:47`) و`belowZero` (`sale-fulfilment.util.ts:129`) تقرأ الصف الواحد.

**المرحلة د (أسبوع): البنوك**
- حذف `banks.balance` و`baseBalance` من المخطط؛ `banks.service.ts:79` و`:150`، `contracts.service.ts:542`، `auto-posting.util.ts:1066` تتوقف عن الكتابة.
- `bank_transactions`: يبقى الجدول باسمه لكشف البنك المستورد فقط؛ تُحذف كتابة المرآة، ويُضاف `source = 'STATEMENT'` وعمود `matchedJournalLineId`. `reports.service.ts:295` يصير: رصيد الحساب من الدفتر مقابل مجموع الكشف المستورد.
- `bank-mirror.spec.ts` يُحذف.

**ما ينكسر**: `BankModal.tsx` و`BanksPage.tsx` تعرضان `balance`؛ تقرآن `account.balance` المشتق من الاستعلام أعلاه. `test/bank-postings.e2e-spec.ts` و`bank-difference-report.e2e-spec.ts` يُعاد كتابتهما على الدفتر.

### ١.٣ لا شبكة داخل معاملة

الجزء الرابع أعطى النمط. ما نقص: الهجرة والملفات.

`prisma/migrations/<ts>_outbox_lease/migration.sql`:
```sql
ALTER TABLE outbox_events ADD COLUMN "leaseUntil" timestamptz, ADD COLUMN "workerId" text, ADD COLUMN "unitKey" text;
CREATE INDEX outbox_due ON outbox_events ("availableAt") WHERE status IN ('PENDING','DISPATCHING');
UPDATE outbox_events SET "unitKey" = 'egs:' || (payload->>'egsUnitId') WHERE type = 'INVOICE_ISSUED';
```
`unitKey` يُملأ عند الإدراج من `events.emitCompliance` (`invoices.service.ts:617`) بوحدة الإصدار الافتراضية للمنشأة، ويُستعمل في المطالبة: `WHERE "unitKey" NOT IN (SELECT "unitKey" FROM outbox_events WHERE status='DISPATCHING' AND "leaseUntil" > now())`.

الملفات: `outbox/outbox.service.ts` (تُعاد كتابة `dispatchForCompany` إلى `claimOne`/`finish`/`fail`)، `outbox/outbox.module.ts:23` (الكرون يستدعي حلقة `while (claimOne())` بحد 200 لكل تشغيل)، `zatca/zatca.service.ts:312` (`claimAndBuild` بلا توقيع)، `:327` (كتابة `STAMPED` مشروطة)، `:582` (`fetch` بمهلة)، `hash-chain.util.ts:89` (`PIH` بـ `ORDER BY "zatcaIcv" DESC`)، `common/tenant/nested-transaction-probe.ts` (يرمي خارج الإنتاج).

المراحل: أ) المهلة على `fetch` وحدها (ساعة، تمنع التعليق)؛ ب) إخراج المرسل من المعاملة بالمطالبة الملتزمة (يومان)؛ ج) الترتيب على الوحدة و`PIH` بالـ `ICV` (يومان)؛ د) الكاشير معاملة واحدة (`pos.service.ts:396` إلى `:597`: تُدمج الثلاث في `ring` واحدة تستدعي `createWithinTx` ثم `recordPosReceipt` ثم `update` بـ `clientSaleId`، ويبقى الختم خارجها) (ثلاثة أيام).

ما ينكسر: `credit-context.ts` يفقد مبرر `IMMEDIATE` كتصريح نية ويصير حقيقة (السند في المعاملة نفسها)؛ `sync-stamp.spec.ts` و`offline-incidents.spec.ts` تُعاد كتابتهما سلوكاً؛ `icv-concurrency.live.spec.ts` يكسب فحص `PIH`.

### ١.٤ الحرّاس النصية

الجزء الرابع أعطى التوزيع الكامل بالأسماء. ما نقص: شكل قاعدة الشجرة الواحدة التي تستبدل أربعة حرّاس، كمثال يُقاس عليه.

`eslint-rules/branch-read-declared.js` (تستبدل `branch-read-declared.spec.ts`، `branch-from-request-checked.spec.ts`، `guard-reads-declared.spec.ts`، `company-user-reads-in-context.spec.ts`):
```js
module.exports = {
  meta: { type: 'problem', messages: { undeclared: 'قراءة {{model}} بلا branchFilter ولا إعلان @scope' } },
  create(ctx) {
    const branchModels = require('../scripts/branch-models.json'); // مشتق من dmmf في postinstall
    return {
      "CallExpression[callee.property.name=/^(findMany|findFirst|count|aggregate|groupBy)$/]"(node) {
        const model = node.callee.object?.property?.name; if (!branchModels.includes(model)) return;
        const fn = ctx.sourceCode.getAncestors(node).reverse().find((a) => /Function/.test(a.type));
        const src = ctx.sourceCode.getText(fn);
        const declared = ctx.sourceCode.getCommentsBefore(fn.parent ?? fn).some((c) => /@scope\s+company-wide\s+D-\d+/.test(c.value));
        if (!/branchFilter\(|requestedBranchFilter\(|assertBranchAllowed\(/.test(src) && !declared) ctx.report({ node, messageId: 'undeclared', data: { model } });
      },
    };
  },
};
```
الفرق عن الحارس النصي: يُطبق على الدالة لا الملف، يقرأ التعليق من الشجرة، ويطلب معرّف إعلان (١.٥) لا نصاً حراً. وبإضافة `Contract`/`RentPayment` إلى `branch-models.json` يدوياً (لا من العمود) يُغلق نصف الحارس الذي لم ير العقود: القاعدة تصير "نماذج تحتاج نطاق فرع" لا "نماذج تحمل العمود".

المراحل: أ) ثمانية حرّاس إلى `ESLint` بقاعدة واحدة أعلاه وقاعدة `no-restricted-syntax` لـ 12 حارساً بسيطاً (أسبوع)؛ ب) 12 إلى سلوك (أسبوع)؛ ج) 8 إلى القاعدة مع هجرات ١.١ و١.٢.

### ١.٥ عدّاد الإعلانات

الجزء الرابع أعطى البنية. ما نقص: الاختبار نصاً وحصر ما يُسجَّل اليوم.

`src/common/declarations.spec.ts`:
```ts
import { DECLARATIONS } from './declarations';
const BASELINE = 71; // 11 + 3 + 1 + 53 + 3 عند التسجيل الأول؛ يُخفض ولا يُرفع إلا بموافقة
describe('declared debt', () => {
  it('لا إعلان بعد أجله', () => {
    const today = new Date().toISOString().slice(0, 10);
    const expired = DECLARATIONS.filter((d) => d.expires < today);
    expect(expired.map((d) => `${d.id} (${d.owner}) ${d.file}`)).toEqual([]);
  });
  it('لكل إعلان إثبات باسمه', () => {
    for (const d of DECLARATIONS) {
      const [file, name] = d.proof.split('#');
      expect(readFileSync(join(__dirname, '..', '..', file), 'utf8')).toContain(`'${name}'`);
    }
  });
  it('العدّاد لا يزيد', () => expect(DECLARATIONS.length).toBeLessThanOrEqual(BASELINE));
  it('كل @declared في المصدر له مدخل', () => { /* grep D-\d+ في src ومقارنته بالمعرّفات */ });
});
```
هذا الاختبار نصي في بند واحد (قراءة `proof`) وهو من الفئة التي تبقى (ملف إعداد). ما يُسجَّل يوم التنفيذ: `TENANT_SCOPE_EXCEPTIONS` (11)، `BORROWED_FROM_EXPOSED` (3)، `EXPORT_EXCLUSIONS` (1)، تعليقات `SCOPE_DECLARATION` (53، وأتوقع أن يُحذف نصفها بتطبيق ١.٤)، `DEFERRAL_REASON` (1)، وثلاثة تعليقات "دين معلن" في `zatca-onboarding.service.ts:413` و`credit-context.ts` و`inventory.service.ts:119`.

## ٢. قواعد بناء الواجهة

عشر قواعد. لكل واحدة: ما تمنعه، مثال قائم، الفرض، الاستثناء.

**ق١: لا جمع مالي في الشاشة.** تمنع `reduce`/`+=`/`sum` على حقول مبالغ (`total`، `amount`، `balance`، `qty`، `*Total`، `*Amount`) في أي ملف تحت `pages/`. المثال: `DashboardPage.tsx:46`، `CustomerDetailModal.tsx:11`. الفرض: قاعدة `ESLint` `no-restricted-syntax` بمحدد `CallExpression[callee.property.name='reduce']` داخل `pages/**` و`components/**`، ويُسمح في `lib/money.ts` فقط. البنية: كل رقم مجمع يأتي من نقطة نهاية تُعيده باسمه (`outstanding`، `revenueBase`، `expectedCash`). الاستثناء: مجموع نموذج قيد الإدخال قبل الإرسال (سلة الكاشير، بنود الفاتورة) ويُعلن بتعليق `// preview-only: <endpoint>` ويُشترط أن يستدعي دالة من `packages/shared` مطابقة لدالة الخادم (`computeDocumentTotals` تُنقل إلى `packages/shared/src/money.ts` وتُستورد في الطرفين؛ `InvoiceBuilderView.tsx:65` و`PosPage.tsx:127` و`QuoteModal.tsx:41` و`DebitNoteModal.tsx:30` تستبدل بها).

**ق٢: لا اشتقاق حالة من حقل مخزن.** تمنع `status === 'PAID'` ونحوه لاستنتاج مبلغ. المثال: `CustomerDetailModal.tsx:14`، `DashboardPage.tsx:50`. الفرض: قاعدة `no-restricted-syntax` على `BinaryExpression[left.property.name='status']` داخل `reduce`/`filter` يليه `reduce`. البنية: الخادم يرسل الحالة والمبلغ معاً. الاستثناء: الترشيح للعرض (`filter` بلا جمع بعده) مسموح.

**ق٣: كل تحميل بيانات يمر بمغلّف واحد.** تمنع `useEffect` يستدعي دالة `api/*` مباشرة، وتمنع `.then(...).finally(...)` بلا `catch`. المثال: `DashboardPage.tsx:22` وسبع عشرة صفحة. الفرض: قاعدة `ESLint` ترفض استيراد `api/*` من `pages/**` إلا داخل `useQuery`/`useLoader` (خطاف واحد في `lib/useLoader.ts` يعيد `{ data, error, loading, retry }`)، وقاعدة ثانية ترفض `.finally(` على وعد بلا `.catch(` قبله في السلسلة. البنية: `useLoader` يعرض `ErrorState` مع زر إعادة عند الخطأ، ولا يُعرض `EmptyState` إلا عند نجاح بمصفوفة فارغة. الاستثناء: لا شيء.

**ق٤: لا `catch` صامت.** تمنع `.catch(() => {})` و`catch {}` وأي `catch` لا يستدعي `reportError` أو `setError`. المثال: `CashDrawersCard.tsx:33`، `ReceivablesAgingSection.tsx:41`. الفرض: `no-restricted-syntax` على `CatchClause[body.body.length=0]` وعلى `CallExpression[callee.property.name='catch'][arguments.0.body.body.length=0]`. البنية: `reportError` واحد يعرض تنبيهاً غير مانع ويسجل إلى الخادم (`POST /client-errors`). الاستثناء: تحميل مسبق تزييني (صور، اقتراحات) بتعليق `// best-effort`، ويُعد.

**ق٥: التنسيق لا يُخفي الغياب.** تمنع `fmt(undefined)` من إرجاع `0.00`. المثال: `lib/format.ts:4`. الفرض: `fmt` تقبل `number | string` فقط ولا تقبل `undefined` (التوقيع)، وترمي في التطوير عند `NaN`، وتعرض `—` في الإنتاج. اختبار وحدة: `fmt(NaN)` و`fmt(undefined as never)` لا يعيدان `0.00`. البنية: أنواع الاستجابات من الخادم تُولَّد من `OpenAPI`/`zod` وتُفحص عند الاستلام (`parse`) فلا يصل حقل ناقص إلى الشاشة أصلاً. الاستثناء: لا شيء.

**ق٦: الصفحات في الخادم.** تمنع `Pager` أو `slice(page*size)` على مصفوفة كاملة. المثال: `InvoiceListView.tsx` مع `invoices.service.ts:120`. الفرض: قاعدة ترفض استيراد `components/Pager` في ملف لا يمرر `page`/`pageSize` إلى استدعاء `api/*` (يُفحص بوجود `page:` في وسيط الاستدعاء داخل الملف). البنية: كل نقطة قائمة تعيد `{ items, total, page, pageSize }` (النمط قائم في `journal.service.ts:19`). الاستثناء: قوائم مرجعية صغيرة (فروع، عملات، مستودعات) بحد أقصى معلن في الخادم `take: 200`.

**ق٧: الصلاحية من الخادم لا من `actorType`.** تمنع `actorType === 'COMPANY'` كشرط عرض. المثال: `BranchesPage.tsx:14`، `CompanyProfilePage.tsx:19`، `SettingsPage.tsx:524`. الفرض: `no-restricted-syntax` على `BinaryExpression[left.property.name='actorType']` خارج `auth/`. البنية: `usePermissions().can(screen, action)` هي الطريقة الوحيدة، ومصدرها `GET /me/permissions` الذي يحسبه الخادم بنفس `isActionAllowed` (`tenant.guard.ts:197`)، وكل زر كتابة يُلف بـ `<Can screen action>`. اختبار: لكل `@RequiresAction` في المتحكمات زر مقابل يُغلف بـ `<Can>` (يُشتق من الشجرة، ويُحصى). الاستثناء: شاشات المالك بطبيعتها (`companyUsers`، `subscription`) تُعلن `owner-only` في الخادم بـ `@OwnerOnly` وفي الشاشة بـ `<OwnerOnly>`، والاثنان يُقارنان في اختبار.

**ق٨: الحالة الزمنية تُحسب عند القراءة.** تمنع الاعتماد على حالة مخزنة مشتقة من الوقت (`OVERDUE`، `LATE`، `EXPIRED`). المثال: `InvoiceListView.tsx:119`. الفرض: هذه القيم تُحذف من `enum` الاستجابة (بعد ١.٢ مرحلة ب) فلا يبقى ما يُقارَن به. الاستثناء: لا شيء.

**ق٩: نص المعنى مع الرقم.** تمنع رأس عمود عام ("الرصيد") على قيمة لها نطاق. المثال: `ReportsPage.tsx:530`. الفرض: بنيوي، لا آلي: كل حقل رقمي في نوع الاستجابة يحمل تعليق `JSDoc` يذكر النطاق (`/** صافي حركة الفترة، لا رصيداً */`) ومكوّن `Money` يعرض التلميح من التعليق عبر مولّد الأنواع. الاستثناء: لا شيء.

**ق١٠: لا منطق أعمال مكرر.** تمنع دالة في `web/src/lib` تحمل اسم دالة في `api/src/common` (`round2`، `computeTotals`، `deriveSettlementStatus`). الفرض: اختبار يقرأ أسماء التصدير من الجهتين ويرفض التقاطع إلا عبر `packages/shared`. البنية: `packages/shared` تحمل `money.ts` و`settlement.ts` و`totals.ts` وتُستورد من الطرفين. الاستثناء: لا شيء.

## ٣. القياس عند الحجم

**المنهج**: `PostgreSQL 16` محلياً، هجرات المشروع كلها (128) بدور `app_user` مالك المخطط كما في الإنتاج، RLS فعال، بذر ثلاث منشآت بـ 1000 و10 آلاف و100 ألف فاتورة، ولكل فاتورة 3 بنود و3 سطور دفتر و3 حركات مخزون ونصف سند. الاستعلامات هي ما يولده Prisma من الشيفرة (استعلام الجلب ثم التجميع في JS كما في المصدر)، بمحرك `pg` مباشرة؛ فالأرقام أدنى مما سيقيسه Prisma (تحويل الصفوف إلى كائنات و`Decimal` يضاعف الزمن مرتين إلى أربع في تجربتي). المعالج نواة واحدة، ذاكرة `shared_buffers` 256 م.ب، القاعدة دافئة. ملفات القياس: `bench/bench.mjs` و`bench/bench2.mjs` و`seed.sql` مرفقة بالتسليم.

**المسارات، الزمن والذاكرة لكل طلب** (مللي ثانية، وزيادة كومة JS بالميغابايت):

| المسار | الملف | 1 ألف | 10 آلاف | 100 ألف |
|---|---|---|---|---|
| قائمة الفواتير كاملة بالبنود والعملاء | `invoices.service.ts:120` | 56 / 3 | 319 / 30 | 3209 / 280 |
| حركة الحسابات للقوائم (كل السطور في JS) | `reports.service.ts:1008` | 45 / 1 | 55 / 7 | 419 / 54 |
| نفسه بـ `GROUP BY` في SQL | البديل | 4 / 1 | 8 / 0 | 134 / 0 |
| كميات المخزون (كل الحركات في JS) | `stock-quantity.util.ts:17` | 24 / 2 | 66 / 10 | 588 / 66 |
| نفسه في SQL | البديل | 11 / 0 | 12 / 0 | 122 / 0 |
| التعرض الائتماني (كل الفواتير) | `receivables-exposure.util.ts:150` | 19 / 1 | 62 / 7 | 611 / 68 |
| ميزان المراجعة شهر واحد | `reports.service.ts:721` | 3 | 18 | 154 |
| فحص ما بعد الصفر لصنف واحد | `sale-fulfilment.util.ts:129` | 3 | 3 | 10 |
| المركز المالي من `balance` | `reports.service.ts:541` | 2 | 2 | 2 |

القراءة: قائمة الفواتير هي أول ما يسقط. عند 100 ألف فاتورة تستغرق 3.2 ثانية خاماً؛ بمعامل Prisma تتجاوز مهلة المعاملة (5 ثوانٍ) فتعود `P2028` وتُعرض اللوحة بأصفار (`DashboardPage.tsx:22` يستدعيها). الحد الذي يُقاس عنده لا يُفترض: **بين 30 و50 ألف فاتورة** (3.2 ثانية × 2.5 ÷ 100 ألف ≈ 25 ألفاً عند الحد الأدنى من المعامل). و280 م.ب كومة لكل طلب: خمسة طلبات متزامنة على اللوحة تتجاوز 1.4 ج.ب، أي ذاكرة الحاوية المعتادة.

التقارير والمخزون لا تسقط بالمهلة حتى 100 ألف (0.4 إلى 0.6 ثانية) لكن تحمل 54 إلى 68 م.ب لكل طلب؛ الحد الذي يُقاس: 300 ألف سطر دفتر (نحو 100 ألف فاتورة) هو حيث تبدأ المهلة بمعامل Prisma. والبديل `SQL` أسرع 3 إلى 5 مرات وبلا ذاكرة.

**التزامن** (منشأة 10 آلاف، مجمع 9 اتصالات وهو ما يحسبه Prisma على 4 أنوية، `maxWait` ثانيتان كالافتراضي):

| السيناريو | 5 متزامنة | 10 | 20 | 50 |
|---|---|---|---|---|
| طلب قائمة يحتجز معاملة | 5 نجاح، p95 1.1 ث | 10 نجاح، p95 2.1 ث | 18 نجاح، 2 فشل | 18 نجاح، **32 فشل** |
| نفسه بمجمع 5 | 5 نجاح | 10 نجاح، p95 2.1 ث | 15 نجاح، 5 فشل | 15 نجاح، **35 فشل** |

الفشل هو `P2028` ("تعذر بدء المعاملة في المهلة"). الحد: **20 طلب قائمة متزامناً** على منشأة متوسطة يبدأ الفشل، و50 يسقط ثلثاها. مع ثلاث معاملات إضافية للحارس لكل طلب (`tenant.guard.ts:108` و`:178` و`:281`) يتضاعف الضغط على المجمع، فالحد العملي أدنى.

**تسلسل الصفوف الساخنة** (`journal-posting.util.ts:50`؛ كل بيع يحدّث `1200` و`4100` و`2200` ثم 60 مللي ثانية عمل داخل المعاملة نفسها):

| متزامنة | مع الصفوف الساخنة | بدونها |
|---|---|---|
| 1 | 64 مللي ثانية | |
| 5 | 315 (p50 192) | |
| 10 | 622 (p50 376) | 123 (p50 63) |
| 20 | **1246** (p50 689) | 187 (p50 125) |

الزمن الكلي مع الصفوف الساخنة = عدد المبيعات × زمن المعاملة، أي تسلسل تام؛ بدونها محدود بالمجمع فقط. الحد: عشر نقاط بيع في المنشأة تعمل بمعدل بيعة كل ثلاث ثوانٍ تكفي لتجاوز نصف ثانية انتظار لكل بيعة، والعشرون نقطة تتجاوز الثانية. العلاج: إزالة `applyLinesToBalances` من مسار البيع (١.٢ مرحلة أ) يعيد الـ 20 إلى 187.

**الطابور** (حسابياً على القياس أعلاه): `outbox.service.ts:111` بمهلة 5 ثوانٍ و20 صفاً: إن كان زمن الهيئة 300 مللي ثانية للفاتورة، ينتهي الوقت عند الصف السابع عشر؛ عند 500 مللي ثانية عند العاشر. الحد الذي يُقاس: **زمن استجابة الهيئة × 20 > 5 ثوانٍ**، أي 250 مللي ثانية، وهو أدنى من زمن الهيئة الاعتيادي.

**ما لم يُقس**: زمن Prisma الفعلي (يحتاج بناء المشروع كاملاً)، والشبكة، وحجم مستأجرين كثر في قاعدة واحدة (بُذرت ثلاث منشآت فقط؛ RLS على 111 ألف فاتورة لم يظهر له أثر يُذكر في الخطط لأن الفهارس تبدأ بـ `companyId`).

## ٤. ترتيب تنفيذ الملاحظات كلها، وما لا يُصلَح

جمعت الملاحظات من الأجزاء الخمسة (نحو 75 موضعاً) في عشر حزم، لأن الإصلاح بالحزمة لا بالسطر. الترتيب بمعيار: أثر على المال أو الالتزام النظامي، مقسوماً على الكلفة.

**الحزمة ١ (يومان): ما يُغلق بسطر**
- `tenant.guard.ts:188` رفض افتراضي بلا `@RequiresScreen`.
- `update-invoice.dto.ts:25` حذف `status`.
- `zatca.service.ts:582` مهلة على `fetch`.
- `retry-on-conflict.util.ts:3` حصر إعادة المحاولة في قيد `no`.
- `payments.service.ts:247` رفض `allocate` على سند له عكس.
- `contracts.service.ts:402` رفض القبض على عقد أو قسط ملغى.
- `hash-chain.util.ts:89` الـ `PIH` بـ `ICV - 1` أياً كانت الحالة.
- `pos.service.ts:28` الضريبة من الصنف (يحتاج حقلاً على `Product`، نصف يوم).

**الحزمة ٢ (ثلاثة أيام): الأرقام أمام المالك**
- `DashboardPage.tsx:46` و`:50`، `CustomerDetailModal.tsx:11` إلى `:17`، `SupplierDetailModal.tsx:23`: من الخادم.
- `lib/format.ts:4`، و`useLoader` مع `catch` عام (ق٣، ق٤، ق٥).
- `ReportsPage.tsx:530` رأس "حركة الفترة" مؤقتاً حتى ١.٢.

**الحزمة ٣ (ثلاثة أيام): الحقن بالمعرّف**
- `resolveOwned` في كل `create` (١.١ الطبقة الأولى)، بدءاً بـ `invoices.service.ts:497` و`:524`.

**الحزمة ٤ (أسبوع): الطابور والهيئة والكاشير**
- ١.٣ مراحل ب وج ود. تشمل `pos.service.ts:263` و`:116` و`:696`، `write-offs.service.ts:196` (كتابة مشروطة)، `outbox.service.ts:111`، `zatca.service.ts:614` (تخزين `clearedInvoice`).

**الحزمة ٥ (أسبوعان): نسخة واحدة تُقرأ**
- ١.٢ مراحل أ وب وج. تغلق: `reports.service.ts:541` و`:315` و`:740` و`:597`، `journal-posting.util.ts:50` (التسلسل)، `stock-quantity.util.ts:17`، `sale-fulfilment.util.ts:129`، `InvoiceListView.tsx:119`، `bank-mirror.spec.ts:33`، `contracts.service.ts:542`.

**الحزمة ٦ (أسبوع): الإقرار والاعتراف**
- `obligations.service.ts:142` (بالأساس) و`:158` (بالبند).
- `rent-recognition.service.ts:174` قفل الصف، وقيد فريد على `rent_accruals (installmentId, kind, date)`.
- `contracts.service.ts:560` سقف الدفعة وقفل القسط.
- `landed-costs.service.ts:176` تمييز التحويل والمرتجع.

**الحزمة ٧ (أسبوع): المفاتيح المركبة** (١.١ المراحل الخمس).

**الحزمة ٨ (أسبوع): الصلاحيات في الواجهة والصفحات**
- ق٦ وق٧: `PermissionsContext.tsx:134` تُستعمل، `invoices.service.ts:120` وأخواتها تُصفَّح، `contracts.controller.ts:39` قيد الفرع عبر العقار.

**الحزمة ٩ (أسبوعان، بالتوازي): الحرّاس والعدّاد** (١.٤ و١.٥).

**الحزمة ١٠ (متى تيسر): المحو والمصادقة والاشتراك**
- `audit.interceptor.ts:141` استبعاد حقول التواصل من `details`.
- `company-users.service.ts:139` إبطال الرموز عند تغيير الكلمة.
- `auth.service.ts:151` تسامح نافذة 10 ثوانٍ مع إعادة استعمال الرمز المدوَّر (نمط `refresh token reuse grace`).
- `subscription.service.ts:74` ربط التجديد بدفع أو تعطيله حتى يُربط.
- `zatca-onboarding.service.ts:413` قراءة `notAfter` وتنبيه قبل 30 يوماً.

**ما لا يستحق الإصلاح** (أو يُؤجل بلا ضرر):
- `costing.util.ts:147` ثماني دورات: الحالة تحتاج تسابقاً على صنف واحد أكثر من ثماني مرات في ثوانٍ، والباقي يُقيَّد مؤقتاً ويُسوَّى؛ يكفي رفع الحد إلى 32 وتسجيل تحذير.
- `tasks.service.ts:342` تسلسل سجل المهام: يُنتج 500 نادراً وبلا أثر مالي؛ يكفي `retryOnUniqueConflict` حوله (بعد حصره).
- `company-archive.service.ts:210` تداخل أسماء `XML`: نظري.
- `export-scope.ts:28` تصدير `credentials` المشفرة: يُضاف إلى الاستثناءات في دقيقة، لا أثر أمني فعلي.
- `payments.service.ts:509` توقيت `OVERDUE`: يزول مع ١.٢ مرحلة ب، لا يُصلح منفرداً.
- `obligations.service.ts:198` عدد المشتريات مع الملغاة: تجميلي.
- `AccountsPage.tsx:119` مجموع المجموعات: يزول مع الحزمة ٥.
- تعليقات "دين معلن" على الجداول الثلاثة بلا `FORCE` (`tenant-scope-exceptions.ts:59`): الطبقة الأولى تغطيها، والمخاطر تحتاج ثغرة ثانية؛ تُسجَّل في العدّاد بأجل وتُترك.
- `auth.controller.ts:24` الحد بالعدد في الذاكرة عبر نسخ عدة: لا توجد نسخ عدة اليوم.
- الميزانية بتاريخ (`reports.service.ts:541`): تُحل بالاستعلام في ١.٢ مرحلة أ مجاناً، فلا تُعامل كبند مستقل.

المجموع لشخص واحد نحو عشرة أسابيع؛ الحزم ٢ و٨ و٩ يمكن أن يأخذها مطور الواجهة بالتوازي فتصير ستة.
