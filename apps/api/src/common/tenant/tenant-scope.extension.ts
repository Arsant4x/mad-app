import { Prisma } from '@mad-app/db';

/**
 * Names of Prisma models that hold per-company business data. Every model
 * added here MUST have a `companyId` column and a matching RLS policy
 * (see prisma/migrations .../rls.sql). This is the single place a developer
 * has to remember to update when adding a new tenant-scoped table — forgetting
 * to add it here means queries against that model simply won't be auto-scoped,
 * so treat this list as part of the schema itself.
 *
 * `CompanyUserBranch` is deliberately absent: it carries no `companyId` of its
 * own, so there is nothing here to inject. Branch visibility is a *permission*
 * filter (owner sees all, employee sees the branches granted to them), not the
 * absolute company boundary this extension enforces.
 *
 * ⚠️ **تصحيح 2026-08-15 — المبرّر السابق كان باطلاً.** كان التعليق يقول إن
 * `CompanyUserBranch` «لا يُبلَغ إلا عبر `CompanyUser` **المشمول بالنطاق**».
 * و`CompanyUser` **ليس في هذه القائمة** — ولم يكن. فالمقدّمة التي بُني عليها
 * الاستثناء كاذبة، والتعليق كان **يطمئن قارئه إلى أمانٍ غير قائم**.
 *
 * و`CompanyUser` نفسه **بلا `RLS` في القاعدة أيضاً** (`ENABLE`/`POLICY` صفر في
 * الهجرات — مُثبَت 2026-08-15 على قاعدة مبنيّة من الهجرات وحدها، ومعه عبورٌ
 * فعلي بين منشأتين). أي أن الطبقتين ساقطتان معاً عليه.
 *
 * ⬅️ **والقاعدة المستخلصة (مسجَّلة في CLAUDE.md §8.9):** استثناءٌ في طبقة بلا
 * تعويضٍ في الأخرى **ليس استثناءً بل ثغرةٌ موثَّقة**. فالاستثناء هنا كان
 * مبرَّراً بمسار الدخول — ولم يُضَف الضابط المعوِّض قط.
 *
 * ولا يُضاف `CompanyUser` إلى القائمة **قبل** حسم آلية التصريح في القاعدة
 * (قرار المالك 2026-08-15: دورٌ ثانٍ بـ`BYPASSRLS` للدخول + سياسة صريحة لدور
 * الإدارة لوضع الدعم) — لأن تفعيل طبقةٍ دون الأخرى يكسر الدخول بلا أن يعزل.
 */
