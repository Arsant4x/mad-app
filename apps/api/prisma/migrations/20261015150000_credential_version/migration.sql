-- Raised on every change of sign-in credentials (password, username, second factor on or off).
-- An access token carries the value it was issued with, so a token issued before a change is refused.
-- New column with a default only; no existing row is rewritten.
ALTER TABLE "login_identities"
  ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;
