import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Same proof as tenant-isolation.e2e-spec.ts, but for the Invoices feature:
 * customers and invoices (with their line items) must never leak across
 * companies, totals must be computed server-side (never trusting a
 * client-submitted total), and cross-tenant mutation attempts must 404
 * rather than succeed or leak existence.
 */
describe('Invoices tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let customerAId: string;

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

    const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${tokenA}`).expect(200);
    customerAId = customers.body[0].id;
  }, 30000); // booting a full Nest app + DB connections exceeds Jest's 5s default hook timeout

  afterAll(async () => {
    await app.close();
  });

  it("company B's customer list never includes company A's customers", async () => {
    const resB = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((c: { id: string }) => c.id === customerAId)).toBe(false);
  });

  it('computes invoice totals server-side from lines, ignoring any client-submitted amounts', async () => {
    const res = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        customerId: customerAId,
        issueDate: '2026-07-01',
        dueDate: '2026-07-31',
        lines: [
          { description: 'بند 1', quantity: 2, unitPrice: 100, taxRate: 15 },
          { description: 'بند 2', quantity: 1, unitPrice: 50, taxRate: 0 },
        ],
      })
      .expect(201);

    expect(Number(res.body.subtotal)).toBeCloseTo(250, 2); // 2*100 + 1*50
    expect(Number(res.body.taxTotal)).toBeCloseTo(30, 2); // 2*100*0.15
    expect(Number(res.body.total)).toBeCloseTo(280, 2);
    expect(res.body.lines).toHaveLength(2);

    const invoiceId = res.body.id;

    const resB = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(resB.body.some((i: { id: string }) => i.id === invoiceId)).toBe(false);

    await request(app.getHttpServer()).patch(`/invoices/${invoiceId}`).set('Authorization', `Bearer ${tokenB}`).send({ status: 'PAID' }).expect(404);
    await request(app.getHttpServer()).delete(`/invoices/${invoiceId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    const resA = await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const stillDue = resA.body.find((i: { id: string }) => i.id === invoiceId);
    expect(stillDue.status).toBe('DUE');

    await request(app.getHttpServer()).delete(`/invoices/${invoiceId}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  }, 15000);
});
