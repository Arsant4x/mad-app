import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MailService } from '../src/common/mail/mail.service';
import { generateTotpSecret, totp } from '../src/common/mfa/totp.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

jest.setTimeout(120000);

const PASSWORD = 'MfaOwner123!';

/**
 * Turning the second factor on or off is a change of sign-in credentials: it needs the current password,
 * ends every other session of the account (the one making the change continues after a refresh), and the
 * account's e-mail address is told.
 */
describe('Second factor changes need the password and end other sessions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sendMail: jest.SpyInstance;
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
  const refresh = (cookie: string) => http().post('/auth/refresh').set('Cookie', cookie);

  async function registerOwner(tag: string) {
    const username = `mfa-cred-${tag}-${stamp}`;
    const email = `${username}@example.com`;
    const res = await http().post('/auth/register').send({ orgName: `منشأة ${username}`, username, password: PASSWORD, email }).expect(201);
    companyIds.push(res.body.user.companyId);
    return { username, email, token: res.body.accessToken as string, cookie: refreshCookieOf(res) };
  }

  async function secondSession(username: string) {
    const res = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    return { token: res.body.accessToken as string, cookie: refreshCookieOf(res) };
  }

  /** Enrols straight in the database, so the disable cases do not depend on the enable route. */
  async function enrolDirectly(username: string): Promise<string> {
    const secret = generateTotpSecret();
    await prisma.loginIdentity.update({ where: { username }, data: { mfaSecret: encryptSecret(secret), mfaEnrolledAt: new Date(), mfaLastStep: null } });
    return secret;
  }

  async function mailTo(address: string): Promise<unknown[] | undefined> {
    for (let i = 0; i < 50; i += 1) {
      const call = sendMail.mock.calls.find((c) => c[0] === address);
      if (call) return call;
      await new Promise((r) => setTimeout(r, 100));
    }
    return undefined;
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
  });

  afterAll(async () => {
    for (const id of companyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('refuses turning the second factor on without the current password', async () => {
    const owner = await registerOwner('on-nopass');
    const secret = (await bearer(owner.token)(http().post('/auth/mfa/begin')).expect(201)).body.secret as string;
    await bearer(owner.token)(http().post('/auth/mfa/confirm')).send({ code: totp(secret) }).expect(400);
  });

  it('refuses turning it on with a wrong current password and accepts the right one', async () => {
    const owner = await registerOwner('on-pass');
    const secret = (await bearer(owner.token)(http().post('/auth/mfa/begin')).expect(201)).body.secret as string;
    await bearer(owner.token)(http().post('/auth/mfa/confirm')).send({ code: totp(secret), currentPassword: 'NotThePassword123!' }).expect(401);
    await bearer(owner.token)(http().post('/auth/mfa/confirm')).send({ code: totp(secret), currentPassword: PASSWORD }).expect(201);
  });

  it('refuses turning the second factor off without the current password', async () => {
    const owner = await registerOwner('off-nopass');
    const secret = await enrolDirectly(owner.username);
    await bearer(owner.token)(http().post('/auth/mfa/disable')).send({ code: totp(secret) }).expect(400);
  });

  it('refuses turning it off with a wrong current password', async () => {
    const owner = await registerOwner('off-wrong');
    const secret = await enrolDirectly(owner.username);
    await bearer(owner.token)(http().post('/auth/mfa/disable')).send({ code: totp(secret), currentPassword: 'NotThePassword123!' }).expect(401);
  });

  it('turning it on ends the other sessions, keeps this one, and refuses the access token issued before it', async () => {
    const owner = await registerOwner('on-sessions');
    const other = await secondSession(owner.username);
    const secret = (await bearer(owner.token)(http().post('/auth/mfa/begin')).expect(201)).body.secret as string;
    await bearer(owner.token)(http().post('/auth/mfa/confirm')).send({ code: totp(secret), currentPassword: PASSWORD }).expect(201);

    expect((await refresh(other.cookie)).status).toBe(401);
    await bearer(owner.token)(http().get('/auth/mfa')).expect(401);
    const renewed = await refresh(owner.cookie).expect(200);
    const status = await bearer(renewed.body.accessToken as string)(http().get('/auth/mfa')).expect(200);
    expect(status.body.enrolled).toBe(true);
  });

  it('turning it off ends the other sessions and keeps this one', async () => {
    const owner = await registerOwner('off-sessions');
    const other = await secondSession(owner.username);
    const secret = await enrolDirectly(owner.username);
    await bearer(owner.token)(http().post('/auth/mfa/disable')).send({ code: totp(secret), currentPassword: PASSWORD }).expect(201);

    expect((await refresh(other.cookie)).status).toBe(401);
    await bearer(owner.token)(http().get('/auth/mfa')).expect(401);
    const renewed = await refresh(owner.cookie).expect(200);
    expect((await bearer(renewed.body.accessToken as string)(http().get('/auth/mfa')).expect(200)).body.enrolled).toBe(false);
  });

  it('tells the owner by e-mail when the second factor is turned on and when it is turned off', async () => {
    const owner = await registerOwner('mail');
    const secret = (await bearer(owner.token)(http().post('/auth/mfa/begin')).expect(201)).body.secret as string;
    await bearer(owner.token)(http().post('/auth/mfa/confirm')).send({ code: totp(secret), currentPassword: PASSWORD }).expect(201);
    expect(await mailTo(owner.email)).toBeDefined();

    sendMail.mockClear();
    const renewed = (await refresh(owner.cookie).expect(200)).body.accessToken as string;
    await bearer(renewed)(http().post('/auth/mfa/disable')).send({ code: totp(secret, Date.now() + 30_000), currentPassword: PASSWORD }).expect(201);
    expect(await mailTo(owner.email)).toBeDefined();
  });
});
