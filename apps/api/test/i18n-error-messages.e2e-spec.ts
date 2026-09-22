import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (6.0 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

describe('Localized error messages (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  const missingId = '00000000-0000-0000-0000-000000000000';

  it('returns Arabic by default when no Accept-Language is sent', async () => {
    const res = await request(app.getHttpServer()).get(`/invoices`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(res.body).toBeDefined();

    const err = await request(app.getHttpServer()).delete(`/invoices/${missingId}`).set('Authorization', `Bearer ${token}`).expect(404);
    expect(err.body.message).toBe('الفاتورة غير موجودة');
  });

  it('returns English when the caller asks for it', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/invoices/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en')
      .expect(404);
    expect(res.body.message).toBe('Invoice not found');
  });

  it('honours a regional tag and q-values (en-GB outranking ar)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/invoices/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'ar;q=0.3, en-GB;q=0.9')
      .expect(404);
    expect(res.body.message).toBe('Invoice not found');
  });

  it('falls back to Arabic for an unsupported language', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/invoices/${missingId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'fr-FR')
      .expect(404);
    expect(res.body.message).toBe('الفاتورة غير موجودة');
  });

  it('localizes a message that carries a runtime value', async () => {
    const suffix = `${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `T${suffix}`.slice(0, 8), name: 'حساب اختبار اللغة', type: 'asset' })
      .expect(201);

    const duplicate = { code: created.body.code, name: 'مكرر', type: 'asset' };

    const ar = await request(app.getHttpServer()).post('/accounts').set('Authorization', `Bearer ${token}`).send(duplicate).expect(409);
    expect(ar.body.message).toBe(`رمز الحساب "${created.body.code}" مستخدَم بالفعل`);

    const en = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en')
      .send(duplicate)
      .expect(409);
    expect(en.body.message).toBe(`Account code "${created.body.code}" is already in use`);

    await request(app.getHttpServer()).delete(`/accounts/${created.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);
  });

  it('localizes validation messages too (which arrive as an array)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/company-profile')
      .set('Authorization', `Bearer ${token}`)
      .set('Accept-Language', 'en')
      .send({ legalName: 'Test Co', vatNumber: '30012345600001' })
      .expect(400);

    const messages = Array.isArray(res.body.message) ? res.body.message : [res.body.message];
    expect(messages).toContain('VAT number must be 15 digits, starting and ending with 3');
  });
});
