-- Per-screen action grants on permission templates. Nullable/additive; the
-- permission_templates table carries no RLS (platform-level), so no policy needed.
ALTER TABLE "permission_templates" ADD COLUMN     "screenActions" JSONB;
