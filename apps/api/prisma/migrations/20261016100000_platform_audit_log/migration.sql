-- Platform audit log: one row for every request a platform administrator makes on a route
-- under the platform admin guard, reads included, success or failure.
--
-- Append only in the database, on the pattern of delegation_logs, task_logs and audit_logs:
-- the server stamps createdAt, row triggers refuse UPDATE and DELETE, a statement trigger
-- refuses TRUNCATE, and the administrator is kept with RESTRICT so deleting an administrator
-- cannot erase the trail.
--
-- Platform data, not tenant data: there is no companyId column (the company a route names is
-- targetCompanyId, without a foreign key so the row outlives the company), and the only
-- policy admits the platform administrator context (app.platform_admin), set by
-- runAsPlatformAdmin after the guard has identified the administrator.
--
-- No data is written here.

CREATE TABLE "platform_audit_logs" (
    "id"              TEXT NOT NULL,
    "adminId"         TEXT NOT NULL,
    "adminName"       TEXT NOT NULL,
    "adminRole"       "PlatformRole" NOT NULL,
    "method"          TEXT NOT NULL,
    "route"           TEXT NOT NULL,
    "params"          JSONB,
    "targetCompanyId" TEXT,
    "status"          INTEGER NOT NULL,
    "details"         JSONB,
    "ip"              TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_audit_logs" ADD CONSTRAINT "platform_audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "platform_audit_logs_createdAt_idx" ON "platform_audit_logs"("createdAt");
CREATE INDEX "platform_audit_logs_adminId_createdAt_idx" ON "platform_audit_logs"("adminId", "createdAt");
CREATE INDEX "platform_audit_logs_targetCompanyId_createdAt_idx" ON "platform_audit_logs"("targetCompanyId", "createdAt");

-- The time comes from the server: an explicit value in the INSERT would otherwise win over the default.
CREATE OR REPLACE FUNCTION platform_audit_logs_stamp_server_time() RETURNS trigger AS $$
BEGIN
    NEW."createdAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_audit_logs_insert_guard
    BEFORE INSERT ON "platform_audit_logs"
    FOR EACH ROW EXECUTE FUNCTION platform_audit_logs_stamp_server_time();

CREATE OR REPLACE FUNCTION platform_audit_logs_append_only() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
        RAISE EXCEPTION 'platform_audit_logs is append only: a row cannot be deleted';
    END IF;
    RAISE EXCEPTION 'platform_audit_logs is append only: a row cannot be changed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_audit_logs_append_only_guard
    BEFORE UPDATE OR DELETE ON "platform_audit_logs"
    FOR EACH ROW EXECUTE FUNCTION platform_audit_logs_append_only();

CREATE TRIGGER platform_audit_logs_no_truncate_guard
    BEFORE TRUNCATE ON "platform_audit_logs"
    FOR EACH STATEMENT EXECUTE FUNCTION platform_audit_logs_append_only();

-- ENABLE and FORCE together: without FORCE the table owner, which is the application role, skips the policy.
ALTER TABLE "platform_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "platform_audit_logs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "platform_admin_only_platform_audit_logs" ON "platform_audit_logs"
  USING (current_setting('app.platform_admin', true) = 'true')
  WITH CHECK (current_setting('app.platform_admin', true) = 'true');
