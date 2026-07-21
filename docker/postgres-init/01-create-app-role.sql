-- The postgres image's bootstrap user (POSTGRES_USER) is always created as a
-- superuser, and Postgres unconditionally lets superusers bypass Row-Level
-- Security regardless of FORCE ROW LEVEL SECURITY. Since RLS is layer 2 of
-- tenant isolation here (see prisma/migrations/*/migration.sql), the app
-- must never connect as that bootstrap user — it must use this dedicated,
-- non-superuser role instead, which owns the schema so RLS actually applies.
CREATE ROLE app_user WITH LOGIN PASSWORD 'app_user_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
GRANT ALL PRIVILEGES ON DATABASE mad_app TO app_user;
ALTER SCHEMA public OWNER TO app_user;