export const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'BusinessActivity',
  'Branch',
  // طابور الإرسال: صفوفه تحمل `companyId` وتُقرأ داخل سياق كل منشأة، فالطبقة
  // الأولى تحقنه والثانية (RLS) تُبقيه صحيحاً لو أخطأت الأولى.
  'OutboxEvent',
  // عدّادُ تسلسل المستندات (`ق-٣٢٨`): صفٌّ لكل (منشأة · نوع · سنة) — وترقيمُ
  // منشأةٍ لا يُقرأ ولا يُكتب من سياق أخرى، كأيّ صفٍّ يحمل `companyId`.
  'DocumentSequence',
  // وما أُخذ منه (`ق-٣٤٥`): يُكتب من المنفذ بسياقه، ويُختم ويُقرأ تحت سياق المنشأة.
  'DocumentNumberAllocation',
  // قبولُ التاجر لقائمة المعالجين الفرعيين (`ق-٥٨٩`): صفٌّ يحمل `companyId` ويُقرأ تحت
  // سياق منشأته — وقبولُ منشأةٍ لا يُقرأ ولا يُكتب من سياق أخرى.
  'ProcessingAgreementAcceptance',
  'Currency',
  'ExchangeRate',
  'FiscalYear',
  'FiscalPeriod',
  'Account',
  'Customer',
  'Invoice',
  'Payment',
  'PaymentAllocation',
  // سندُ الصرف للمورّد وتخصيصاتُه (ق-٨٧١): مرآةُ سند القبض في جدولٍ مستقلّ — وطبقتا العزل نفسُهما.
  'SupplierPayment',
  'SupplierPaymentAllocation',
  'Quote',
  'QuoteLine',
  'InvoiceLine',
  'Supplier',
  'Purchase',
  // ⑦A3 إيداعُ الدرج في البنك (ق-١٢٦١ ج): يحمل companyId وتحته RLS بـFORCE — طبقتان.
  'CashDeposit',
  // ⑦A2 تسويةُ الشبكة 1251 (ق-١٢٦١ ج): يحمل companyId وتحته RLS بـFORCE — طبقتان.
  'NetworkSettlement',
  // ④A1 تطبيقُ الدفعة المقدَّمة على فاتورة التوريد (ق-١٢٦١ ب): يحمل companyId وتحته RLS بـFORCE — طبقتان.
  'InvoicePrepayment',
  // ٢٥ الاستلامُ وسطورُه (ق-١١٣١): يحملان companyId وتحتهما RLS بـFORCE — طبقتان كالشراء.
  'GoodsReceipt',
  'GoodsReceiptLine',
  // ٧ توزيعُ التكلفة المحمَّلة وسطورُه (ق-١١٤٥): يحملان companyId وتحتهما RLS بـFORCE — طبقتان.
  'LandedCostDistribution',
  'LandedCostLine',
  // ⚖️ أحداثُ ضريبة المدخلات غيرِ القابلة للخصم وسطورُها (ق-١٣٤٢): يحملان companyId وتحتهما RLS بـFORCE — طبقتان.
  'NonDeductibleVatEvent',
  'NonDeductibleVatEventLine',
  // ⚖️ حصصُ رفع التكلفة على الطبقات ومخارجها (ق-١٣٦٤): تحمل companyId وتحتها RLS بـFORCE — طبقتان.
  'LayerCostShare',
  // ٣٠ إعلانُ الأرصدة الافتتاحية للمخزون وسطورُه (ق-١١٧٩): يحملان companyId وتحتهما RLS بـFORCE — طبقتان.
  'StockOpening',
  'StockOpeningLine',
  'Product',
  'StockBatch',
  'Employee',
  'Bank',
  'BankTransaction',
  'JournalEntry',
  'JournalLine',
  'InventoryWriteOff',
  'InventoryWriteOffAttachment',
  // وحدات الإصدار: تحمل companyId وتُقرأ داخل سياق المنشأة — وRLS بـFORCE.
  'EgsUnit',
  'PosOfflineIncident',
  // درجُ الكاشير (ق-٢١٨ · ق-٢٦١): يحمل companyId، وحسابُه في الدليل واحدٌ لواحد.
  'CashDrawer',
  'Property',
  'Unit',
  'Contract',
  'Installment',
  'RentPayment',
  // صفُّ استحقاق الإيجار — ما يقرؤه الدفترُ والإقرارُ معاً (ق-٩١٧).
  'RentAccrual',
  'VatReturnFiling',
  'VatProportionalRatio',
  'VatReturnCorrection',
  // ⚖️ حدثُ إقفال الإقرار (ق-١٣٦٠): يحمل companyId وتحته RLS بـFORCE — طبقتان.
  'VatReturnClosing',
  'ContractDeposit',
  'DepositDeduction',
  'ContractClaim',
  // ⚖️ بندُ رسمٍ على العقد (السؤالان ٤٩ و٤١٣ · ق-١٦٠٠): companyId وRLS بـFORCE — طبقتان.
  'ContractFee',
  // ⚖️ مدّةُ التوقيع لكلِّ نوعٍ في المنشأة (توجيه ٢٨٧): companyId إلزاميّ وRLS بـFORCE — طبقتان.
  'FormTypeSetting',
  // ⚖️ سجلُّ النموذج المعبّأ وقيمُه وختمُه (توجيه ٢٧٨ · ق-١٦٣٦): companyId إلزاميّ وRLS بـFORCE — طبقتان. والقالبُ ثنائيُّ النطاق خارجها (db-only).
  'FormInstance',
  'FormValue',
  'FormSeal',
  // ⚖️ تحدّي رمز التحقّق (توجيه ٢٨٧): companyId إلزاميّ وRLS بـFORCE — طبقتان.
  'VerificationChallenge',
  'ContractKeyMoney',
  'ContractHandover',
  'HandoverItem',
  'ContractAttachment',
  'ClaimAttachment',
  'HandoverPhoto',
  'ContractSettlementLine',
  'LeaveType',
  'LeaveRequest',
  'AuditLog',
  'AccountDeletionRequest',
  'AttendanceRecord',
  'PurchaseAttachment',
  'PosShift',
  'PosPayment',
  // محاولةُ دفع البطاقة (`ق-١٤٠١`): صفٌّ يحمل `companyId` ولقطةَ بيعٍ ومرجعَ مزوّد — لا يُقرأ ولا يُكتب من سياق منشأةٍ أخرى.
  'PosPaymentAttempt',
  'IntegrationConnection',
  'SupportAccessGrant',
  'SupportAccessLog',
  'MaintenanceRequest',
  'ReminderPolicy',
  'RentReminder',
  'Notification',
  'Warranty',
  'Warehouse',
  'StockMovement',
  'GovernmentObligation',
  'Reservation',
  'MessageScript',
  'ZatcaCredential',
  // الحساباتُ الفرعية (المرحلة ④ · ق-٦٧٥): كانت خارج القائمة عمداً حتى يُحسم مسارُ
  // الدخول الذي يقرؤها قبل معرفة المستأجر — وحُسم في ② (الهويّةُ تحمل منشأتَها، ق-٦٦٦)
  // ونُقلت قراءاتُها كلُّها إلى سياقها في ① (ق-٦٥٧). فتُحقن هنا وتُحرَس في القاعدة معاً.
  // (`CompanyUserBranch` بلا companyId — يُبلَغ عبر أبيه وسياستُه EXISTS عليه.)
  'CompanyUser',
  // مفاتيحُ الأنظمة (`ق-١٢٩١` · ي/⑫A3): قراءاتُ الإدارة كلُّها داخل سياق المنشأة، وقراءةُ
  // المصادقة وحدَها بمسندٍ مسمّى (`runAsApiKeyLookup`) بعميلٍ خامٍّ لا يمرّ بهذا الحقن.
  'ApiKey',
  // قياسُ الاستعمال (`ق-١٢٩١` · ي/㉑A1): كلُّ قراءةٍ وكتابةٍ داخل سياق المنشأة.
  'IntegrationUsage',
  // وقائعُ الموافقة التسويقية (`ق-١٣٠٣` · ك/⑰A1): تُقرأ وتُكتب داخل سياق منشأة العميل وحدَه.
  'MarketingConsent',
]);

