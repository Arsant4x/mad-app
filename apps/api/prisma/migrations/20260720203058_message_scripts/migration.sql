-- CreateEnum
CREATE TYPE "ScriptAudience" AS ENUM ('TENANT', 'CUSTOMER', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "message_scripts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "audience" "ScriptAudience" NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_scripts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "message_scripts" ADD CONSTRAINT "message_scripts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security, same pattern as every other tenant table — see the
-- comment on "accounts" in the initial migration.
ALTER TABLE "message_scripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_scripts" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_message_scripts ON "message_scripts"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
