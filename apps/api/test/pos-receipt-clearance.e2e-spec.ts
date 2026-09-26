import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — أطولُ اختبارٍ 1.6 ث والحزمةُ 56 ث أوّلَ تشغيلٍ بترجمتها على `mad_app_clean`.
jest.setTimeout(240000);

/**
 * 🔴 **بوّابةُ الإجازة في كلِّ مسارٍ يُخرج إيصالَ بيع** (`ق-١٤٤٧` · `ق-١٢٦١` أ).
 *
 * الفاتورةُ الضريبيةُ الكاملة (مشترٍ منشأةٌ أو اعتباريٌّ أو مسجَّل) **تُجاز لدى الهيئة قبل أن تُشارَك**: الإيصالُ بلا رمزٍ
 * و`clearance.required` فتحجب الشاشةُ الطباعة. **وكانت البوّابةُ في البيع المباشر وحدَه** (`finishReceipt`):
 * - **البيعُ المكتمل عبر محاولة البطاقة** يعيد `view()` — فيُرمى ناتجُ `finishReceipt` ويُقرأ الإيصالُ بلا بوّابة،
 *   **ويضيع معه تنبيهُ الرصيد السالب**.
 * - **وقراءةُ المحاولة بعد اكتمالها** و**إعادةُ المزامنة** تمرّان بالمبني نفسه (`withReceiptQr`) بلا بوّابة.
 *
 * **والحكم**: البوّابةُ صفةُ المستند (نوعُه من مشتريه وسطوره) لا صفةُ لحظة البيع — فتُحسب في بانيّ الإيصال الواحد، ويحملها
 * كلُّ مسار. **وتقريرُ الخصم** صفةُ لحظة الإتمام: يُعاد في ردّ المسار الذي أتمّ البيعَ نفسِه.
 */
describe('بوّابةُ الإجازة في كلِّ مسارٍ يُخرج إيصالَ بيع — والتنبيهُ لا يضيع (ق-١٤٤٧)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  let productId: string;
  let trackedProductId: string;
  let legalId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'receipt-clearance');
    // الاسمُ القانونيّ والرقمُ الضريبيّ — وإلا فالرمزُ `null` في كلِّ إيصال، فلا يميّز التوكيدُ المحجوبَ من غيره (المسبارُ يرى).
    await auth(http().patch('/company-profile')).send({ legalName: `منشأة الإجازة ${suffix}`, vatNumber: '300000000000003' }).expect(200);

    // فرعٌ بمستودع وصنفٌ مخزنيٌّ برصيد استلامٍ واحد — فبيعُ اثنين يهبط به تحت الصفر.
    const warehouseId = (await auth(http().post('/warehouses')).send({ name: `مستودع الإجازة ${suffix}` }).expect(201)).body.id as string;
    const branchId = (await auth(http().post('/branches')).send({ name: `فرع الإجازة ${suffix}`, warehouseId }).expect(201)).body.id as string;
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف الإجازة ${suffix}`, price: 100 }).expect(201)).body.id;
    trackedProductId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنفٌ مخزنيّ ${suffix}`, price: 50 }).expect(201)).body.id;
    await auth(http().post('/inventory/movements'))
      .send({ reason: 'اختبار — رصيدٌ واحد', productId: trackedProductId, warehouseId, type: 'IN', qty: 1, unitCost: 20, date: new Date().toISOString().slice(0, 10) })
      .expect(201);
    legalId = (await auth(http().post('/customers')).send({ kind: 'LEGAL_PERSON', name: `شركة المشتري ${suffix}` }).expect(201)).body.id;
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  const withGateway = async () => {
    await auth(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: `clearance-${suffix}` } }).expect(201);
  };

  it('[SPEC 6.13] 🔴 ① إعادةُ المزامنة لبيعٍ لمشترٍ اعتباريّ — الإيصالُ محجوبٌ بلا رمزٍ كأوّل مرّة', async () => {
    const clientSaleId = randomUUID();
    const body = { clientSaleId, lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH', customerId: legalId };
    const first = (await auth(http().post('/pos/sales/sync')).send(body).expect(201)).body;
    expect(first.clearance).toMatchObject({ required: true });
    const replay = (await auth(http().post('/pos/sales/sync')).send(body).expect(201)).body;
    expect(replay.id).toBe(first.id);
    expect({ clearance: replay.clearance?.required ?? null, qr: replay.zatcaQr }).toEqual({ clearance: true, qr: null });
  });

  it('[SPEC 6.13] والمرور: إعادةُ مزامنةِ بيعه تحمل البوّابةَ مفتوحةً والرمزَ حاضراً — فالحجبُ للمستند لا للمسار', async () => {
    const clientSaleId = randomUUID();
    const body = { clientSaleId, lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' };
    await auth(http().post('/pos/sales/sync')).send(body).expect(201);
    const replay = (await auth(http().post('/pos/sales/sync')).send(body).expect(201)).body;
    expect(replay.clearance).toEqual({ required: false });
    // الرمزُ حاضرٌ للمبسّطة — فغيابُه في الاعتباريّ حجبٌ لا عطل.
    expect(typeof replay.zatcaQr).toBe('string');
  });

  it('[SPEC 6.13] 🔴 ② البيعُ المكتمل ببطاقةٍ لمشترٍ اعتباريّ — ردُّ الشحن وقراءةُ المحاولة بعده محجوبان بلا رمز', async () => {
    await withGateway();
    const attempt = (await auth(http().post('/pos/payment-attempts')).send({ clientSaleId: randomUUID(), lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD', customerId: legalId }).expect(201)).body;
    const charged = (await auth(http().post(`/pos/payment-attempts/${attempt.id}/charge`)).expect(201)).body;
    expect(charged.status).toBe('COMPLETED');
    const read = (await auth(http().get(`/pos/payment-attempts/${attempt.id}`)).expect(200)).body;
    expect({
      chargeGate: charged.sale?.clearance?.required ?? null,
      chargeQr: charged.sale?.zatcaQr ?? null,
      readGate: read.sale?.clearance?.required ?? null,
      readQr: read.sale?.zatcaQr ?? null,
    }).toEqual({ chargeGate: true, chargeQr: null, readGate: true, readQr: null });
  });

  it('[SPEC 27.1] 🔴 ③ البيعُ المكتمل ببطاقة يحمل تقريرَ الخصم — والرصيدُ السالب لا يضيع', async () => {
    const attempt = (await auth(http().post('/pos/payment-attempts')).send({ clientSaleId: randomUUID(), lines: [{ productId: trackedProductId, quantity: 2 }], paymentMethod: 'CARD' }).expect(201)).body;
    const charged = (await auth(http().post(`/pos/payment-attempts/${attempt.id}/charge`)).expect(201)).body;
    expect(charged.status).toBe('COMPLETED');
    expect(charged.sale?.stockDeduction).toMatchObject({ deducted: true, belowZero: [{ productId: trackedProductId }] });
    expect(charged.sale?.clearance).toEqual({ required: false });
  });
});
