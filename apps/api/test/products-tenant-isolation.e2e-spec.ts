import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (29.2 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(90000);

describe('Products tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('[SPEC 8.1] auto-generates a barcode when none is given, and keeps the product invisible to and unreachable by company B', async () => {
    const created = await request(app.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `منتج اختبار ${Date.now()}`, price: 100, cost: 40 })
      .expect(201);

    expect(created.body.barcode).toMatch(/^2\d{11}$/);

    const resB = await request(app.getHttpServer()).get('/products').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((p: { id: string }) => p.id === created.body.id)).toBe(false);

    await request(app.getHttpServer()).patch(`/products/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ price: 1 }).expect(404);
    await request(app.getHttpServer()).delete(`/products/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    await request(app.getHttpServer()).delete(`/products/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 20000);
});
