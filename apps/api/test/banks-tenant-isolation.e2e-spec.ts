import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Banks tenant isolation (e2e)', () => {
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

  it('[SPEC 7.1] creates a bank account for company A, invisible/unreachable by B, and preserves balance drift when opening balance is edited', async () => {
    const created = await request(app.getHttpServer())
      .post('/banks')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `حساب اختبار ${Date.now()}`, openingBalance: 1000, openingDate: '2026-01-01' })
      .expect(201);

    expect(Number(created.body.balance)).toBe(1000);

    const resB = await request(app.getHttpServer()).get('/banks').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((b: { id: string }) => b.id === created.body.id)).toBe(false);

    await request(app.getHttpServer()).patch(`/banks/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ name: 'hijack' }).expect(404);
    await request(app.getHttpServer()).delete(`/banks/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    // Opening balance +500 should shift the current balance by the same delta.
    const updated = await request(app.getHttpServer())
      .patch(`/banks/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ openingBalance: 1500 })
      .expect(200);
    expect(Number(updated.body.balance)).toBe(1500);

    await request(app.getHttpServer()).delete(`/banks/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 20000);
});
