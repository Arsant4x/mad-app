-- Consecutive wrong second-factor codes and the time lock they lead to.
-- New columns with a default only; no existing row is rewritten.
ALTER TABLE "login_identities"
  ADD COLUMN "mfaFailedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "mfaLockedUntil" TIMESTAMP(3);
