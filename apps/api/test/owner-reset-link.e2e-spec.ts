import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MailService } from '../src/common/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

// Three times the measured run, most of it in beforeAll (app boot, three argon2 hashes) and the registrations.
jest.setTimeout(120000);

interface PlatformRow {
  adminId: string;
  method: string;
  route: string;
  targetCompanyId: string | null;
  status: number;
}

interface CompanyEntry {
  actorType: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
}

/**
 * The platform administrator never sets or reads the owner's sign-in details. In their place the
 * administrator can have a password reset link sent to the owner's e-mail: the same single-use link
 * the owner can ask for, recorded in the platform log and in the company's own trail.
 */
describe('Platform admin and the owner sign-in details (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sendMail: jest.SpyInstance;
  let ownerToken: string;
  const tokens: Partial<Record<PlatformRole, string>> = {};
  const adminIds: Partial<Record<PlatformRole, string>> = {};
  const identityIds: string[] = [];
  const companyIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ADMIN_PASSWORD = 'ResetLinkAdmin123!';
  const OWNER_PASSWORD = 'ResetLinkOwner123!';

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

  async function makeAdmin(role: PlatformRole): Promise<void> {
    const username = `rlink-${role.toLowerCase()}-${stamp}`;
    const identity = await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash(ADMIN_PASSWORD), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    identityIds.push(identity.id);
    adminIds[role] = (await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: `reset link ${role}`, role }, select: { id: true } })).id;
    tokens[role] = (await http().post('/auth/login').send({ username, password: ADMIN_PASSWORD }).expect(200)).body.accessToken as string;
  }

  async function registerOwner(tag: string) {
    const username = `rlink-${tag}-${stamp}`;
    const email = `${username}@example.com`;
    const res = await http().post('/auth/register').send({ orgName: `منشأة ${username}`, username, password: OWNER_PASSWORD, email }).expect(201);
    companyIds.push(res.body.user.companyId);
    const identity = await prisma.loginIdentity.findUniqueOrThrow({ where: { username }, select: { id: true, passwordHash: true } });
    return { username, email, companyId: res.body.user.companyId as string, token: res.body.accessToken as string, identityId: identity.id, passwordHash: identity.passwordHash };
  }

  /** The writes land after the response is sent, so the reads poll until the expected row is there. */
  async function until<T>(read: () => Promise<T[]>, landed: (rows: T[]) => boolean): Promise<T[]> {
    const deadline = Date.now() + 5000;
    let rows = await read();
    while (!landed(rows) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      rows = await read();
    }
    return rows;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    sendMail = jest.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);
    ownerToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    for (const role of [PlatformRole.OPERATIONS, PlatformRole.FINANCE, PlatformRole.SUPPORT]) await makeAdmin(role);
  });

  afterAll(async () => {
    for (const id of companyIds) await hardDeleteCompanyForTest(prisma, id);
    // An administrator with rows in the platform audit log cannot be deleted: the trail keeps them.
    for (const id of identityIds) await prisma.loginIdentity.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('refuses a password on the admin company update and keeps the stored hash', async () => {
    const owner = await registerOwner('pw');
    const res = await bearer(tokens.OPERATIONS!)(http().patch(`/companies/${owner.companyId}`)).send({ password: 'AdminChosen123!' });
    expect(res.status).toBe(400);
    const after = await prisma.loginIdentity.findUniqueOrThrow({ where: { id: owner.identityId }, select: { passwordHash: true } });
    expect(after.passwordHash).toBe(owner.passwordHash);
    // The owner still signs in with the password the owner chose.
    await http().post('/auth/login').send({ username: owner.username, password: OWNER_PASSWORD }).expect(200);
  });

  it('refuses a login name on the admin company update and keeps it', async () => {
    const owner = await registerOwner('user');
    const res = await bearer(ownerToken)(http().patch(`/companies/${owner.companyId}`)).send({ username: `${owner.username}-renamed` });
    expect(res.status).toBe(400);
    const after = await prisma.loginIdentity.findUniqueOrThrow({ where: { id: owner.identityId }, select: { username: true, passwordHash: true } });
    expect(after.username).toBe(owner.username);
    expect(after.passwordHash).toBe(owner.passwordHash);
  });

  it('sends the owner one live reset link, leaves the password as it is, and records the call in both logs', async () => {
    const owner = await registerOwner('link');
    const startedAt = new Date(Date.now() - 1000).toISOString();

    await bearer(tokens.OPERATIONS!)(http().post(`/companies/${owner.companyId}/password-reset`)).expect(200);
    const first = await prisma.passwordResetToken.findMany({ where: { loginIdentityId: owner.identityId, usedAt: null } });
    expect(first).toHaveLength(1);

    // A second request replaces the first link: still one live token, a different one.
    await bearer(tokens.FINANCE!)(http().post(`/companies/${owner.companyId}/password-reset`)).expect(200);
    const live = await prisma.passwordResetToken.findMany({ where: { loginIdentityId: owner.identityId, usedAt: null } });
    expect(live).toHaveLength(1);
    expect(live[0].id).not.toBe(first[0].id);
    const minutesLeft = (live[0].expiresAt.getTime() - Date.now()) / 60000;
    expect(minutesLeft).toBeGreaterThan(29);
    expect(minutesLeft).toBeLessThanOrEqual(30);

    const after = await prisma.loginIdentity.findUniqueOrThrow({ where: { id: owner.identityId }, select: { passwordHash: true } });
    expect(after.passwordHash).toBe(owner.passwordHash);

    // The mail goes to the owner's address, says platform support asked for it, and carries the live token.
    const mails = sendMail.mock.calls.filter((c) => c[0] === owner.email);
    expect(mails.length).toBeGreaterThanOrEqual(2);
    const [, subject, text] = mails[mails.length - 1] as [string, string, string];
    expect(`${subject}\n${text}`).toContain('دعم المنصة');
    const token = /token=([A-Za-z0-9_-]+)/.exec(text)?.[1];
    expect(token).toBeTruthy();
    expect(sha256(token!)).toBe(live[0].tokenHash);

    const platformRows = await until(
      async () => ((await bearer(ownerToken)(http().get(`/admin/platform-audit-log?companyId=${owner.companyId}&page=1&from=${encodeURIComponent(startedAt)}`)).expect(200)).body.items as PlatformRow[]),
      (rows) => rows.filter((r) => r.route === '/companies/:id/password-reset' && r.status === 200).length >= 2,
    );
    const calls = platformRows.filter((r) => r.route === '/companies/:id/password-reset' && r.status === 200);
    expect(calls.map((r) => r.adminId).sort()).toEqual([adminIds.OPERATIONS, adminIds.FINANCE].sort());
    expect(calls.every((r) => r.method === 'POST' && r.targetCompanyId === owner.companyId)).toBe(true);

    const isResetEntry = (e: CompanyEntry) => e.actorType === 'PLATFORM_ADMIN' && e.entity === 'companies' && e.entityId === owner.companyId && e.summary.includes('استعادة كلمة المرور');
    const trail = await until(async () => (await bearer(owner.token)(http().get('/audit-log?limit=200')).expect(200)).body as CompanyEntry[], (all) => all.filter(isResetEntry).length >= 2);
    expect(trail.filter(isResetEntry).map((e) => e.actorId).sort()).toEqual([adminIds.OPERATIONS, adminIds.FINANCE].sort());
  });

  it('refuses with a named message when the owner has no e-mail on file, and issues no link', async () => {
    const owner = await registerOwner('nomail');
    // A company from before the e-mail was required.
    await prisma.company.update({ where: { id: owner.companyId }, data: { email: null } });
    const res = await bearer(tokens.OPERATIONS!)(http().post(`/companies/${owner.companyId}/password-reset`));
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toContain('بريد');
    expect(await prisma.passwordResetToken.count({ where: { loginIdentityId: owner.identityId } })).toBe(0);
  });

  it('is refused to the support role, like the rest of the company account routes', async () => {
    const owner = await registerOwner('role');
    await bearer(tokens.SUPPORT!)(http().post(`/companies/${owner.companyId}/password-reset`)).expect(403);
    expect(await prisma.passwordResetToken.count({ where: { loginIdentityId: owner.identityId } })).toBe(0);
  });
});
