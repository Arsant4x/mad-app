import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';

/**
 * الدفع المقسّم (مستند §4): نقدي + بطاقة على نفس الفاتورة. الدرج يستلم الجزء
 * النقدي فقط، والأجزاء تُدقَّق ضد إجمالي الخادم قبل إنشاء أي شيء.
 */
describe('POS split payment (e2e)', () => {
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
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `عصير ${suffix}`, price: 40 }).expect(201)).body.id;
    shiftId = (await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 50 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 0 });
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), invoiceIds);
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`));
    await auth(request(app.getHttpServer()).delete(`/trash/products/${productId}`));
    await app.close();
  });

  it('splits one invoice between cash and card — only the cash lands in the drawer', async () => {
    // 3 × 40 = 120، +15% = 138
    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({
        lines: [{ productId, quantity: 3 }],
        paymentMethod: 'SPLIT',
        payments: [
          { method: 'CASH', amount: 100 },
          { method: 'CARD', amount: 38 },
        ],
      })
      .expect(201);
    invoiceIds.push(res.body.id);
    expect(res.body.paymentMethod).toBe('SPLIT');
    expect(Number(res.body.total)).toBeCloseTo(138, 2);

    const cur = await auth(request(app.getHttpServer()).get('/pos/shifts/current')).expect(200);
    // ② المالُ نصّاً بخانتين (`ق-١٢٣٥`) — يُقارَن حرفاً.
    expect(cur.body.cashTotal).toBe('100.00');
    expect(cur.body.cardTotal).toBe('38.00');
    // الدرج = العهدة 50 + النقد 100 فقط.
    expect(cur.body.expectedCash).toBe('150.00');
  }, 60000);

  it('refuses parts that do not add up, before creating anything', async () => {
    const before = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;
    await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({
        lines: [{ productId, quantity: 3 }],
        paymentMethod: 'SPLIT',
        payments: [
          { method: 'CASH', amount: 50 },
          { method: 'CARD', amount: 50 },
        ],
      })
      .expect(400);
    const after = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;
    // لا فاتورة يتيمة خلفها الرفض.
    expect(after).toBe(before);
  }, 60000);

  it('refuses parts sent with a non-split method, and split without parts', async () => {
    await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH', payments: [{ method: 'CASH', amount: 46 }] })
      .expect(400);
    await auth(request(app.getHttpServer()).post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'SPLIT' }).expect(400);
  }, 60000);

  it('an offline split sale syncs idempotently with its parts intact', async () => {
    const payload = {
      clientSaleId: randomUUID(),
      offlineRef: 'OFF-SPLIT',
      lines: [{ productId, quantity: 1 }],
      paymentMethod: 'SPLIT' as const,
      payments: [
        { method: 'CASH' as const, amount: 20 },
        { method: 'CARD' as const, amount: 26 },
      ],
    };
    const first = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    invoiceIds.push(first.body.id);
    const second = await auth(request(app.getHttpServer()).post('/pos/sales/sync')).send(payload).expect(201);
    expect(second.body.id).toBe(first.body.id);

    // الدرج بعدها: 150 سابقاً + 20 نقد هذا البيع — مرة واحدة لا مرتين.
    const cur = await auth(request(app.getHttpServer()).get('/pos/shifts/current')).expect(200);
    expect(cur.body.cashTotal).toBe('120.00');
    expect(cur.body.expectedCash).toBe('170.00');
  }, 60000);
});
