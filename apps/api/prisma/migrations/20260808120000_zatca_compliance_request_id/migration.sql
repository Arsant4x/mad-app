-- The authority returns its own `requestID` alongside the compliance
-- certificate, and `/production/csids` matches the passed conformance run by
-- that value. It was being discarded, and our local row id was sent instead —
-- which the authority can never match, so the production certificate (the one
-- that actually clears real invoices) could never be issued. Captured and kept
-- from the OTP step on.
--
-- No RLS block needed: zatca_credentials already has FORCE ROW LEVEL SECURITY
-- and its policy covers every column.

-- AlterTable
ALTER TABLE "zatca_credentials" ADD COLUMN     "complianceRequestId" TEXT;
