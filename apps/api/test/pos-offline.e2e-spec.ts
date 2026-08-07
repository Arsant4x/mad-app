import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * الأوفلاين (مستند §6 v2): «دون فقدان أو تكرار بيانات» حرفياً —
 * المزامنة idempotent على clientSaleId، والترقيم مركزي عند الوصول فلا
 * تتصادم طرفيات باعت أثناء الانقطاع، وتاريخ الفاتورة يوم الرنّ لا يوم
 * عودة الشبكة.
 */
describe('POS offline sync (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let productId: string;
  let shiftId: string;
  const invoiceIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ name: `شاي مثلج ${suffix}`, price: 40 }).expect(201)).body.id;
    shiftId = (await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 100 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 0 });
    for (const id of invoiceIds) await auth(request(app.getHttpServer()).delete(`/invoices/${id}`));
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`));
    await auth(request(app.getHttpServer()).delete(`/trash/products/${productId}`));
    await app.close();
  });

  it('syncs an offline sale — real number, ring-day date, offline ref kept', async () => {
    const clientSaleId = randomUUID();
    const res = await auth(request(app.getHttpServer()).post('/pos/sales/sync'))
      .send({
        clientSaleId,
        offlineRef: 'OFF-TEST1',
        ringAt: '2026-08-06T21:30:00.000Z',
        lines: [{ productId, quantity: 1 }],
        paymentMethod: 'CASH',
      })
      .expect(201);
    invoiceIds.push(res.body.id);

    expect(res.body.status).toBe('PAID');
    expect(res.body.no).toBeTruthy();
    expect(res.body.offlineRef).toBe('OFF-TEST1');
    // يوم الرنّ، لا يوم المزامنة.
    expect(String(res.body.issueDate).slice(0, 10)).toBe('2026-08-06');
  }, 60000);

  it('resending the same sale returns the SAME invoice — never a duplicate', async () => {
    const clientSaleId = randomUUID();
    const payload = { clientSaleId, offlineRef: 'OFF-TEST2', lines: [{ productId, quantity: 2 }], paymentMethod: 'CARD' as const };

    const first = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    invoiceIds.push(first.body.id);
    const second = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(second.body.no).toBe(first.body.no);

    // وفي الدرج مرة واحدة فقط.
    const cur = await auth(request(app.getHttpServer()).get('/pos/shifts/current')).expect(200);
    const thisSaleCount = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.filter(
      (i: { clientSaleId?: string }) => i.clientSaleId === clientSaleId,
    ).length;
    expect(thisSaleCount).toBe(1);
    expect(cur.body.id).toBe(shiftId);
  }, 60000);

  it('two terminals that sold offline sync without numbering collisions', async () => {
    const t1 = await auth(request(app.getHttpServer()).post('/pos/sales/sync'))
      .send({ clientSaleId: randomUUID(), offlineRef: 'OFF-T1', lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(201);
    const t2 = await auth(request(app.getHttpServer()).post('/pos/sales/sync'))
      .send({ clientSaleId: randomUUID(), offlineRef: 'OFF-T2', lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(t1.body.id, t2.body.id);

    expect(t1.body.no).not.toBe(t2.body.no);
    expect(t1.body.id).not.toBe(t2.body.id);
  }, 60000);
});
