#!/bin/bash
# Production twin of docker/postgres-init/01-create-app-role.sql, as a shell
# script so the app role's password comes from the environment instead of
# being committed. Same security reasoning: the bootstrap POSTGRES_USER is a
# superuser and superusers silently bypass RLS — the app must connect as this
# dedicated non-superuser role, which owns the schema so RLS actually applies.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE ROLE app_user WITH LOGIN PASSWORD '${APP_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO app_user;
    ALTER SCHEMA public OWNER TO app_user;
SQL
