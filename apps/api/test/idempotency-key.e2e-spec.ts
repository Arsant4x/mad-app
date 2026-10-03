import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تقديرٌ أوّلٌ قبل أن تُقاس، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيسٍ في السير.
jest.setTimeout(180000);

/**
 * ⚖️ **الإرسالُ المكرّر لا يُنشئ مستندين** (توجيه ٢٧٦ · `ق-١٦٠٩`/ب، بالقاعدة ٣٧ — مقياسُ م٥ في المسح ٣٤).
 *
 * كان المحميُّ البيعَ بلا اتصال ومحاولةَ البطاقة وحدَهما (معرّفٌ يولّده الجهاز، فريدٌ في القاعدة). وسندُ القبض وسندُ الصرف وقبضُ
 * الإيجار وبيعُ الكاشير المتّصل يُنشئ كلٌّ منها مستندين لطلبٍ واحدٍ أُرسل مرّتين (نقرةٌ مزدوجة، أو إعادةُ شبكةٍ بعد مهلة).
 *
 * والعلاجُ رأسُ `Idempotency-Key` يولّده العميلُ للطلب الواحد: المفتاحُ نفسُه يُعيد المستندَ نفسَه ولا يكتب ثانياً، ولو وصل الطلبان
 * معاً؛ والمفتاحُ نفسُه بمبلغٍ آخر يُرفض `409` (مفتاحٌ أُعيد لطلبٍ غيره)؛ والمفتاحُ بغير صيغته يُرفض `400`.
 */
const today = () => new Date().toISOString().slice(0, 10);

