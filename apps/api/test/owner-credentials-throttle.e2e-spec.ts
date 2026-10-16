import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { getOptionsToken } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MailService } from '../src/common/mail/mail.service';
import { throttlerOptions } from '../src/common/throttle/throttler-options';
import { IsolatedCompany, ISOLATED_PASSWORD, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(120000);

let ipSeq = 0;
const freshIp = () => `198.51.100.${(ipSeq += 1)}`;

/**
 * The platform request for an owner reset link has its own limit, five a minute for one administrator,
 * and a save of the company profile, which checks the current password when the e-mail changes, ten a
 * minute for one account. The throttler is skipped under Jest, so this suite runs with the production options.
 */
describe('Owner reset link and recovery e-mail checks are rate limited (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let adminToken: string;

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
    jest.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);
    co = await registerIsolatedCompany(app, 'cred-throttle');
    adminToken = (
      await http()
        .post('/auth/login')
        .set('X-Forwarded-For', freshIp())
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app?.close();
  });

  it('refuses the sixth reset link request a minute from one administrator', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await http().post(`/companies/${co.companyId}/password-reset`).set('Authorization', `Bearer ${adminToken}`).set('X-Forwarded-For', freshIp());
      codes.push(res.status);
    }
    expect(codes.slice(0, 5)).toEqual(Array(5).fill(200));
    expect(codes[5]).toBe(429);
  });

  it('refuses the eleventh profile save a minute from one account', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const res = await http()
        .patch('/company-profile')
        .set('Authorization', `Bearer ${co.token}`)
        .set('X-Forwarded-For', freshIp())
        .send({ email: `other-${i}-${co.username}@example.com`, currentPassword: `Wrong-password-${i}` });
      codes.push(res.status);
    }
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(codes[10]).toBe(429);
    // The right password is still refused for the rest of the minute: the limit is on the account.
    const after = await http().patch('/company-profile').set('Authorization', `Bearer ${co.token}`).set('X-Forwarded-For', freshIp()).send({ email: `next-${co.username}@example.com`, currentPassword: ISOLATED_PASSWORD });
    expect(after.status).toBe(429);
  });
});
