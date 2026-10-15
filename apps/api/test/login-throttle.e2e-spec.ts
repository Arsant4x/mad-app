import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getOptionsToken } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { throttlerOptions } from '../src/common/throttle/throttler-options';

jest.setTimeout(120000);

/**
 * Rate limits on the routes a visitor reaches before signing in.
 *
 * The throttler is skipped under Jest, so this suite replaces its options with the production ones
 * (throttlerOptions) with the skip turned off. Trust in one proxy hop is set as in main.ts, so each case sends its own
 * X-Forwarded-For address and starts from an empty per-address bucket.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

const fakeKey = () => `mk_${randomBytes(8).toString('hex')}_${randomBytes(15).toString('base64url')}`;
let ipSeq = 0;
const freshIp = () => `198.51.100.${(ipSeq += 1)}`;

d('Unauthenticated route throttling (e2e)', () => {
  let app: INestApplication;
  let validToken: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getOptionsToken())
      .useFactory({ factory: (jwt: JwtService) => throttlerOptions(jwt, { enforceUnderTest: true }), inject: [JwtService] })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    (app as NestExpressApplication).set('trust proxy', 1);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    validToken = (await http().post('/auth/login').set('X-Forwarded-For', freshIp()).send({ username: 'demo-company-b', password: 'DemoPass123!' }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('counts login attempts by address even when each carries a different made-up API key', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codes.push((await http().post('/auth/login').set('X-Forwarded-For', ip).set('X-Api-Key', fakeKey()).send({ username: `nobody-${ip}`, password: 'wrong-password' })).status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('counts login attempts by address when the made-up key comes in the Authorization header', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codes.push((await http().post('/auth/login').set('X-Forwarded-For', ip).set('Authorization', `ApiKey ${fakeKey()}`).send({ username: `nobody-${ip}`, password: 'wrong-password' })).status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('counts login attempts by address even with a valid session token', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      codes.push((await http().post('/auth/login').set('X-Forwarded-For', ip).send({ username: `nobody-${ip}`, password: 'wrong-password' })).status);
    }
    expect(codes.every((c) => c === 401)).toBe(true);
    const withToken = await http().post('/auth/login').set('X-Forwarded-For', ip).set('Authorization', `Bearer ${validToken}`).send({ username: `nobody-${ip}`, password: 'wrong-password' });
    expect(withToken.status).toBe(429);
  });

  it('limits attempts on one username across many addresses', async () => {
    const username = `target-${Date.now()}`;
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codes.push((await http().post('/auth/login').set('X-Forwarded-For', freshIp()).send({ username, password: 'wrong-password' })).status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
    // Another account from a fresh address is not affected.
    const other = await http().post('/auth/login').set('X-Forwarded-For', freshIp()).send({ username: `${username}-other`, password: 'wrong-password' });
    expect(other.status).toBe(401);
  });

  it('counts password reset requests by address whatever key is sent', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      codes.push((await http().post('/auth/forgot-password').set('X-Forwarded-For', ip).set('X-Api-Key', fakeKey()).send({ username: `nobody-${ip}` })).status);
    }
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('counts password reset confirmations by address whatever key is sent', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      codes.push((await http().post('/auth/reset-password').set('X-Forwarded-For', ip).set('X-Api-Key', fakeKey()).send({ token: randomBytes(32).toString('base64url'), newPassword: 'Strong-enough-pass-1' })).status);
    }
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('counts registrations by address whatever key is sent', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      // An invalid body is refused after the throttler counted it, so no company is created.
      codes.push((await http().post('/auth/register').set('X-Forwarded-For', ip).set('X-Api-Key', fakeKey()).send({})).status);
    }
    expect(codes.slice(0, 5).every((c) => c === 400)).toBe(true);
    expect(codes[5]).toBe(429);
  });
});
