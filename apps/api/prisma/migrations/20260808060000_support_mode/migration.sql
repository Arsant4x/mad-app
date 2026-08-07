-- CreateEnum
CREATE TYPE "SupportGrantStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'REVOKED');

-- CreateTable
CREATE TABLE "support_access_grants" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "SupportGrantStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "support_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "grantId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_access_grants_companyId_status_idx" ON "support_access_grants"("companyId", "status");

-- CreateIndex
CREATE INDEX "support_access_logs_companyId_at_idx" ON "support_access_logs"("companyId", "at");

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_logs" ADD CONSTRAINT "support_access_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_logs" ADD CONSTRAINT "support_access_logs_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "support_access_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ENABLE without FORCE (the account_deletion_requests pattern): the platform
-- admin manages grants unscoped through the owner role, while tenant-context
-- reads stay policy-filtered. The owner-visible log rides the same rule.
ALTER TABLE "support_access_grants" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_support_access_grants ON "support_access_grants"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
ALTER TABLE "support_access_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_support_access_logs ON "support_access_logs"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
