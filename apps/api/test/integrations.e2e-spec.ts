import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';

/**
 * طبقة التكاملات (المستند: adapters قابلة للاستبدال + «تشفير أي مفاتيح API»):
 * المفاتيح مشفّرة في القاعدة فعلاً (نقرأ الصفّ الخام ونتأكد)، القراءات
 * مقنَّعة، الربط ملك المالك وحده ومعزول عن الجيران، والكاشير يستشير البوابة:
 * موافقة المزوّد التجريبي تختم مرجعه على صف البطاقة، ورفضه لا يخلّف فاتورة.
 */
describe('Integrations + POS terminal adapter (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let tokenB: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const API_KEY = `sk-live-secret-${suffix}`;
  let connectionId: string;
  let productId: string;
  let shiftId: string;
  const invoiceIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    tokenB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;
    // 100 → مع الضريبة 115.00 (موافقة)؛ 0.113 يُدبَّر لاحقاً لمبلغ .13 (رفض).
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `منتج بوابة ${suffix}`, price: 100 }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    if (shiftId) await auth(request(app.getHttpServer()).post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 0 });
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), invoiceIds);
    if (connectionId) await auth(request(app.getHttpServer()).delete(`/integrations/${connectionId}`));
    await auth(request(app.getHttpServer()).delete(`/products/${productId}`));
    await auth(request(app.getHttpServer()).delete(`/trash/products/${productId}`));
    await app.close();
  });

  it('stores credentials ENCRYPTED at rest and returns them masked', async () => {
    const res = await auth(request(app.getHttpServer()).post('/integrations'))
      .send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', label: `بوابة تجريبية ${suffix}`, credentials: { apiKey: API_KEY } })
      .expect(201);
    connectionId = res.body.id;

    // القناع في الردّ: آخر 4 فقط.
    expect(res.body.credentials.apiKey).toBe(`••••${API_KEY.slice(-4)}`);
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);

    // والصفّ الخام في القاعدة لا يحوي المفتاح صريحاً. (القراءة تمرّ بسياق
    // الشركة — القراءة بلا سياق يصدّها RLS أصلاً، وهو سلوك مُثبَت في
    // tenant-isolation specs.)
    const companyId = (JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as { companyId: string }).companyId;
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return tx.$queryRaw<{ credentials: string }[]>`SELECT credentials FROM integration_connections WHERE id = ${connectionId}`;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].credentials).not.toContain(API_KEY);
    expect(rows[0].credentials.split('.')).toHaveLength(3); // iv.tag.ciphertext
  }, 60000);

  it('a second active connection of the same kind is refused; neighbours see nothing', async () => {
    await auth(request(app.getHttpServer()).post('/integrations'))
      .send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: 'other' } })
      .expect(409);

    const listB = await request(app.getHttpServer()).get('/integrations').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect((listB.body as { id: string }[]).some((c) => c.id === connectionId)).toBe(false);
  }, 60000);

  it('an employee cannot manage integrations even with the settings screen', async () => {
    const tpl = await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `إعدادات فقط ${suffix}`, allowedScreens: ['settings'] })
      .expect(201);
    const username = `integ-emp-${suffix}`;
    const emp = await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'موظف إعدادات', username, password: 'IntegPass123!', permissionTemplateId: tpl.body.id })
      .expect(201);
    const empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'IntegPass123!' })).body.accessToken;

    await request(app.getHttpServer()).get('/integrations').set('Authorization', `Bearer ${empToken}`).expect(403);

    await auth(request(app.getHttpServer()).delete(`/company-users/${emp.body.id}`));
    await auth(request(app.getHttpServer()).delete(`/templates/${tpl.body.id}`));
  }, 60000);

  it('a card sale rides the gateway: approved → providerRef stamped on the card row', async () => {
    shiftId = (await auth(request(app.getHttpServer()).post('/pos/shifts')).send({ openingFloat: 0 }).expect(201)).body.id;

    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD' })
      .expect(201);
    invoiceIds.push(res.body.id);

    const cardRow = (res.body.posPayments as { method: string; providerRef: string | null }[]).find((p) => p.method === 'CARD');
    expect(cardRow?.providerRef).toMatch(/^MOCK-/);
  }, 60000);

  it('a declined card leaves NOTHING behind — no invoice, clear reason', async () => {
    // منتج سعره يجعل الإجمالي بعد الضريبة ينتهي بـ .13 → رفض تجريبي حتمي.
    // 5.33 × 1.15 = 6.1295 ≈ لا؛ نحسبها عكسياً: نريد total=x.13؛
    // خذ 0.98 × 1.15 = 1.127 → 1.13 بعد تقريب الجمع؟ الحساب يستخدم أرقاماً
    // عشرية كاملة، لذا نصنع السطر مباشرة بسعر 1.852173913... غير عملي —
    // الأنظف: منتج بسعر 36.635 لا يجوز؛ نستخدم سعر 0.98 وكمية 1:
    // subtotal=0.98، tax=0.147، total=1.127 → هللاتها 12.7 ليست 13.
    // أدقّ طريق: سعر 5.20 × 1.15 = 5.98؛ سعر 0.113... المضمون: سعر 8.808...
    // نتوقف عن التخمين: 17.5 × 1.15 = 20.125 (12.5)؛ 4.46 × 1.15 = 5.129 → 12.9؛
    // 4.4695...; المستقيم فعلاً: 0.9826086957؟ — نستخدم بدل ذلك كمية تضبطها:
    // price=0.2 qty=49 → subtotal=9.8, tax=1.47, total=11.27 → 27. لا.
    // price=0.01, qty=971 → subtotal 9.71, tax 1.4565, total 11.1665 → 17. لا.
    // الطريقة المضمونة رياضياً: total = subtotal*1.15 ينتهي بـ13 ⇔
    // subtotal = X/1.15 حيث X.13؛ خذ X=9.13 ⇒ subtotal=7.939130435 — ليس سعراً نظيفاً.
    // لذلك نختبر الرفض بسعر يعطي total مضبوطاً: 7.94 × 1.15 = 9.131 → هللات 13.1؟
    // Math.round(9.131*100)%100 = 913%100 = 13 ✓ (913.0999 يقرَّب 913).
    const declineProduct = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `رفض ${suffix}`, price: 7.94 }).expect(201)).body.id;

    const before = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;
    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId: declineProduct, quantity: 1 }], paymentMethod: 'CARD' })
      .expect(400);
    expect(res.body.message).toContain('رفض');
    const after = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;
    expect(after).toBe(before);

    await auth(request(app.getHttpServer()).delete(`/products/${declineProduct}`));
    await auth(request(app.getHttpServer()).delete(`/trash/products/${declineProduct}`));
  }, 60000);

  it('disabling the connection restores terminal-less behavior', async () => {
    await auth(request(app.getHttpServer()).patch(`/integrations/${connectionId}/enabled`)).send({ enabled: false }).expect(200);

    const res = await auth(request(app.getHttpServer()).post('/pos/sales'))
      .send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD' })
      .expect(201);
    invoiceIds.push(res.body.id);
    const cardRow = (res.body.posPayments as { method: string; providerRef: string | null }[]).find((p) => p.method === 'CARD');
    expect(cardRow?.providerRef).toBeNull();
  }, 60000);
});
