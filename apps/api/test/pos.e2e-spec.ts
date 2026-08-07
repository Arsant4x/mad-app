import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * الكاشير v1 (مستند §6): مناوبة تُفتح بعهدة، بيعٌ يصير فاتورة مدفوعة على نفس
 * سلسلة الترقيم، درجٌ يُشتق من الفواتير لا من عدّاد، وإقفال يحسب الفرق بنفسه.
 */
describe('POS cashier (e2e)', () => {
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
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ name: `قهوة مختصة ${suffix}`, price: 100 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    for (const id of invoiceIds) await auth(request(app.getHttpServer()).delete(`/invoices/${id}`));
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`));
    await auth(request(app.getHttpServer()).delete(`/trash/products/${productId}`));
    await app.close();
  });

  it('opens a shift with a float — and refuses a second open drawer', async () => {
    const res = await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 200 }).expect(201);
    shiftId = res.body.id;
    expect(res.body.status).toBe('OPEN');

    await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 50 }).expect(409);
  }, 60000);

  it('rings a cash sale as a real PAID invoice (numbering + VAT included)', async () => {
    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 2 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(res.body.id);

    expect(res.body.status).toBe('PAID');
    expect(res.body.paymentMethod).toBe('CASH');
    expect(res.body.posShiftId).toBe(shiftId);
    expect(res.body.no).toBeTruthy();
    // 2 × 100 + 15% ضريبة
    expect(Number(res.body.total)).toBeCloseTo(230, 2);
    // بلا عميل مسمّى → «عميل نقدي» تلقائياً.
    expect(res.body.customer.name).toBe('عميل نقدي');
  }, 60000);

  it('rings a card sale and derives the drawer from the invoices', async () => {
    const sale = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD' })
      .expect(201);
    invoiceIds.push(sale.body.id);

    const cur = await auth(request(app.getHttpServer()).get('/pos/shifts/current')).expect(200);
    expect(cur.body.id).toBe(shiftId);
    expect(cur.body.salesCount).toBe(2);
    expect(cur.body.cashTotal).toBeCloseTo(230, 2);
    expect(cur.body.cardTotal).toBeCloseTo(115, 2);
    // الدرج المتوقع = العهدة + النقد فقط — الشبكة ليست في الدرج.
    expect(cur.body.expectedCash).toBeCloseTo(430, 2);
  }, 60000);

  it('closes the shift computing the variance itself — and blocks further sales', async () => {
    const res = await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 400 }).expect(201);
    expect(res.body.status).toBe('CLOSED');
    // عدّ 400 والمتوقع 430 → عجز 30.
    expect(res.body.variance).toBeCloseTo(-30, 2);

    await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(409);
    await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 400 }).expect(409);
  }, 60000);

  it('the pos screen is gated by the owner-granted template', async () => {
    const tpl = await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `بلا كاشير ${suffix}`, allowedScreens: ['dashboard'] })
      .expect(201);
    const username = `no-pos-${suffix}`;
    const emp = await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'موظف بلا كاشير', username, password: 'PosPass123!', permissionTemplateId: tpl.body.id })
      .expect(201);
    const empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'PosPass123!' })).body.accessToken;

    await request(app.getHttpServer()).get('/pos/shifts').set('Authorization', `Bearer ${empToken}`).expect(403);

    await auth(request(app.getHttpServer()).delete(`/company-users/${emp.body.id}`));
    await auth(request(app.getHttpServer()).delete(`/templates/${tpl.body.id}`));
  }, 60000);
});
