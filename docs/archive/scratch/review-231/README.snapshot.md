# Mad App

Multi-tenant accounting / real-estate / HR / inventory platform. NestJS API +
React web app, npm workspaces monorepo.

> This branch is a **review snapshot**: the code as it runs, without the
> project's working documents. Nothing is merged into it after its creation,
> and it is never merged back. Run it; do not build on it.

## Prerequisites

- Node.js 22+, npm — as required by `engines` in every `package.json`
- Docker Desktop (Postgres, Redis, MinIO run via `docker-compose.yml`)

## First-time setup

```bash
npm install
git config core.hooksPath .githooks              # once per clone — repo hooks live in .githooks/
docker compose up -d
```

Postgres's bootstrap user (`mad_app`, from `docker-compose.yml`) is a
superuser, which would silently bypass Row-Level Security. The app must
never connect as that user. `docker/postgres-init/01-create-app-role.sql`
creates a dedicated non-superuser `app_user` role on first container init —
this only runs automatically against a **fresh** `postgres_data` volume. If
you're reusing an existing volume that predates this role, run the script's
contents manually against the running container instead.

```bash
cd apps/api
cp .env.example .env        # fill in a real DEV_SEED_PLATFORM_ADMIN_PASSWORD
npx prisma migrate deploy   # applies migrations, including the RLS policies
npx prisma db seed          # dev platform admin + two demo companies
```

`prisma migrate dev` (for authoring new migrations) additionally needs
`SHADOW_DATABASE_URL` — a superuser connection to a pre-created, empty
`mad_app_shadow` database — because `app_user` intentionally lacks CREATEDB.

```bash
cd apps/web
cp .env.example .env
```

## Running

```bash
npm run dev:api   # http://localhost:3000 (Swagger at /docs outside production)
npm run dev:web   # http://localhost:5173
```

## Demo accounts (from `apps/api/prisma/seed.ts`)

| username | password | role |
|---|---|---|
| (`DEV_SEED_PLATFORM_ADMIN_USERNAME` in `.env`) | (`DEV_SEED_PLATFORM_ADMIN_PASSWORD` in `.env`) | platform admin |
| `demo-company-a` | `DemoPass123!` | company |
| `demo-company-b` | `DemoPass123!` | company |

## Tests

```bash
cd apps/api
npm test              # unit tests and static guards (no database)
npm run test:e2e      # e2e suite — needs docker compose + a migrated, seeded DB (apps/api/.env.test)
npm run test:clean    # the same e2e suite on a database created from scratch

cd apps/web
npm test              # vitest
npm run test:e2e      # playwright — needs the API running
```

`apps/api/.env.test` is not tracked; `.githooks/post-checkout` copies it from
`.env.test.example` when a worktree is created, and the `pretest` gate says
what is missing if it was not.

### New worktree (`git worktree add`)

`.githooks/post-checkout` prepares it and prints what it did: it links
`node_modules` to the main clone's and copies `apps/api/.env.test` from
`.env.test.example`. Neither comes with git; without them tests fail on
`Module ts-jest in the transform option was not found` or
`PrismaClientInitializationError`.

## Deployment

See [DEPLOY.md](DEPLOY.md) — `deploy.sh` is the only deployment path.

## Tenant isolation

Every tenant-scoped table is protected on two independent layers — see
[tenant-scope.extension.ts](apps/api/src/common/tenant/tenant-scope.extension.ts)
and the RLS policies in the migrations:

1. **Application**: a Prisma Client extension auto-injects `companyId` into
   every query for tenant-scoped models. All tenant data access goes through
   `TenantPrismaService.runInTenantContext`, never the raw `PrismaService`.
2. **Database**: Postgres Row-Level Security, using
   `set_config('app.company_id', ...)` per-transaction. This is what actually
   stops a bug in layer 1 from leaking data — it only works because the app
   connects as the non-superuser `app_user` role.

Adding a new tenant-scoped table means: add it to `TENANT_SCOPED_MODELS` in
`tenant-scope.extension.ts`, and add the matching `ENABLE/FORCE ROW LEVEL
SECURITY` + `CREATE POLICY` statements to a migration (see the comment block
at the bottom of the initial migration for the exact pattern).
