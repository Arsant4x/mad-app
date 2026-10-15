import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { totp } from '../src/common/mfa/totp.util';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(120000);

const PASSWORD = 'PlatformNew123!';

/**
 * With the second factor required for platform accounts, an administrator who has not enrolled yet is
 * refused a session at sign-in. The refusal carries a short enrolment-only session that reaches the
 * enrolment routes and nothing else, so a new administrator can turn the factor on and then sign in.
 */
describe('Required second factor for platform administrators (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let previous: string | undefined;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const usernames: string[] = [];

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const login = (username: string, code?: string) => http().post('/auth/login').send({ username, password: PASSWORD, code });

  async function newPlatformAdmin(tag: string): Promise<string> {
    const username = `plat-${tag}-${stamp}`;
    usernames.push(username);
    await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash(PASSWORD), actorType: 'PLATFORM_ADMIN', platformAdmin: { create: { displayName: `مدير ${tag}` } } },
    });
    return username;
  }

  beforeAll(async () => {
    previous = process.env.MFA_REQUIRED_FOR_PLATFORM_ADMIN;
    process.env.MFA_REQUIRED_FOR_PLATFORM_ADMIN = 'true';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (previous === undefined) delete process.env.MFA_REQUIRED_FOR_PLATFORM_ADMIN;
    else process.env.MFA_REQUIRED_FOR_PLATFORM_ADMIN = previous;
    await prisma.loginIdentity.deleteMany({ where: { username: { in: usernames } } });
    await app.close();
  });

  it('refuses a session to an administrator without a second factor and hands an enrolment-only session', async () => {
    const username = await newPlatformAdmin('refused');
    const res = await login(username).expect(401);
    expect(res.body.mfaEnrolmentRequired).toBe(true);
    expect(typeof res.body.enrolmentToken).toBe('string');
    expect(res.body.accessToken).toBeUndefined();
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('the enrolment session reaches the enrolment routes and nothing else, and lives at most ten minutes', async () => {
    const username = await newPlatformAdmin('scope');
    const token = (await login(username).expect(401)).body.enrolmentToken as string;
    await bearer(token)(http().get('/auth/mfa')).expect(200);
    await bearer(token)(http().get('/auth/me')).expect(401);
    await bearer(token)(http().get('/companies')).expect(401);
    await bearer(token)(http().post('/auth/mfa/disable')).send({ code: '123456', currentPassword: PASSWORD }).expect(401);

    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { iat: number; exp: number };
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it('enrolling through the enrolment session lets the administrator sign in with a code', async () => {
    const username = await newPlatformAdmin('enrol');
    const token = (await login(username).expect(401)).body.enrolmentToken as string;
    const secret = (await bearer(token)(http().post('/auth/mfa/begin')).expect(201)).body.secret as string;
    await bearer(token)(http().post('/auth/mfa/confirm')).send({ code: totp(secret), currentPassword: PASSWORD }).expect(201);
    // Its purpose is done: the enrolment session stops working.
    await bearer(token)(http().get('/auth/mfa')).expect(401);

    const signedIn = await login(username, totp(secret, Date.now() + 30_000)).expect(200);
    await bearer(signedIn.body.accessToken as string)(http().get('/auth/me')).expect(200);
  });
});
