-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('PAYMENT_GATEWAY', 'BNPL', 'ECOMMERCE');

-- AlterTable
ALTER TABLE "pos_payments" ADD COLUMN     "providerRef" TEXT;

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT,
    "credentials" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- One ACTIVE connection per kind per company (disabled history may pile up):
-- partial unique — Prisma can't express it, so it lives here + service check.
CREATE UNIQUE INDEX "integration_connections_one_enabled_per_kind"
  ON "integration_connections"("companyId", "kind") WHERE "enabled";

-- Row-Level Security: tenant isolation (same block as every other tenant table).
ALTER TABLE "integration_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_connections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_integration_connections ON "integration_connections"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
