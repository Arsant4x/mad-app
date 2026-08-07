-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- DropIndex
DROP INDEX "banks_deletedAt_idx";

-- DropIndex
DROP INDEX "customers_deletedAt_idx";

-- DropIndex
DROP INDEX "employees_deletedAt_idx";

-- DropIndex
DROP INDEX "message_scripts_deletedAt_idx";

-- DropIndex
DROP INDEX "products_deletedAt_idx";

-- DropIndex
DROP INDEX "properties_deletedAt_idx";

-- DropIndex
DROP INDEX "suppliers_deletedAt_idx";

-- DropIndex
DROP INDEX "units_deletedAt_idx";

-- DropIndex
DROP INDEX "warehouses_deletedAt_idx";

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decidedNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_deletion_requests_status_idx" ON "account_deletion_requests"("status");

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row-Level Security: tenant isolation (same block as every other tenant table).
-- The platform admin reads these through the superuser-free service path that
-- deliberately runs unscoped (companies table pattern) — see the service note.
ALTER TABLE "account_deletion_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_account_deletion_requests ON "account_deletion_requests"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
