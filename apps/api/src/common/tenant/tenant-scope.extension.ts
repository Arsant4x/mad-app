import { Prisma } from '@prisma/client';

/**
 * Names of Prisma models that hold per-company business data. Every model
 * added here MUST have a `companyId` column and a matching RLS policy
 * (see prisma/migrations .../rls.sql). This is the single place a developer
 * has to remember to update when adding a new tenant-scoped table — forgetting
 * to add it here means queries against that model simply won't be auto-scoped,
 * so treat this list as part of the schema itself.
 *
 * `CompanyUserBranch` is deliberately absent: it carries no `companyId` of its
 * own and is only reachable through a CompanyUser that is already scoped, so
 * there is nothing here to inject. Branch visibility is a *permission* filter
 * (owner sees all, employee sees the branches granted to them), not the
 * absolute company boundary this extension enforces.
 */
export const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  'BusinessActivity',
  'Branch',
  'Currency',
  'ExchangeRate',
  'FiscalYear',
  'FiscalPeriod',
  'Account',
  'Customer',
  'Invoice',
  'Quote',
  'QuoteLine',
  'InvoiceLine',
  'Supplier',
  'Purchase',
  'Product',
  'Employee',
  'Bank',
  'BankTransaction',
  'JournalEntry',
  'JournalLine',
  'Property',
  'Unit',
  'Contract',
  'Installment',
  'RentPayment',
  'ContractDeposit',
  'DepositDeduction',
  'ContractClaim',
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
