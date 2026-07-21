-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'FROZEN', 'STOPPED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('PLATFORM_ADMIN', 'COMPANY', 'COMPANY_USER');

-- CreateTable
CREATE TABLE "login_identities" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "loginIdentityId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAllScreens" BOOLEAN NOT NULL DEFAULT false,
    "allowedScreens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permission_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "loginIdentityId" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "frozenAt" TIMESTAMP(3),
    "subStart" TIMESTAMP(3),
    "subEnd" TIMESTAMP(3),
    "permissionTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_users" (
    "id" TEXT NOT NULL,
    "loginIdentityId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissionTemplateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "loginIdentityId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_identities_username_key" ON "login_identities"("username");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_loginIdentityId_key" ON "platform_admins"("loginIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "companies_loginIdentityId_key" ON "companies"("loginIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "company_users_loginIdentityId_key" ON "company_users"("loginIdentityId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_companyId_code_key" ON "accounts"("companyId", "code");

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_loginIdentityId_fkey" FOREIGN KEY ("loginIdentityId") REFERENCES "login_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_loginIdentityId_fkey" FOREIGN KEY ("loginIdentityId") REFERENCES "login_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_permissionTemplateId_fkey" FOREIGN KEY ("permissionTemplateId") REFERENCES "permission_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_loginIdentityId_fkey" FOREIGN KEY ("loginIdentityId") REFERENCES "login_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_permissionTemplateId_fkey" FOREIGN KEY ("permissionTemplateId") REFERENCES "permission_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_loginIdentityId_fkey" FOREIGN KEY ("loginIdentityId") REFERENCES "login_identities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-Level Security: layer 2 of tenant isolation, independent from the
-- application-level Prisma extension (tenant-scope.extension.ts). Even if a
-- future code path queries a tenant-scoped table without going through
-- TenantPrismaService, Postgres itself refuses to return/touch rows that
-- don't belong to the company set for the current transaction via
-- `set_config('app.company_id', ...)`.
--
-- IMPORTANT: RLS is bypassed by the table owner unless FORCE ROW LEVEL
-- SECURITY is also set, and always bypassed by a Postgres superuser. The
-- app's DB user (from DATABASE_URL) must not be a superuser in any
-- environment where this matters (never true for a shared/production DB;
-- the local docker-compose "mad_app" user is fine for dev, since FORCE
-- takes care of the owner-bypass case).

ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "accounts" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_accounts ON "accounts"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

-- Every future tenant-scoped table repeats this exact pattern:
--   ALTER TABLE "<table>" ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE "<table>" FORCE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation_<table> ON "<table>"
--     USING ("companyId" = current_setting('app.company_id', true))
--     WITH CHECK ("companyId" = current_setting('app.company_id', true));
