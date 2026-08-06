-- Corrects the ZATCA integration to the SaaS model (CLAUDE.md §1).
--
-- The previous design had each merchant point at their own external signing
-- server holding their certificate — copied from the browser-only mockup,
-- where that workaround exists only because a web page cannot hold a private
-- key. mad-app *is* a server, so the platform onboards and signs on the
-- merchant's behalf instead; their entire share is one OTP.
--
-- Dropping the three columns is safe: they were introduced earlier the same
-- day and verified empty (0 rows populated) before this ran.

-- CreateEnum
CREATE TYPE "ZatcaOnboardingStatus" AS ENUM ('NOT_STARTED', 'AWAITING_OTP', 'COMPLIANCE_ISSUED', 'PRODUCTION_ISSUED', 'FAILED');

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "zatcaApiKeyEnc",
DROP COLUMN "zatcaEndpoint",
DROP COLUMN "zatcaEnvironment";

-- CreateTable: one e-invoicing identity per merchant, held by the platform.
-- Every *Enc column is AES-256-GCM encrypted (common/crypto/secret.util.ts).
CREATE TABLE "zatca_credentials" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "privateKeyEnc" TEXT,
    "csr" TEXT,
    "complianceCsidEnc" TEXT,
    "complianceSecretEnc" TEXT,
    "productionCsidEnc" TEXT,
    "productionSecretEnc" TEXT,
    "status" "ZatcaOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "environment" "ZatcaEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "lastError" TEXT,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zatca_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zatca_credentials_companyId_key" ON "zatca_credentials"("companyId");

-- AddForeignKey
ALTER TABLE "zatca_credentials" ADD CONSTRAINT "zatca_credentials_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security — same pattern as every other tenant table. This one
-- holds signing keys, so the database-level boundary matters more here than
-- anywhere else: one merchant reaching another's certificate would let them
-- issue invoices in that merchant's name.
ALTER TABLE "zatca_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "zatca_credentials" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_zatca_credentials ON "zatca_credentials"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));
