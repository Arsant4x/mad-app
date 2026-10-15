import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MfaService } from '../src/common/mfa/mfa.service';
import { totp } from '../src/common/mfa/totp.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, ISOLATED_PASSWORD, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(120000);

const MINUTE = 60_000;

/**
 * Second factor at login: wrong codes lead to a time lock that grows, and an accepted code
 * cannot be used again, not even by two requests sent at the same moment.
 */
describe('Second factor attempt lock (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let co: IsolatedCompany;
  let secret: string;
  let identityId: string;
  let recoveryCodes: string[];

  const http = () => request(app.getHttpServer());
  const login = (body: Record<string, unknown>) => http().post('/auth/login').send({ username: co.username, password: ISOLATED_PASSWORD, ...body });
  const forgetUsedSteps = () => prisma.loginIdentity.update({ where: { id: identityId }, data: { mfaLastStep: null } });
  const lockState = async () => {
    const rows = await prisma.$queryRaw<{ mfaFailedCount: number; mfaLockedUntil: Date | null }[]>`
      SELECT "mfaFailedCount", "mfaLockedUntil" FROM "login_identities" WHERE "id" = ${identityId}`;
    return rows[0];
  };
  // The column holds UTC without a zone, as Prisma writes it.
  const endLock = () => prisma.$executeRaw`UPDATE "login_identities" SET "mfaLockedUntil" = timezone('UTC', now()) - interval '1 second' WHERE "id" = ${identityId}`;
  const wrongCodes = async (n: number) => {
    const codes: number[] = [];
    for (let i = 0; i < n; i += 1) codes.push((await login({ code: '000000' })).status);
    return codes;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    co = await registerIsolatedCompany(app, 'mfa-lock');
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    secret = (await auth(http().post('/auth/mfa/begin')).expect(201)).body.secret as string;
    recoveryCodes = (await auth(http().post('/auth/mfa/confirm')).send({ code: totp(secret) }).expect(201)).body.recoveryCodes as string[];
    identityId = (await prisma.loginIdentity.findUniqueOrThrow({ where: { username: co.username }, select: { id: true } })).id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('refuses a code that was already accepted', async () => {
    await forgetUsedSteps();
    const code = totp(secret);
    await login({ code }).expect(200);
    await login({ code }).expect(401);
  });

  it('accepts one of two simultaneous uses of the same code', async () => {
    await forgetUsedSteps();
    const code = totp(secret);
    const mfa = app.get(MfaService);
    const results = await Promise.allSettled([mfa.assertCode(identityId, code), mfa.assertCode(identityId, code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('accepts one of two simultaneous uses of the same recovery code, and keeps the others', async () => {
    const mfa = app.get(MfaService);
    const results = await Promise.allSettled([mfa.assertCode(identityId, recoveryCodes[0]), mfa.assertCode(identityId, recoveryCodes[0])]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // Two different codes at once must both be spent, not one written back by the other.
    await Promise.all([mfa.assertCode(identityId, recoveryCodes[1]), mfa.assertCode(identityId, recoveryCodes[2])]);
    const left = await prisma.loginIdentity.findUniqueOrThrow({ where: { id: identityId }, select: { mfaRecoveryHashes: true } });
    expect(left.mfaRecoveryHashes).toHaveLength(recoveryCodes.length - 3);
  });

  it('locks after five wrong codes and refuses even the right code while locked', async () => {
    // A successful sign-in first, so failures from the cases above do not carry over.
    await forgetUsedSteps();
    await login({ code: totp(secret) }).expect(200);
    await forgetUsedSteps();
    const wrong = await wrongCodes(5);
    const right = await login({ code: totp(secret) });
    expect(right.status).toBe(429);
    expect(wrong).toEqual([401, 401, 401, 401, 429]);
    expect(String(right.body.message)).toMatch(/\d+/);
    const state = await lockState();
    expect(state.mfaFailedCount).toBe(5);
    const minutes = (state.mfaLockedUntil!.getTime() - Date.now()) / MINUTE;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
  });

  it('a wrong password does not touch the code counter', async () => {
    await http().post('/auth/login').send({ username: co.username, password: 'Wrong-password-1', code: '000000' }).expect(401);
    expect((await lockState()).mfaFailedCount).toBe(5);
  });

  it('doubles the lock for each further run of five wrong codes', async () => {
    await endLock();
    const wrong = await wrongCodes(5);
    expect(wrong).toEqual([401, 401, 401, 401, 429]);
    const state = await lockState();
    expect(state.mfaFailedCount).toBe(10);
    const minutes = (state.mfaLockedUntil!.getTime() - Date.now()) / MINUTE;
    expect(minutes).toBeGreaterThan(29);
    expect(minutes).toBeLessThanOrEqual(30);
  });

  it('caps the lock at one day', async () => {
    await prisma.$executeRaw`UPDATE "login_identities" SET "mfaFailedCount" = 45, "mfaLockedUntil" = timezone('UTC', now()) - interval '1 second' WHERE "id" = ${identityId}`;
    expect(await wrongCodes(5)).toEqual([401, 401, 401, 401, 429]);
    const hours = ((await lockState()).mfaLockedUntil!.getTime() - Date.now()) / (60 * MINUTE);
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThanOrEqual(24);
  });

  it('refuses turning the factor off while locked', async () => {
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    await forgetUsedSteps();
    await auth(http().post('/auth/mfa/disable')).send({ code: totp(secret) }).expect(429);
  });

  it('a right code after the lock ends clears the counter', async () => {
    await endLock();
    await forgetUsedSteps();
    await login({ code: totp(secret) }).expect(200);
    const state = await lockState();
    expect(state.mfaFailedCount).toBe(0);
    expect(state.mfaLockedUntil).toBeNull();
  });
});