describe('⚖️ الإرسالُ المكرّر لا يُنشئ مستندين — رأسُ Idempotency-Key (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const key = (tag: string) => `e2e-${tag}-${suffix}-${++seq}`;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const keyed = (r: request.Test, k: string) => auth(r).set('Idempotency-Key', k);

  let customerId: string;
  let supplierId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'idempotency');
    token = company.token;
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل التكرار ${suffix}` }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد التكرار ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  /** فاتورةٌ بإجماليٍّ محدَّد: بندٌ واحدٌ معفى يجعل الحسابَ صريحاً. */
  const makeInvoice = async (total: number): Promise<string> =>
    (
      await auth(http().post('/invoices'))
        .send({
          customerId,
          issueDate: today(),
          dueDate: today(),
          lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
        })
        .expect(201)
    ).body.id as string;

  const count = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);

  it('① سندُ القبض: المفتاحُ نفسُه مرّتين يعيد السندَ نفسَه ولا يكتب ثانياً', async () => {
    const invoiceId = await makeInvoice(1000);
    const k = key('rcv');
    const body = { customerId, date: today(), amount: 400, method: 'CASH', allocations: [{ invoiceId, amount: 400 }] };
    const first = await keyed(http().post('/payments'), k).send(body).expect(201);
    const second = await keyed(http().post('/payments'), k).send(body);
    expect([200, 201]).toContain(second.status);
    expect(second.body.id).toBe(first.body.id);
    expect(await count((tx) => tx.payment.count({ where: { customerId, allocations: { some: { invoiceId } } } }))).toBe(1);
  });

  it('② سندُ القبض: طلبان معاً بالمفتاح نفسِه ⇒ سندٌ واحد يعيده الاثنان', async () => {
    const invoiceId = await makeInvoice(1000);
    const k = key('rcv-race');
    const body = { customerId, date: today(), amount: 300, method: 'CASH', allocations: [{ invoiceId, amount: 300 }] };
    const [a, b] = await Promise.all([keyed(http().post('/payments'), k).send(body), keyed(http().post('/payments'), k).send(body)]);
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
    expect(a.body.id).toBe(b.body.id);
    expect(await count((tx) => tx.payment.count({ where: { customerId, allocations: { some: { invoiceId } } } }))).toBe(1);
  });

  it('③ المفتاحُ نفسُه بمبلغٍ آخر يُرفض 409 — مفتاحٌ أُعيد لطلبٍ غيره · وبغير صيغته 400', async () => {
    const invoiceId = await makeInvoice(1000);
    const k = key('rcv-reuse');
    await keyed(http().post('/payments'), k).send({ customerId, date: today(), amount: 100, method: 'CASH', allocations: [{ invoiceId, amount: 100 }] }).expect(201);
    const reused = await keyed(http().post('/payments'), k).send({ customerId, date: today(), amount: 200, method: 'CASH', allocations: [{ invoiceId, amount: 200 }] }).expect(409);
    expect(String(reused.body.message)).toContain('المفتاح');
    await keyed(http().post('/payments'), 'short').send({ customerId, date: today(), amount: 50, method: 'CASH', allocations: [{ invoiceId, amount: 50 }] }).expect(400);
  });

  it('④ سندُ الصرف: المفتاحُ نفسُه مرّتين، ثم طلبان معاً ⇒ سندٌ واحدٌ لكلٍّ', async () => {
    const k1 = key('pay');
    const body1 = { supplierId, date: today(), amount: 250, method: 'CASH' };
    const first = await keyed(http().post('/supplier-payments'), k1).send(body1).expect(201);
    const second = await keyed(http().post('/supplier-payments'), k1).send(body1);
    expect([200, 201]).toContain(second.status);
    expect(second.body.id).toBe(first.body.id);

    const k2 = key('pay-race');
    const body2 = { supplierId, date: today(), amount: 175, method: 'CASH' };
    const [a, b] = await Promise.all([keyed(http().post('/supplier-payments'), k2).send(body2), keyed(http().post('/supplier-payments'), k2).send(body2)]);
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
    expect(a.body.id).toBe(b.body.id);
    expect(await count((tx) => tx.supplierPayment.count({ where: { supplierId, amount: { in: [250, 175] } } }))).toBe(2);
  });

  it('⑤ قبضُ الإيجار: المفتاحُ نفسُه مرّتين، ثم طلبان معاً ⇒ قبضٌ واحدٌ لكلٍّ', async () => {
    const property = (await auth(http().post('/properties')).send({ name: `عقار التكرار ${suffix}`, ownership: 'owned' }).expect(201)).body;
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `I-${suffix}`, type: 'شقة', rentMonthly: 1000 }).expect(201)).body;
    const contract = (
      await auth(http().post('/contracts'))
        .send({
          unitId: unit.id,
          customerId: await createTenantCustomer(app, token, `مستأجر التكرار ${suffix}`),
          value: 12000,
          cycle: 'monthly',
          start: today(),
          end: new Date(Date.now() + 360 * 86_400_000).toISOString().slice(0, 10),
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
        })
        .expect(201)
    ).body as { id: string; installments: { id: string }[] };

    const k1 = key('rent');
    const body1 = { installmentId: contract.installments[0].id, amount: 400, method: 'CASH', date: today() };
    const first = await keyed(http().post(`/contracts/${contract.id}/payments`), k1).send(body1).expect(201);
    const second = await keyed(http().post(`/contracts/${contract.id}/payments`), k1).send(body1);
    expect([200, 201]).toContain(second.status);
    expect(second.body.id).toBe(first.body.id);

    const k2 = key('rent-race');
    const body2 = { installmentId: contract.installments[1].id, amount: 300, method: 'CASH', date: today() };
    const [a, b] = await Promise.all([keyed(http().post(`/contracts/${contract.id}/payments`), k2).send(body2), keyed(http().post(`/contracts/${contract.id}/payments`), k2).send(body2)]);
    expect([200, 201]).toContain(a.status);
    expect([200, 201]).toContain(b.status);
    expect(a.body.id).toBe(b.body.id);
    expect(await count((tx) => tx.rentPayment.count({ where: { contractId: contract.id } }))).toBe(2);
  });

  it('⑥ بيعُ الكاشير المتّصل: المفتاحُ نفسُه مرّتين يعيد الفاتورةَ نفسَها ولا يبيع ثانياً', async () => {
    const productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف التكرار ${suffix}`, price: 100 }).expect(201)).body.id as string;
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    const k = key('pos');
    const body = { lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' };
    const first = await keyed(http().post('/pos/sales'), k).send(body).expect(201);
    const second = await keyed(http().post('/pos/sales'), k).send(body);
    expect([200, 201]).toContain(second.status);
    expect(second.body.id).toBe(first.body.id);
    expect(await count((tx) => tx.invoice.count({ where: { lines: { some: { productId } } } }))).toBe(1);
  });
});
