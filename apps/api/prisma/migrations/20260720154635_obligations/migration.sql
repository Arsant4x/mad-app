-- CreateTable
CREATE TABLE "government_obligations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "government_obligations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "government_obligations" ADD CONSTRAINT "government_obligations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security, same pattern as every other tenant table — see the
-- comment on "accounts" in the initial migration.
ALTER TABLE "government_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "government_obligations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_government_obligations ON "government_obligations"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