const READ_OR_MUTATE_BY_WHERE = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Models whose rows go to the trash instead of vanishing — master records a
 * user could plausibly delete by mistake and need back.
 *
 * Deliberately excludes invoices, journal entries and contracts: those carry
 * their own stricter rules (a posted entry is never deleted; a lease is
 * cancelled, never removed), and giving them a restore path would undermine
 * that.
 */
/** Operations that only look at rows. The soft-delete filter applies to these
 * alone — see the note at the injection site. */
const READ_ONLY_OPERATIONS = new Set(['findMany','findFirst','findFirstOrThrow','findUnique','findUniqueOrThrow','count','aggregate','groupBy']);

export const SOFT_DELETE_MODELS = new Set<Prisma.ModelName>([
  'Customer',
  'Supplier',
  'Product',
  'Employee',
  'Bank',
  'Warehouse',
  'MessageScript',
  'Property',
  'Unit',
]);

/**
 * A Prisma Client extension that transparently injects `companyId` into every
 * query for tenant-scoped models, for one specific company. Build a fresh
 * extended client per request/transaction via `tenantScopeExtension(companyId)`
 * — never share one across requests.
 *
 * This is layer 1 of tenant isolation: application-level, automatic, and
 * impossible to forget because it's centralized here rather than repeated in
 * every service. Layer 2 is Postgres Row-Level Security (see rls.sql), which
 * enforces the same boundary independently at the database level in case a
 * query ever bypasses this extension (e.g. a future raw SQL query).
 */
export function tenantScopeExtension(companyId: string) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;

          if (READ_OR_MUTATE_BY_WHERE.has(operation)) {
            a.where = { ...(a.where as object | undefined), companyId };
          }

          // ---- Soft delete: hide trashed rows everywhere, centrally ----
          // Filtering lives here for the same reason tenant scoping does: it is
          // needed by *every* read of these models, and a service that forgets
          // it would silently show deleted records. The delete→stamp conversion
          // cannot live here (Prisma's extension API can't switch a `delete`
          // into an `update`), so each service's remove() does it explicitly —
          // one obvious line, in the one place that already exists per model.
          //
          // Reads only — never update/delete. Those are how the trash restores
          // and purges, and they deliberately target a row that *is* deleted;
          // injecting `deletedAt: null` there would make both impossible.
          // Services still can't touch a trashed row by accident, because they
          // locate it with a (filtered) read first.
          if (SOFT_DELETE_MODELS.has(model) && READ_ONLY_OPERATIONS.has(operation)) {
            const where = a.where as Record<string, unknown>;
            if (where.deletedAt === undefined) where.deletedAt = null;
          }

          if (operation === 'create') {
            a.data = { ...(a.data as object | undefined), companyId };
          }

          if (operation === 'createMany' && Array.isArray(a.data)) {
            a.data = (a.data as object[]).map((row) => ({ ...row, companyId }));
          }

          if (operation === 'upsert') {
            a.where = { ...(a.where as object | undefined), companyId };
            a.create = { ...(a.create as object | undefined), companyId };
          }

          return query(a);
        },
      },
    },
  });
}
