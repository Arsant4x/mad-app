-- ============================================================================
-- Structural wave: business activities + branches, multi-currency, fiscal year.
--
-- These three land together on purpose. All of them add columns to the *same*
-- financial tables, so doing them as one migration is a single pass over
-- invoices/purchases/journal_entries/contracts/... instead of three.
--
-- Every `baseXxx` column is NOT NULL in the final schema, but existing rows
-- have no value for it — so each is added nullable, backfilled from the
-- amount it mirrors (rate 1.0, since everything so far is in SAR), and only
-- then made NOT NULL. Adding them NOT NULL up front would abort the migration
-- on any non-empty table.
-- ============================================================================

-- CreateEnum
CREATE TYPE "FiscalPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- ---------------------------------------------------------------------------
-- 1) New columns (base* nullable for now)
-- ---------------------------------------------------------------------------

ALTER TABLE "companies" ADD COLUMN     "baseCurrency" TEXT NOT NULL DEFAULT 'SAR';

ALTER TABLE "invoices" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseSubtotal" DECIMAL(18,2),
ADD COLUMN     "baseTaxTotal" DECIMAL(18,2),
ADD COLUMN     "baseTotal" DECIMAL(18,2);

ALTER TABLE "purchases" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseSubtotal" DECIMAL(18,2),
ADD COLUMN     "baseTaxAmount" DECIMAL(18,2),
ADD COLUMN     "baseTotal" DECIMAL(18,2);

ALTER TABLE "journal_entries" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseTotalDebit" DECIMAL(18,2),
ADD COLUMN     "baseTotalCredit" DECIMAL(18,2);

ALTER TABLE "contracts" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseValue" DECIMAL(18,2);

ALTER TABLE "contract_installments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseAmount" DECIMAL(18,2);

ALTER TABLE "rent_payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseAmount" DECIMAL(18,2),
ADD COLUMN     "baseDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "baseNetAmount" DECIMAL(18,2);

ALTER TABLE "banks" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "baseOpeningBalance" DECIMAL(18,2) NOT NULL DEFAULT 0;

ALTER TABLE "bank_transactions" ADD COLUMN     "branchId" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'SAR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "baseAmount" DECIMAL(18,2);

ALTER TABLE "employees" ADD COLUMN     "branchId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN     "branchId" TEXT;
ALTER TABLE "products" ADD COLUMN     "activityId" TEXT;

-- ---------------------------------------------------------------------------
-- 2) Backfill: everything that exists today is SAR at rate 1, so the base
--    figure equals the original amount.
--
--    IMPORTANT: migrations connect as `app_user`, which is deliberately a
--    non-superuser without BYPASSRLS, and these tables are FORCE ROW LEVEL
--    SECURITY. With no `app.company_id` set, every row is invisible — so a
--    plain UPDATE here silently touches 0 rows and the SET NOT NULL below
--    then fails on the still-null column. `NO FORCE` lets the table *owner*
--    (app_user, which created these tables) see them for the duration of the
--    backfill; FORCE is restored immediately after, so the isolation
--    guarantee is unchanged once this migration finishes.
-- ---------------------------------------------------------------------------

ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "purchases" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "contract_installments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "rent_payments" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "banks" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "bank_transactions" NO FORCE ROW LEVEL SECURITY;

UPDATE "invoices" SET "baseSubtotal" = "subtotal", "baseTaxTotal" = "taxTotal", "baseTotal" = "total";
UPDATE "purchases" SET "baseSubtotal" = "subtotal", "baseTaxAmount" = "taxAmount", "baseTotal" = "total";
UPDATE "journal_entries" SET "baseTotalDebit" = "totalDebit", "baseTotalCredit" = "totalCredit";
UPDATE "contracts" SET "baseValue" = "value";
UPDATE "contract_installments" SET "baseAmount" = "amount";
UPDATE "rent_payments" SET "baseAmount" = "amount", "baseDiscount" = "discount", "baseNetAmount" = "netAmount";
UPDATE "banks" SET "baseBalance" = "balance", "baseOpeningBalance" = "openingBalance";
UPDATE "bank_transactions" SET "baseAmount" = "amount";

ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "journal_entries" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contracts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "contract_installments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rent_payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "banks" FORCE ROW LEVEL SECURITY;
ALTER TABLE "bank_transactions" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Now that no row is null, enforce NOT NULL to match the schema.
-- ---------------------------------------------------------------------------

