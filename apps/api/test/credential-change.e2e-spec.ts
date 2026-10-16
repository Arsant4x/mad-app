import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MailService } from '../src/common/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { grantTestSubscription } from './test-subscription';

jest.setTimeout(120000);

const OWNER_PASSWORD = 'OwnerPass123!';

/**
 * Every change of sign-in credentials ends the sessions that existed before it: the refresh tokens are
 * revoked, an access token issued before the change is refused on the next request, and the account's
 * e-mail address is told. A password reset link works once, even for two requests at the same moment.
 */
describe('Credential changes end earlier sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sendMail: jest.SpyInstance;
  let adminToken: string;
  const side = new PrismaClient();
  const companyIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const refreshCookieOf = (res: request.Response): string => {
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const cookie = cookies.find((c) => c.startsWith('refresh_token='));
    if (!cookie) throw new Error('no refresh cookie in the response');
    return cookie.split(';')[0];
  };
  const refreshStatus = async (cookie: string) => (await http().post('/auth/refresh').set('Cookie', cookie)).status;
  const waitingOnLocks = async (): Promise<number> => {
    const rows = await side.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE "datname" = current_database() AND "wait_event_type" = 'Lock'`;
    return Number(rows[0].n);
  };

  async function registerOwner(tag: string) {
    const username = `cred-${tag}-${stamp}`;
    const email = `${username}@example.com`;
    const res = await http().post('/auth/register').send({ orgName: `منشأة ${username}`, username, password: OWNER_PASSWORD, email }).expect(201);
    companyIds.push(res.body.user.companyId);
    await grantTestSubscription(prisma, res.body.user.companyId);
    return { username, email, companyId: res.body.user.companyId as string, token: res.body.accessToken as string, cookie: refreshCookieOf(res) };
  }

  async function loginAs(username: string, password: string) {
    const res = await http().post('/auth/login').send({ username, password }).expect(200);
    return { token: res.body.accessToken as string, cookie: refreshCookieOf(res) };
  }

  async function plantResetToken(username: string): Promise<{ token: string; hash: string }> {
    const identity = await prisma.loginIdentity.findUniqueOrThrow({ where: { username } });
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await prisma.passwordResetToken.create({ data: { loginIdentityId: identity.id, tokenHash: hash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    return { token, hash };
  }

  /** The notice is sent after the change commits, so it is awaited by polling the spy. */
  async function mailTo(address: string): Promise<unknown[] | undefined> {
    for (let i = 0; i < 50; i += 1) {
      const call = sendMail.mock.calls.find((c) => c[0] === address);
      if (call) return call;
      await new Promise((r) => setTimeout(r, 100));
    }
    return undefined;
  }

  async function createEmployee(owner: { token: string }, tag: string) {
    const username = `cred-staff-${tag}-${stamp}`;
    const password = 'EmployeePass123!';
    const res = await bearer(owner.token)(http().post('/company-users')).send({ name: `موظف ${tag}`, username, password, permissionTemplateId: 'full-access-template' });
    if (res.status !== 201) throw new Error(`employee not created: ${res.status} ${JSON.stringify(res.body)}`);
    return { id: res.body.id as string, username, password };
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
    adminToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await side.$disconnect();
    for (const id of companyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('refuses an access token issued before a password reset on the next request', async () => {
    const owner = await registerOwner('reset-token');
    await bearer(owner.token)(http().get('/auth/me')).expect(200);
    const { token } = await plantResetToken(owner.username);
    await http().post('/auth/reset-password').send({ token, newPassword: 'ResetNew123!' }).expect(200);
    await bearer(owner.token)(http().get('/auth/me')).expect(401);
    // A session started after the change works.
    const fresh = await loginAs(owner.username, 'ResetNew123!');
    await bearer(fresh.token)(http().get('/auth/me')).expect(200);
  });

  it('tells the owner by e-mail when the password is reset', async () => {
    const owner = await registerOwner('reset-mail');
    const { token } = await plantResetToken(owner.username);
    await http().post('/auth/reset-password').send({ token, newPassword: 'ResetMail123!' }).expect(200);
    expect(await mailTo(owner.email)).toBeDefined();
  });

  it('uses a reset link once even when two requests redeem it at the same moment', async () => {
    const owner = await registerOwner('reset-race');
    const { token, hash } = await plantResetToken(owner.username);
    const auth = app.get(AuthService);

    // Hold the token row so both requests pass their reads and queue at the write. The holder and the
    // probe use their own client: the two waiting requests already hold two of the app pool connections.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let locked!: (rows: number) => void;
    const lockTaken = new Promise<number>((resolve) => (locked = resolve));
    const holder = side.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "password_reset_tokens" WHERE "tokenHash" = ${hash} FOR UPDATE`;
        locked(rows.length);
        await released;
      },
      { timeout: 60000, maxWait: 10000 },
    );
    expect(await lockTaken).toBe(1);
    const baseline = await waitingOnLocks();
    const both = Promise.allSettled([auth.resetPassword(token, 'RaceFirst123!'), auth.resetPassword(token, 'RaceSecond123!')]);

    let waiting = 0;
    try {
      for (let i = 0; i < 200 && (waiting = await waitingOnLocks()) < baseline + 2; i += 1) await new Promise((r) => setTimeout(r, 50));
    } finally {
      release();
    }
    await holder;
    expect(waiting - baseline).toBe(2);
    const results = await both;
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('ends every owner session when the owner uses a reset link the platform sent', async () => {
    const owner = await registerOwner('admin-link');
    await bearer(adminToken)(http().post(`/companies/${owner.companyId}/password-reset`)).expect(200);
    // Sending the link changes nothing: the owner's sessions still work.
    await bearer(owner.token)(http().get('/auth/me')).expect(200);
    const link = (await mailTo(owner.email)) as [string, string, string] | undefined;
    const token = /token=([A-Za-z0-9_-]+)/.exec(link?.[2] ?? '')?.[1];
    expect(token).toBeTruthy();
    sendMail.mockClear();
    await http().post('/auth/reset-password').send({ token, newPassword: 'OwnerChose123!' }).expect(200);
    expect(await refreshStatus(owner.cookie)).toBe(401);
    await bearer(owner.token)(http().get('/auth/me')).expect(401);
    expect(await mailTo(owner.email)).toBeDefined();
  });

  it('ends the employee sessions when the owner changes the employee username', async () => {
    const owner = await registerOwner('emp-user');
    const employee = await createEmployee(owner, 'user');
    const session = await loginAs(employee.username, employee.password);
    await bearer(owner.token)(http().patch(`/company-users/${employee.id}`)).send({ username: `${employee.username}-renamed` }).expect(200);
    expect(await refreshStatus(session.cookie)).toBe(401);
    await bearer(session.token)(http().get('/auth/me')).expect(401);
    expect(await mailTo(owner.email)).toBeDefined();
  });

  it('refuses the employee access token issued before the owner changed the employee password', async () => {
    const owner = await registerOwner('emp-pass');
    const employee = await createEmployee(owner, 'pass');
    const session = await loginAs(employee.username, employee.password);
    await bearer(owner.token)(http().patch(`/company-users/${employee.id}`)).send({ password: 'EmployeeNew123!' }).expect(200);
    await bearer(session.token)(http().get('/auth/me')).expect(401);
    expect(await refreshStatus(session.cookie)).toBe(401);
    // The owner's own session is not touched by a change to the employee.
    await bearer(owner.token)(http().get('/auth/me')).expect(200);
    expect(await mailTo(owner.email)).toBeDefined();
  });
});
