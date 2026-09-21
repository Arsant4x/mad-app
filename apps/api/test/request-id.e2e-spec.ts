import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { isRequestId, REQUEST_ID_HEADER, requestIdMiddleware } from '../src/common/request-id/request-id.middleware';

/**
 * `x-request-id` على التطبيق الحقيقيّ (`ق-١٢٣٧`): يُركَّب الوسيطُ هنا كما في `main.ts` (أوّلَ السلسلة)
 * ويُقرأ الرأسُ على `200` (دخولٌ ناجح) و`400` (تحقّقٌ ساقط — وجسمُه يحمل المعرِّف) و`401` (بلا رمز —
 * قبل أيّ حارس) و`404` (مسارٌ لا وجود له). والتطبيقُ الوحدويّ (`request-id.middleware.spec`) يُثبت `500`.
 */
describe('x-request-id (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(requestIdMiddleware);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('200 على الدخول، و400 على تحقّقٍ ساقط بجسمٍ يحمل المعرِّف نفسَه', async () => {
    const ok = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' }).expect(200);
    expect(isRequestId(ok.headers[REQUEST_ID_HEADER])).toBe(true);

    const bad = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a' }).expect(400);
    expect(isRequestId(bad.headers[REQUEST_ID_HEADER])).toBe(true);
    expect(bad.body.requestId).toBe(bad.headers[REQUEST_ID_HEADER]);
  });

  it('401 قبل أيّ حارس، و404 لمسارٍ لا وجود له — والرأسُ عليهما', async () => {
    const unauth = await request(app.getHttpServer()).get('/customers').expect(401);
    expect(isRequestId(unauth.headers[REQUEST_ID_HEADER])).toBe(true);
    expect(unauth.body.requestId).toBe(unauth.headers[REQUEST_ID_HEADER]);

    const missing = await request(app.getHttpServer()).get('/no-such-route-anywhere').expect(404);
    expect(isRequestId(missing.headers[REQUEST_ID_HEADER])).toBe(true);
  });

  it('الواردُ الصالح يُعاد كما هو فيصل الأثرُ من المتصفّح إلى السجلّ', async () => {
    const res = await request(app.getHttpServer()).get('/no-such-route-anywhere').set(REQUEST_ID_HEADER, '0b6f1e2a-1111-4222-8333-444455556666').expect(404);
    expect(res.headers[REQUEST_ID_HEADER]).toBe('0b6f1e2a-1111-4222-8333-444455556666');
  });
});
