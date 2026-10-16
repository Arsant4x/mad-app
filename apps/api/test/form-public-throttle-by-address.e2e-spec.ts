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
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: one company and a dozen requests; three times the measured run.
jest.setTimeout(90000);

let ipSeq = 0;
const freshIp = () => `198.51.100.${(ipSeq += 1)}`;

/**
 * The public form link is reached without an account, so its limits count per address whatever session token
 * the request carries, as the sign-in routes do. The throttler is skipped under Jest, so this suite runs with the
 * production options.
 */
describe('Public form link limits count per address (e2e)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  const unknown = 'C'.repeat(43);
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
    co = await registerIsolatedCompany(app, 'form-throttle-ip');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app?.close();
  });

  it('counts code requests carrying a session token against the address', async () => {
    const ip = freshIp();
    const withToken: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      withToken.push((await http().post(`/public/forms/${unknown}/otp`).set('Authorization', `Bearer ${co.token}`).set('X-Forwarded-For', ip)).status);
    }
    expect(withToken).toEqual([404, 404, 404, 404, 404]);
    // The sixth from the same address is over the limit, with or without the token.
    expect((await http().post(`/public/forms/${unknown}/otp`).set('X-Forwarded-For', ip)).status).toBe(429);
    expect((await http().post(`/public/forms/${unknown}/otp`).set('Authorization', `Bearer ${co.token}`).set('X-Forwarded-For', ip)).status).toBe(429);
    // Another address is counted on its own.
    expect((await http().post(`/public/forms/${unknown}/otp`).set('Authorization', `Bearer ${co.token}`).set('X-Forwarded-For', freshIp())).status).toBe(404);
  });

  it('keeps the link open limit of thirty a minute per address', async () => {
    const ip = freshIp();
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      const r = http().get(`/public/forms/${unknown}`).set('X-Forwarded-For', ip);
      statuses.push((await (i % 2 === 0 ? r.set('Authorization', `Bearer ${co.token}`) : r)).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
