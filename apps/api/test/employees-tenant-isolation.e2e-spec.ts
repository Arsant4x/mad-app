import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Employees tenant isolation (e2e)', () => {
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

  it('[SPEC 9.1] creates an employee for company A, invisible and unreachable by company B', async () => {
    const created = await request(app.getHttpServer())
      .post('/employees')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ fullName: `موظف اختبار ${Date.now()}`, hireDate: '2026-01-01', baseSalary: 5000 })
      .expect(201);

    expect(created.body.status).toBe('ACTIVE');

    const resB = await request(app.getHttpServer()).get('/employees').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((e: { id: string }) => e.id === created.body.id)).toBe(false);

    await request(app.getHttpServer()).patch(`/employees/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ status: 'TERMINATED' }).expect(404);
    await request(app.getHttpServer()).delete(`/employees/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/employees/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ status: 'SUSPENDED' })
      .expect(200);
    expect(updated.body.status).toBe('SUSPENDED');

    await request(app.getHttpServer()).delete(`/employees/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 20000);
});
