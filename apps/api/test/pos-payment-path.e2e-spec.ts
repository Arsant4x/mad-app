import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { TERMINAL_ADAPTERS } from '../src/integrations/payment-terminal.adapter';
import { PaymentsService } from '../src/payments/payments.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ② ينتظر جهازاً يستغرق ستَّ ثوانٍ عمداً.
jest.setTimeout(120000);

/**
 * ⭐ **مسارُ دفع الكاشير — المسابيرُ الثلاثة (الموجة ٢٦١) اختباراتٌ تُوكّد الحكمَ لا الحال** (`ق-١٤٠١`).
 *
 * بنصّ المالك: «**والمسابيرُ الثلاثة تصير اختباراتٍ تسقط اليوم بتوكيد الحكم لا الحال، قبل أوّل سطر.**»
 *
 * ① بيعٌ مزامَنٌ ببطاقةٍ والربطُ فعّال (`ق-١٣٩٧`): **رقمُ مرجع الجهاز إلزاميٌّ من إيصاله** — وبه يُقبل «غيرَ متحقَّق»
 *    حتى تطابقه التسوية، ولا يُنادى الجهاز (الدفعُ وقع عليه وهو بلا اتصال).
 * ② المسارُ الحيّ لا يشحن بطاقةً داخل معاملةٍ والربطُ فعّال — **والشحنُ خارج المعاملة** في محاولة دفعٍ تكتمل ولو أبطأ الجهاز.
 * ③ الإتمامُ ذرّيّ: **سقوطُه لا يترك فاتورةً يتيمة، وإعادتُه بالمعرّف نفسِه تُنتج فاتورةً واحدة** (`ق-١٣٩٤`).
 *
 * ⚠️ الحقولُ الجديدة تُقرأ من الصفّ كاملاً (`posPayments: true`) لا بتسميتها في `select` — كي يُترجَم الملفُّ على شيفرة
 * اليوم ويسقط بتوكيده لا بعجز المترجم (`§8.8`: «صفرُ اختبارٍ ليس سقوطاً»).
 */