ALTER TABLE "invoices" ALTER COLUMN "baseSubtotal" SET NOT NULL,
ALTER COLUMN "baseTaxTotal" SET NOT NULL,
ALTER COLUMN "baseTotal" SET NOT NULL;

ALTER TABLE "purchases" ALTER COLUMN "baseSubtotal" SET NOT NULL,
ALTER COLUMN "baseTaxAmount" SET NOT NULL,
ALTER COLUMN "baseTotal" SET NOT NULL;

ALTER TABLE "journal_entries" ALTER COLUMN "baseTotalDebit" SET NOT NULL,
ALTER COLUMN "baseTotalCredit" SET NOT NULL;

ALTER TABLE "contracts" ALTER COLUMN "baseValue" SET NOT NULL;
ALTER TABLE "contract_installments" ALTER COLUMN "baseAmount" SET NOT NULL;

ALTER TABLE "rent_payments" ALTER COLUMN "baseAmount" SET NOT NULL,
ALTER COLUMN "baseNetAmount" SET NOT NULL;

ALTER TABLE "bank_transactions" ALTER COLUMN "baseAmount" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 4) New tables
-- ---------------------------------------------------------------------------

CREATE TABLE "business_activities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "activityType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "activityId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "propertyId" TEXT,
    "warehouseId" TEXT,
    "hours" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_user_branches" (
    "id" TEXT NOT NULL,
    "companyUserId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_user_branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "currencies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromCode" TEXT NOT NULL,
    "toCode" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_years" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start" DATE NOT NULL,
    "end" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalYearId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "FiscalPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_name_key" ON "branches"("companyId", "name");
CREATE UNIQUE INDEX "company_user_branches_companyUserId_branchId_key" ON "company_user_branches"("companyUserId", "branchId");
CREATE UNIQUE INDEX "currencies_companyId_code_key" ON "currencies"("companyId", "code");
CREATE UNIQUE INDEX "exchange_rates_companyId_fromCode_toCode_date_key" ON "exchange_rates"("companyId", "fromCode", "toCode", "date");
CREATE UNIQUE INDEX "fiscal_years_companyId_name_key" ON "fiscal_years"("companyId", "name");
CREATE UNIQUE INDEX "fiscal_periods_companyId_year_month_key" ON "fiscal_periods"("companyId", "year", "month");

-- ---------------------------------------------------------------------------
-- 5) Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "business_activities" ADD CONSTRAINT "business_activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "business_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "branches" ADD CONSTRAINT "branches_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "company_user_branches" ADD CONSTRAINT "company_user_branches_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES "company_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_user_branches" ADD CONSTRAINT "company_user_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "currencies" ADD CONSTRAINT "currencies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiscal_periods" ADD CONSTRAINT "fiscal_periods_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "fiscal_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "business_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "banks" ADD CONSTRAINT "banks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 6) Row-Level Security — same shape as every other tenant table (see the
--    comment on "accounts" in the initial migration). Without this the new
--    tables would be readable across companies even though the app-layer
--    extension scopes them, which is exactly the two-layer rule this project
--    refuses to break.
--
--    company_user_branches is deliberately *not* RLS-scoped: it has no
--    companyId of its own, and is reachable only through a CompanyUser that
--    is already company-scoped. Its FKs cascade from there.
-- ---------------------------------------------------------------------------

ALTER TABLE "business_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "business_activities" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_business_activities ON "business_activities"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_branches ON "branches"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "currencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "currencies" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_currencies ON "currencies"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "exchange_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exchange_rates" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_exchange_rates ON "exchange_rates"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "fiscal_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_years" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fiscal_years ON "fiscal_years"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "fiscal_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fiscal_periods" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fiscal_periods ON "fiscal_periods"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
