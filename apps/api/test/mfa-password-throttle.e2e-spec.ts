import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { throttlerOptions } from '../src/common/throttle/throttler-options';
import { totp } from '../src/common/mfa/totp.util';
import { IsolatedCompany, ISOLATED_PASSWORD, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(120000);

let ipSeq = 0;
const freshIp = () => `203.0.113.${(ipSeq += 1)}`;

/**
 * Turning the second factor on or off checks the current password, so those two routes are counted per
 * address as sign-in is: ten tries a minute, then 429. The throttler is skipped under Jest, so this suite
 * runs with the production options.
 */
describe('Second factor password checks are rate limited (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let secret: string;

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
    co = await registerIsolatedCompany(app, 'mfa-throttle');
    secret = (await http().post('/auth/mfa/begin').set('Authorization', `Bearer ${co.token}`).set('X-Forwarded-For', freshIp()).expect(201)).body.secret as string;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app?.close();
  });

  it('refuses the eleventh wrong current password a minute from one address', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await http()
        .post('/auth/mfa/confirm')
        .set('Authorization', `Bearer ${co.token}`)
        .set('X-Forwarded-For', ip)
        .send({ code: totp(secret), currentPassword: `Wrong-password-${i}` });
      codes.push(res.status);
    }
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(codes[10]).toBe(429);
    // Another address is counted on its own, and the right password still works there.
    await http().post('/auth/mfa/confirm').set('Authorization', `Bearer ${co.token}`).set('X-Forwarded-For', freshIp()).send({ code: totp(secret), currentPassword: ISOLATED_PASSWORD }).expect(201);
  });

  it('refuses the eleventh wrong current password a minute when turning it off', async () => {
    const signedIn = await http().post('/auth/login').set('X-Forwarded-For', freshIp()).send({ username: co.username, password: ISOLATED_PASSWORD, code: totp(secret, Date.now() + 30_000) }).expect(200);
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await http()
        .post('/auth/mfa/disable')
        .set('Authorization', `Bearer ${signedIn.body.accessToken}`)
        .set('X-Forwarded-For', ip)
        .send({ code: '000000', currentPassword: `Wrong-password-${i}` });
      codes.push(res.status);
    }
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(codes[10]).toBe(429);
  });
});
