import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(240000);

/**
 * ⚖️ **القوائمُ تُرشَّح بفروع القارئ** (توجيه ٢٧٥ · `ق-١٥٨١`، بحكم صاحب المشروع).
 *
 * مسحُ توجيه ٢٧٤ (الكتلة ٥ج) وجد قوائمَ تُعرض لموظّفٍ مقيَّدٍ بفرعٍ بصفوف الفروع كلِّها، معلَنةً «على مستوى المنشأة بحقّها»:
 * فواتيرُ العميل المفتوحة ومشترياتُ المورّد المفتوحة ودفعاتُه المقدَّمة (يوزّع منها سندَه) · ورقمُ المستند ومبلغُه في تخصيص سندٍ
 * من فرعه على مستندِ فرعٍ آخر · وتقريرُ الأرصدة الافتتاحية · ووقائعُ انقطاع الكاشير. (وقائمةُ المستودعات معروضةٌ لا مبنيّة: ④.)
 *
 * والحكمُ حكمُ القائمة في المشروع (`branchFilter`): صفُّ فرعه وصفُّ المنشأة كلِّها (بلا فرع) يُريان، وصفُّ الفرع الآخر لا.
 * والمستودعُ فرعُه الفرعُ الذي يشير إليه (`Branch.warehouseId`)، والذي لا يشير إليه فرعٌ مستودعُ المنشأة كلِّها. والوقعةُ
 * فرعُها فروعُ بيوعها. **ومع القائمة كتابتُها**: تخصيصُ سندٍ على مستندِ فرعٍ لا يراه القارئ يُرفض كما يُرفض قراءتُه.
 *
 * ولكلِّ سالبٍ ضابطٌ موجب: المالكُ يرى صفَّ الفرع الآخر بالمسبار نفسِه، فغيابُه عند المقيَّد حكمٌ لا عمى.
 */