describe('[SPEC 27.1] مسارُ دفع الكاشير — الحكمُ لا الحال (ق-١٣٩٧ · ق-١٤٠١)', () => {
  let app: INestApplication;
  let co: IsolatedCompany;
  let productId: string;
  let connectionId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

  type Row = { id: string; no: string; status: string; clientSaleId: string | null; posShiftId: string | null; posPayments: Record<string, unknown>[] };
  const invoices = async (): Promise<Row[]> =>
    (await app.get(TenantPrismaService).runInTenantContext(co.companyId, (tx) =>
      tx.invoice.findMany({
        select: { id: true, no: true, status: true, clientSaleId: true, posShiftId: true, posPayments: true },
        orderBy: { createdAt: 'asc' },
      }),
    )) as unknown as Row[];
  const freshSince = async (before: Row[]) => (await invoices()).filter((i) => !before.some((b) => b.id === i.id));

  /**
   * نداءاتُ الجهاز تُعدّ ولا تُغيَّر — والانتظارُ اختياريّ (②).
   * ⚠️ **الدالّةُ الأصلية تُلتقط مرّةً قبل أيّ جاسوس**: التقاطُها من الخاصّية لحظةَ الاستدعاء يلتقط جاسوساً لم يُرفع
   * (اختبارٌ سقط قبل رفعه) فيستدعي الجاسوسُ الجديدُ نفسَه بلا نهاية — وقع في أوّل تشغيلٍ لهذا الملفّ فعلّق ② حتى سقفه.
   */
  const realCharge = TERMINAL_ADAPTERS.MOCK.charge.bind(TERMINAL_ADAPTERS.MOCK) as (...a: unknown[]) => Promise<{ approved: boolean }>;
  const watchCharges = (delayMs = 0) => {
    const calls: { reference: string; approved: boolean }[] = [];
    const spy = jest.spyOn(TERMINAL_ADAPTERS.MOCK, 'charge').mockImplementation(async (c, r, ...rest: unknown[]) => {
      if (delayMs) await new Promise((done) => setTimeout(done, delayMs));
      const out = await realCharge(c, r, ...rest);
      calls.push({ reference: r.reference, approved: out.approved });
      return out as never;
    });
    return { calls, restore: () => spy.mockRestore() };
  };
  // ولا يعبر جاسوسٌ من اختبارٍ سقط إلى الذي يليه.
  afterEach(() => jest.restoreAllMocks());

  const ringing = (extra: Record<string, unknown> = {}) => ({
    clientSaleId: randomUUID(),
    ringAt: new Date().toISOString(),
    ringOffsetMin: 180,
    lines: [{ productId, quantity: 1 }],
    paymentMethod: 'CARD',
    ...extra,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    co = await registerIsolatedCompany(app, 'paypath');
    // عميلُ المرور قائمٌ كما في أيّ منشأةٍ بعد بيعها الأوّل — فيقيس ③ ذرّيةَ الإتمام وحدَها لا إنشاءَ العميل
    // (إثباتُه بالعكس بمعاملةٍ مستقلّة للفاتورة سقط أوّلَ مرّةٍ بـ404: المستقلّةُ لا ترى عميلاً أُنشئ في الخارجية غيرِ الملتزمة).
    await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل نقدي' }).expect(201);
    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `مسار الدفع ${Date.now()}`, price: 100 }).expect(201)).body.id;
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    connectionId = (await auth(http().post('/integrations')).send({ kind: 'PAYMENT_GATEWAY', provider: 'MOCK', credentials: { apiKey: 'paypath-262' } }).expect(201)).body.id;
  }, 120000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('[SPEC 27.1] ① بيعٌ مزامَنٌ ببطاقةٍ والربطُ فعّال: بلا رقم مرجع الجهاز يُردّ ولا فاتورة — وبه يُقبل «غيرَ متحقَّق» ولا يُنادى الجهاز (ق-١٣٩٧)', async () => {
    const watch = watchCharges();
    const before = await invoices();

    const without = await auth(http().post('/pos/sales/sync')).send(ringing());
    expect(without.status).toBe(400);
    expect(String(without.body.message)).toContain('مرجع');
    expect(await freshSince(before)).toHaveLength(0);

    const reference = `RRN-${Date.now()}`;
    const withRef = await auth(http().post('/pos/sales/sync')).send(ringing({ cardDeviceReference: reference }));
    watch.restore();
    expect(withRef.status).toBe(201);
    const fresh = await freshSince(before);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].status).toBe('PAID');
    const card = fresh[0].posPayments.find((p) => p.method === 'CARD');
    expect(card).toMatchObject({ verification: 'DEVICE_REFERENCE', deviceReference: reference, providerRef: null });
    // الدفعُ وقع على الجهاز وهو بلا اتصال — فلا يُشحن ثانيةً عند المزامنة.
    expect(watch.calls).toHaveLength(0);
  });

  it('[SPEC 27.1] ② جهازٌ يستغرق ستَّ ثوانٍ: المسارُ الحيّ لا يشحن والربطُ فعّال — ومحاولةُ الدفع تكتمل بفاتورةٍ مدفوعة لا 500 (ق-١٤٠١)', async () => {
    const watch = watchCharges(6000);
    const before = await invoices();

    const live = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CARD' });
    expect(live.status).toBe(409);
    // لا مالَ يُقبل لدى المزوّد بلا بيعٍ يُسجَّل: المسارُ الحيّ لا ينادي الجهاز أصلاً.
    expect(watch.calls).toHaveLength(0);
    expect(await freshSince(before)).toHaveLength(0);

    const created = await auth(http().post('/pos/payment-attempts')).send(ringing());
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('CREATED');
    const charged = await auth(http().post(`/pos/payment-attempts/${created.body.id}/charge`));
    watch.restore();
    expect(charged.status).toBe(201);
    expect(charged.body.status).toBe('COMPLETED');
    // المرجعُ عند المزوّد معرّفُ المحاولة نفسُه — مفتاحُ عدم التكرار.
    expect(watch.calls).toEqual([{ reference: created.body.id, approved: true }]);
    const fresh = await freshSince(before);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].status).toBe('PAID');
    const card = fresh[0].posPayments.find((p) => p.method === 'CARD');
    expect(card).toMatchObject({ verification: 'PROVIDER_APPROVED', providerRef: `MOCK-${created.body.id}` });
  });

  it('[SPEC 27.1] ③ سقوطُ الإتمام لا يترك فاتورةً يتيمة — وإعادةُ المزامنة بالمعرّف نفسِه فاتورةٌ واحدة (ق-١٣٩٤ · ق-١٤٠١)', async () => {
    await auth(http().patch(`/integrations/${connectionId}/enabled`)).send({ enabled: false }).expect(200);
    const spy = jest.spyOn(app.get(PaymentsService), 'recordPosReceipt').mockRejectedValueOnce(new Error('اختبار: سقوطُ آخر خطوات الإتمام'));
    const payload = ringing({ paymentMethod: 'CASH' });
    const before = await invoices();

    const first = await auth(http().post('/pos/sales/sync')).send(payload);
    expect(first.status).toBe(500);
    expect(await freshSince(before)).toHaveLength(0);

    const second = await auth(http().post('/pos/sales/sync')).send(payload);
    spy.mockRestore();
    expect(second.status).toBe(201);
    const fresh = await freshSince(before);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ status: 'PAID', clientSaleId: payload.clientSaleId });
    expect(fresh[0].posShiftId).not.toBeNull();

    // والإعادةُ الثالثة تُعيد الفاتورةَ نفسَها لا نسخة.
    const third = await auth(http().post('/pos/sales/sync')).send(payload).expect(201);
    expect(third.body.id).toBe(fresh[0].id);
    expect(await freshSince(before)).toHaveLength(1);
    await auth(http().patch(`/integrations/${connectionId}/enabled`)).send({ enabled: true }).expect(200);
  });
});
