import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole, Prisma } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Three times the measured run, most of it in beforeAll (app boot, two argon2 hashes, a registration).
jest.setTimeout(90000);

interface PlatformRow {
  id: string;
  adminId: string;
  adminName: string;
  adminRole: PlatformRole;
  method: string;
  route: string;
  params: Record<string, string> | null;
  targetCompanyId: string | null;
  status: number;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

interface PlatformPage {
  items: PlatformRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface CompanyEntry {
  actorType: string;
  actorId: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
}

/**
 * Every request a platform administrator makes on a platform route leaves a row in the
 * platform audit log, and a change to one company also shows in that company's own trail.
 */
describe('Platform audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let target: IsolatedCompany;
  let ownerToken: string;
  let ownerAdminId: string;
  let operationsToken: string;
  let operationsAdminId: string;
  let operationsIdentityId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const startedAt = new Date(Date.now() - 1000).toISOString();

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  /** The writes land after the response is sent, so the reads poll until the expected row is there. */
  async function platformRowsUntil(query: string, landed: (rows: PlatformRow[]) => boolean): Promise<PlatformRow[]> {
    const read = async () => ((await bearer(ownerToken)(http().get(`/admin/platform-audit-log?${query}`)).expect(200)).body as PlatformPage).items;
    const deadline = Date.now() + 5000;
    let rows = await read();
    while (!landed(rows) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      rows = await read();
    }
    return rows;
  }

  async function companyTrailUntil(landed: (entries: CompanyEntry[]) => boolean): Promise<CompanyEntry[]> {
    const read = async () => (await bearer(target.token)(http().get('/audit-log?limit=200')).expect(200)).body as CompanyEntry[];
    const deadline = Date.now() + 5000;
    let entries = await read();
    while (!landed(entries) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      entries = await read();
    }
    return entries;
  }

  /** Runs raw SQL as the platform administrator path does: inside a transaction with the platform flag set. */
  async function asPlatform<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;
      return work(tx);
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const ownerUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
    ownerToken = (await http().post('/auth/login').send({ username: ownerUsername, password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD }).expect(200)).body.accessToken;
    ownerAdminId = (await prisma.platformAdmin.findFirstOrThrow({ where: { loginIdentity: { username: ownerUsername } }, select: { id: true } })).id;

    const operationsUsername = `paudit-ops-${suffix}`;
    const identity = await prisma.loginIdentity.create({
      data: { username: operationsUsername, passwordHash: await argon2.hash('PauditOps123!'), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    operationsIdentityId = identity.id;
    operationsAdminId = (await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: `paudit ops ${suffix}`, role: PlatformRole.OPERATIONS }, select: { id: true } })).id;
    operationsToken = (await http().post('/auth/login').send({ username: operationsUsername, password: 'PauditOps123!' }).expect(200)).body.accessToken;

    target = await registerIsolatedCompany(app, 'paudit');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, target);
    // An administrator with rows in the platform audit log cannot be deleted: the trail keeps them.
    await prisma.loginIdentity.delete({ where: { id: operationsIdentityId } }).catch(() => undefined);
    await app.close();
  });

  it('records a read and a write by a platform administrator with route, params, status and address', async () => {
    await bearer(ownerToken)(http().get('/companies')).expect(200);
    const newName = `paudit renamed ${suffix}`;
    await bearer(ownerToken)(http().patch(`/companies/${target.companyId}`)).send({ orgName: newName }).expect(200);

    const isRead = (r: PlatformRow) => r.method === 'GET' && r.route === '/companies' && r.createdAt >= startedAt;
    const isWrite = (r: PlatformRow) => r.method === 'PATCH' && r.targetCompanyId === target.companyId;
    const rows = await platformRowsUntil(`adminId=${ownerAdminId}&from=${encodeURIComponent(startedAt)}&pageSize=100&page=1`, (all) => all.some(isRead) && all.some(isWrite));

    const read = rows.find(isRead);
    expect(read).toMatchObject({ adminId: ownerAdminId, adminRole: PlatformRole.OWNER, status: 200, targetCompanyId: null });
    expect(read?.ip).toBeTruthy();

    const write = rows.find(isWrite);
    expect(write).toMatchObject({
      adminId: ownerAdminId,
      adminRole: PlatformRole.OWNER,
      route: '/companies/:id',
      params: { id: target.companyId },
      status: 200,
      details: { orgName: newName },
    });
    expect(write?.ip).toBeTruthy();
  });

  it('records a refused request with its status and without the request body', async () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await bearer(operationsToken)(http().patch(`/companies/${target.companyId}/subscription`)).send({ subEnd: nextYear }).expect(403);

    const isRefusal = (r: PlatformRow) => r.route === '/companies/:id/subscription' && r.status === 403;
    const rows = await platformRowsUntil(`adminId=${operationsAdminId}&page=1`, (all) => all.some(isRefusal));
    expect(rows.find(isRefusal)).toMatchObject({
      adminId: operationsAdminId,
      adminRole: PlatformRole.OPERATIONS,
      method: 'PATCH',
      params: { id: target.companyId },
      targetCompanyId: target.companyId,
      details: null,
    });
  });

  it('lets only the platform owner read the platform audit log, filtered by company', async () => {
    await bearer(operationsToken)(http().get('/admin/platform-audit-log')).expect(403);

    const page = (await bearer(ownerToken)(http().get(`/admin/platform-audit-log?companyId=${target.companyId}&page=1&pageSize=50`)).expect(200)).body as PlatformPage;
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(50);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((r) => r.targetCompanyId === target.companyId)).toBe(true);
    expect(page.total).toBeGreaterThanOrEqual(page.items.length);
  });

  it('shows the company a platform administrator change on it in its own audit trail', async () => {
    const newName = `paudit owner view ${suffix}`;
    await bearer(ownerToken)(http().patch(`/companies/${target.companyId}`)).send({ orgName: newName }).expect(200);

    const isPlatformChange = (e: CompanyEntry) => e.actorType === 'PLATFORM_ADMIN' && e.details?.orgName === newName;
    const entry = (await companyTrailUntil((all) => all.some(isPlatformChange))).find(isPlatformChange);
    expect(entry).toMatchObject({ actorType: 'PLATFORM_ADMIN', actorId: ownerAdminId, action: 'edit', entity: 'companies', entityId: target.companyId });
  });

  it('refuses UPDATE and DELETE on the platform audit table in the database, and hides it outside the platform context', async () => {
    const rows = await platformRowsUntil(`adminId=${operationsAdminId}&page=1`, (all) => all.length > 0);
    const rowId = rows[0]?.id;
    expect(rowId).toBeTruthy();

    await expect(asPlatform((tx) => tx.$executeRaw`UPDATE "platform_audit_logs" SET "status" = 200 WHERE "id" = ${rowId}`)).rejects.toThrow(/append only/);
    await expect(asPlatform((tx) => tx.$executeRaw`DELETE FROM "platform_audit_logs" WHERE "id" = ${rowId}`)).rejects.toThrow(/append only/);

    // Still there, unchanged.
    const [kept] = await asPlatform((tx) => tx.$queryRaw<{ status: number }[]>`SELECT "status" FROM "platform_audit_logs" WHERE "id" = ${rowId}`);
    expect(kept?.status).toBe(403);

    // Without the platform flag the policy shows nothing, and refuses a write.
    const [hidden] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "platform_audit_logs" WHERE "id" = ${rowId}`;
    expect(Number(hidden.n)).toBe(0);
    await expect(
      prisma.$executeRaw`INSERT INTO "platform_audit_logs" ("id", "adminId", "adminName", "adminRole", "method", "route", "status") VALUES (${`probe-${suffix}`}, ${operationsAdminId}, 'probe', 'OPERATIONS', 'GET', '/probe', 200)`,
    ).rejects.toThrow(/row-level security/);
  });

  it('stamps the time on the server, whatever the insert says', async () => {
    const id = `stamp-${suffix}`;
    let stamped: Date | undefined;
    // Rolled back on purpose: a probe row must not stay in an append only log.
    await asPlatform(async (tx) => {
      await tx.$executeRaw`INSERT INTO "platform_audit_logs" ("id", "adminId", "adminName", "adminRole", "method", "route", "status", "createdAt") VALUES (${id}, ${operationsAdminId}, 'probe', 'OPERATIONS', 'GET', '/probe', 200, '2000-01-01')`;
      const [row] = await tx.$queryRaw<{ createdAt: Date }[]>`SELECT "createdAt" FROM "platform_audit_logs" WHERE "id" = ${id}`;
      stamped = row.createdAt;
      throw new Error('rollback');
    }).catch((e: Error) => {
      if (e.message !== 'rollback') throw e;
    });
    expect(stamped?.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
