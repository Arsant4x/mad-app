import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * العنوان الوطني السعودي مكتملاً (2.3 — سبعة حقول رسمية): الرقم الإضافي
 * ورقم الوحدة يكملان الخمسة القائمة. الرقم الإضافي أربع خانات يُتحقَّق منها
 * عند كتابته فقط — تاجرٌ بلا رقمٍ إضافي أولى بحقلٍ فارغ من فاتورة مرفوضة.
 */
describe('National address — 7 official fields (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now() % 100000}`;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
  }, 60000);

  afterAll(async () => {
    // نُعيد الحقلين فارغين كي لا تُورَّث بيانات الاختبار لبقية المجموعات.
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ legalName: `شركة العنوان الوطني ${suffix}`, additionalNumber: '', unitNumber: '' });
    await app.close();
  });

  it('stores and returns all seven fields together', async () => {
    const res = await auth(request(app.getHttpServer()).patch('/company-profile'))
      .send({
        legalName: `شركة العنوان الوطني ${suffix}`,
        street: `طريق الملك فهد ${suffix}`,
        buildingNumber: '3210',
        district: 'العليا',
        city: 'الرياض',
        postalCode: '12211',
        additionalNumber: '6789',
        unitNumber: `مكتب ${suffix}`,
      })
      .expect(200);

    expect(res.body.additionalNumber).toBe('6789');
    expect(res.body.unitNumber).toBe(`مكتب ${suffix}`);

    // والقراءة تعيدها كاملة — الحقلان ضمن select لا مقتطعين.
    const read = await auth(request(app.getHttpServer()).get('/company-profile')).expect(200);
    for (const [k, v] of Object.entries({
      buildingNumber: '3210',
      district: 'العليا',
      city: 'الرياض',
      postalCode: '12211',
      additionalNumber: '6789',
    })) {
      expect(read.body[k]).toBe(v);
    }
  }, 60000);

  it('refuses an additional number that is not four digits — in Arabic', async () => {
    const res = await auth(request(app.getHttpServer()).patch('/company-profile')).send({ legalName: `شركة العنوان الوطني ${suffix}`, additionalNumber: '12' }).expect(400);
    const message = Array.isArray(res.body.message) ? res.body.message.join(' ') : res.body.message;
    expect(message).toContain('أربع خانات');

    // ولم يُكتب شيء: القيمة السابقة كما هي.
    const read = await auth(request(app.getHttpServer()).get('/company-profile')).expect(200);
    expect(read.body.additionalNumber).toBe('6789');
  }, 60000);

  it('accepts clearing them — a merchant without an additional number is not blocked', async () => {
    const res = await auth(request(app.getHttpServer()).patch('/company-profile')).send({ legalName: `شركة العنوان الوطني ${suffix}`, additionalNumber: '', unitNumber: '' }).expect(200);
    expect(res.body.additionalNumber).toBeNull();
    expect(res.body.unitNumber).toBeNull();
  }, 60000);
});
