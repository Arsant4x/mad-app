-- ZATCA phase 2 ("Integration") scaffolding.
--
-- Every column here is nullable or defaulted, so unlike the structural wave
-- this needs no backfill: existing invoices are simply NOT_SUBMITTED, which is
-- exactly what they are.
--
-- Nothing is sent to the authority until a company configures its signing
-- endpoint and CSID — see ZatcaService.

-- CreateEnum
CREATE TYPE "ZatcaStatus" AS ENUM ('NOT_SUBMITTED', 'SUBMITTING', 'CLEARED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ZatcaEnvironment" AS ENUM ('SANDBOX', 'SIMULATION', 'PRODUCTION');

-- AlterTable: per-company integration settings. The API key is stored
-- encrypted (AES-256-GCM) — see common/crypto/secret.util.ts.
ALTER TABLE "companies" ADD COLUMN     "zatcaApiKeyEnc" TEXT,
ADD COLUMN     "zatcaEndpoint" TEXT,
ADD COLUMN     "zatcaEnvironment" "ZatcaEnvironment" NOT NULL DEFAULT 'SANDBOX';

-- AlterTable: the tamper-evident invoice chain.
ALTER TABLE "invoices" ADD COLUMN     "zatcaHash" TEXT,
ADD COLUMN     "zatcaMessage" TEXT,
ADD COLUMN     "zatcaPreviousHash" TEXT,
ADD COLUMN     "zatcaStatus" "ZatcaStatus" NOT NULL DEFAULT 'NOT_SUBMITTED',
ADD COLUMN     "zatcaSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "zatcaUuid" TEXT;
