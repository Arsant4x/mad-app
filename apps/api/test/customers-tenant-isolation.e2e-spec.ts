import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Customers CRUD: tenant isolation, duplicate-name/VAT rejection, and the
 * FK-restrict guard that stops deleting a customer that still has invoices.
 */
describe('Customers tenant isolation (e2e)', () => {
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

  it('creates, rejects duplicate name, updates, and deletes a customer scoped to company A only', async () => {
    const uniqueName = `عميل اختبار ${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: uniqueName, creditLimit: 1000 })
      .expect(201);

    await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${tokenA}`).send({ name: uniqueName }).expect(409);

    const resB = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((c: { id: string }) => c.id === created.body.id)).toBe(false);

    await request(app.getHttpServer()).patch(`/customers/${created.body.id}`).set('Authorization', `Bearer ${tokenB}`).send({ name: 'hijack attempt' }).expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ creditLimit: 5000 })
      .expect(200);
    expect(Number(updated.body.creditLimit)).toBe(5000);

    await request(app.getHttpServer()).delete(`/customers/${created.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 20000);

  it('refuses to delete a customer that still has invoices', async () => {
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `عميل مع فاتورة ${Date.now()}` })
      .expect(201);

    await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customer.body.id,
        issueDate: '2026-07-01',
        dueDate: '2026-07-31',
        lines: [{ description: 'بند', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);

    await request(app.getHttpServer()).delete(`/customers/${customer.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);
  }, 20000);
});