describe('القوائمُ تُرشَّح بفروع القارئ (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  type Auth = (r: request.Test) => request.Test;
  const bearer = (token: string): Auth => (r) => r.set('Authorization', `Bearer ${token}`);
  let owner: Auth;
  let restricted: Auth;
  let branchA: string;
  let branchB: string;
  let warehouseA: string;
  let warehouseB: string;
  let customerId: string;
  let supplierId: string;
  let productId: string;
  const ids = { invoiceA: '', invoiceB: '', invoiceCompany: '', purchaseA: '', purchaseB: '', prepaymentA: '', prepaymentB: '', paymentA: '', supplierPaymentA: '', invoiceB2: '', incidentA: '', incidentB: '' };
  // يومٌ ثابتٌ بعيد وساعتان متباعدتان: لكلِّ فرعٍ وقعتُه، فلا تندمجان.
  const ringBase = Date.UTC(2026, 6, 14, 6, 0, 0);
  const ringAt = (hours: number) => new Date(ringBase + hours * 3_600_000).toISOString();
  const idsOf = (body: unknown): string[] => ((Array.isArray(body) ? body : (body as { items: unknown[] }).items) as { id: string }[]).map((r) => r.id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'branch-lists');
    owner = bearer(company.token);

    const warehouse = async (name: string): Promise<string> => (await owner(http().post('/warehouses')).send({ name: `${name} ${suffix}` }).expect(201)).body.id;
    warehouseA = await warehouse('مستودع أ');
    warehouseB = await warehouse('مستودع ب');
    branchA = (await owner(http().post('/branches')).send({ name: `فرع أ ${suffix}`, type: 'فرع', warehouseId: warehouseA }).expect(201)).body.id;
    branchB = (await owner(http().post('/branches')).send({ name: `فرع ب ${suffix}`, type: 'فرع', warehouseId: warehouseB }).expect(201)).body.id;

    customerId = await createTenantCustomer(app, company.token, `عميل القوائم ${suffix}`);
    supplierId = (await owner(http().post('/suppliers')).send({ name: `مورد القوائم ${suffix}` }).expect(201)).body.id;
    productId = (await owner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف القوائم ${suffix}`, price: 10 }).expect(201)).body.id;

    const invoice = async (branchId: string | null, unitPrice: number): Promise<string> =>
      (
        await owner(http().post('/invoices'))
          .send({ customerId, ...(branchId ? { branchId } : {}), issueDate: today, dueDate: today, lines: [{ description: `بيع ${suffix}`, quantity: 1, unitPrice, taxCategory: 'S' }] })
          .expect(201)
      ).body.id;
    ids.invoiceA = await invoice(branchA, 100);
    ids.invoiceB = await invoice(branchB, 200);
    ids.invoiceB2 = await invoice(branchB, 50);
    ids.invoiceCompany = await invoice(null, 300);
    const purchase = async (branchId: string, subtotal: number): Promise<string> =>
      (await owner(http().post('/purchases')).send({ supplierId, branchId, date: today, subtotal, exempt: true }).expect(201)).body.id;
    ids.purchaseA = await purchase(branchA, 40);
    ids.purchaseB = await purchase(branchB, 60);
    const prepayment = async (branchId: string): Promise<string> =>
      (
        await owner(http().post('/payments'))
          .send({ customerId, branchId, date: today, amount: 115, method: 'CASH', unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } })
          .expect(201)
      ).body.prepaymentInvoice.id;
    ids.prepaymentA = await prepayment(branchA);
    ids.prepaymentB = await prepayment(branchB);

    // سندٌ في فرع أ يخصّصه المالكُ على فاتورة أ وفاتورة ب معاً — ثم يقرؤه المقيَّد.
    ids.paymentA = (
      await owner(http().post('/payments'))
        .send({ customerId, branchId: branchA, date: today, amount: 30, method: 'CASH', allocations: [{ invoiceId: ids.invoiceA, amount: 10 }, { invoiceId: ids.invoiceB, amount: 20 }] })
        .expect(201)
    ).body.id;
    ids.supplierPaymentA = (
      await owner(http().post('/supplier-payments'))
        .send({ supplierId, branchId: branchA, date: today, amount: 15, method: 'CASH', allocations: [{ purchaseId: ids.purchaseA, amount: 5 }, { purchaseId: ids.purchaseB, amount: 10 }] })
        .expect(201)
    ).body.id;

    // الأرصدةُ الافتتاحية: سطرٌ في كلِّ مستودع.
    await owner(http().post('/inventory/opening'))
      .send({
        openingDate: today,
        lines: [
          { productId, warehouseId: warehouseA, qty: 1, unitCost: 3, acquiredAt: today, evidenceRef: `سند أ ${suffix}` },
          { productId, warehouseId: warehouseB, qty: 1, unitCost: 7, acquiredAt: today, evidenceRef: `سند ب ${suffix}` },
        ],
      })
      .expect(201);

    const template = (
      await owner(http().post('/templates'))
        .send({ name: `القوائم ${suffix}`, allowedScreens: ['dashboard', 'invoice', 'payments', 'customers', 'suppliers', 'inventory', 'products', 'pos'] })
        .expect(201)
    ).body.id as string;
    const username = `lists-north-${suffix}`;
    await owner(http().post('/company-users')).send({ name: username, username, password: 'ListsPass123!', permissionTemplateId: template, branchIds: [branchA] }).expect(201);
    restricted = bearer((await http().post('/auth/login').send({ username, password: 'ListsPass123!' }).expect(200)).body.accessToken);

    // وقعتا انقطاع: بيعٌ متأخّرُ المزامنة في مناوبة فرع أ (المقيَّد)، وآخرُ في مناوبة فرع ب (المالك) بعده بستّ ساعات.
    // بصنفٍ بلا حركة مخزون (خدمة)، فلا تمسّ البيوعُ المؤرَّخةُ قبل الافتتاح صنفَ الأرصدة الافتتاحية.
    const serviceId = (await owner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `خدمة القوائم ${suffix}`, price: 10 }).expect(201)).body.id as string;
    const sale = async (as: Auth, hours: number): Promise<string> =>
      (
        await as(http().post('/pos/sales/sync'))
          .send({ clientSaleId: randomUUID(), ringAt: ringAt(hours), ringOffsetMin: 180, lines: [{ productId: serviceId, quantity: 1 }], paymentMethod: 'CASH' })
          .expect(201)
      ).body.id;
    await restricted(http().post('/pos/shifts')).send({ openingFloat: 0, branchId: branchA }).expect(201);
    await owner(http().post('/pos/shifts')).send({ openingFloat: 0, branchId: branchB }).expect(201);
    const saleA = await sale(restricted, 0);
    const saleB = await sale(owner, 6);
    const incidentOf = async (invoiceId: string): Promise<string> =>
      ((await owner(http().get('/invoices')).expect(200)).body as { id: string; offlineIncidentId?: string | null }[]).find((i) => i.id === invoiceId)?.offlineIncidentId ?? '';
    ids.incidentA = await incidentOf(saleA);
    ids.incidentB = await incidentOf(saleB);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.7] 🔴 ① مستنداتُ التوزيع المفتوحة: فاتورةُ فرعه وفاتورةُ المنشأة تُريان، وفاتورةُ الفرع الآخر لا — وكذلك المشترياتُ والدفعاتُ المقدَّمة', async () => {
    const seen = async (as: Auth) => ({
      invoices: idsOf((await as(http().get(`/payments/open-invoices/${customerId}`)).expect(200)).body),
      purchases: idsOf((await as(http().get(`/supplier-payments/open-purchases/${supplierId}`)).expect(200)).body),
      prepayments: idsOf((await as(http().get(`/invoices/open-prepayments/${customerId}`)).expect(200)).body),
    });
    const mine = await seen(restricted);
    const all = await seen(owner);
    expect({
      mine: {
        invoiceA: mine.invoices.includes(ids.invoiceA),
        invoiceCompany: mine.invoices.includes(ids.invoiceCompany),
        invoiceB: mine.invoices.includes(ids.invoiceB),
        purchaseA: mine.purchases.includes(ids.purchaseA),
        purchaseB: mine.purchases.includes(ids.purchaseB),
        prepaymentA: mine.prepayments.includes(ids.prepaymentA),
        prepaymentB: mine.prepayments.includes(ids.prepaymentB),
      },
      all: { invoiceB: all.invoices.includes(ids.invoiceB), purchaseB: all.purchases.includes(ids.purchaseB), prepaymentB: all.prepayments.includes(ids.prepaymentB) },
    }).toEqual({
      mine: { invoiceA: true, invoiceCompany: true, invoiceB: false, purchaseA: true, purchaseB: false, prepaymentA: true, prepaymentB: false },
      all: { invoiceB: true, purchaseB: true, prepaymentB: true },
    });
  });

  it('[SPEC 2.7] 🔴 ② تخصيصُ سندِ فرعه على مستندِ فرعٍ آخر: يرى مبلغَ التخصيص ولا يرى رقمَ المستند ولا مبلغَه — والمالكُ يراهما', async () => {
    type Allocation = { amount: string; invoice?: { id: string; no?: string; total?: string }; purchase?: { id: string; no?: string; total?: string } };
    const payment = (await restricted(http().get(`/payments/${ids.paymentA}`)).expect(200)).body as { allocations: Allocation[]; allocatedTotal: string };
    const supplierPayment = (await restricted(http().get(`/supplier-payments/${ids.supplierPaymentA}`)).expect(200)).body as { allocations: Allocation[]; allocatedTotal: string };
    const ownerPayment = (await owner(http().get(`/payments/${ids.paymentA}`)).expect(200)).body as { allocations: Allocation[] };
    const docOf = (a: Allocation) => a.invoice ?? a.purchase;
    const shape = (allocs: Allocation[], otherId: string) => {
      const other = allocs.find((a) => docOf(a)?.id === otherId);
      // مبلغُ التخصيص يصل `Decimal` بلا خانتين ("20")، فيُقارَن رقماً.
      return { amount: other ? Number(other.amount) : null, no: other ? 'no' in docOf(other)! : null, total: other ? 'total' in docOf(other)! : null };
    };
    expect({
      payment: { ...shape(payment.allocations, ids.invoiceB), allocatedTotal: payment.allocatedTotal },
      supplierPayment: { ...shape(supplierPayment.allocations, ids.purchaseB), allocatedTotal: supplierPayment.allocatedTotal },
      owner: shape(ownerPayment.allocations, ids.invoiceB),
    }).toEqual({
      payment: { amount: 20, no: false, total: false, allocatedTotal: '30.00' },
      supplierPayment: { amount: 10, no: false, total: false, allocatedTotal: '15.00' },
      owner: { amount: 20, no: true, total: true },
    });
  });

  it('[SPEC 2.7] 🔴 ③ وكتابتُها: تخصيصُ سندِ فرعه على فاتورة فرعٍ آخر يُرفض، وعلى فاتورة فرعه يمضي', async () => {
    // على الحساب لتوزيعٍ لاحق: تغطّيه فواتيرُ العميل المفتوحة (`ON_ACCOUNT`).
    const payment = (await restricted(http().post('/payments')).send({ customerId, branchId: branchA, date: today, amount: 5, method: 'CASH', unallocated: 'ON_ACCOUNT' }).expect(201)).body.id;
    const other = await restricted(http().post(`/payments/${payment}/allocate`)).send({ allocations: [{ invoiceId: ids.invoiceB2, amount: 5 }] });
    const own = await restricted(http().post(`/payments/${payment}/allocate`)).send({ allocations: [{ invoiceId: ids.invoiceA, amount: 5 }] });
    expect({ other: other.status, own: own.status }).toEqual({ other: 404, own: 201 });
  });

  // ⚠️ **وقائمةُ المستودعات خارجُ هذا الطلب، معروضةٌ على صاحب المشروع**: منها تختار حركةُ التحويل مستودعَ الوجهة، فترشيحُها
  // يمنع المقيَّدَ تحويلاً إلى فرعٍ آخر (والنقلُ بين الفروع مدعومٌ، `CLAUDE.md §6.8`) — قرارُ سلوكٍ لا خطأ (القاعدة ٣٧). ومستودعا
  // الفرعين يبقيان هنا لتمييز سطرَي الافتتاح.
  it('[SPEC 2.7] 🔴 ④ تقريرُ الأرصدة الافتتاحية: سطرُ مستودع فرعه يُرى ومجموعُه مجموعُه، وسطرُ مستودع الفرع الآخر لا', async () => {
    type Report = { items: { lines: { warehouseId: string }[] }[]; totals: { lines: number; baseAmount: number } };
    const openingMine = (await restricted(http().get('/inventory/opening')).expect(200)).body as Report;
    const openingAll = (await owner(http().get('/inventory/opening')).expect(200)).body as Report;
    const lineWarehouses = (r: Report) => r.items.flatMap((i) => i.lines.map((l) => l.warehouseId));
    expect({
      openingMine: { a: lineWarehouses(openingMine).includes(warehouseA), b: lineWarehouses(openingMine).includes(warehouseB), totals: openingMine.totals.lines, amount: openingMine.totals.baseAmount },
      openingAll: { b: lineWarehouses(openingAll).includes(warehouseB), totals: openingAll.totals.lines, amount: openingAll.totals.baseAmount },
    }).toEqual({
      openingMine: { a: true, b: false, totals: 1, amount: 3 },
      openingAll: { b: true, totals: 2, amount: 10 },
    });
  });

  it('[SPEC 2.7] 🔴 ⑤ وقائعُ انقطاع الكاشير: وقعةُ فرعه تُرى ووقعةُ الفرع الآخر لا', async () => {
    const mine = idsOf((await restricted(http().get('/pos/incidents')).expect(200)).body);
    const all = idsOf((await owner(http().get('/pos/incidents')).expect(200)).body);
    expect({ incidentsFound: Boolean(ids.incidentA && ids.incidentB && ids.incidentA !== ids.incidentB), mineA: mine.includes(ids.incidentA), mineB: mine.includes(ids.incidentB), allB: all.includes(ids.incidentB) }).toEqual({
      incidentsFound: true,
      mineA: true,
      mineB: false,
      allB: true,
    });
  });
});
