-- CreateTable
CREATE TABLE "banks" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iban" TEXT,
    "balance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banks_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "banks" ADD CONSTRAINT "banks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security, same pattern as every other tenant table — see the
-- comment on "accounts" in the initial migration.
ALTER TABLE "banks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "banks" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_banks ON "banks"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
