import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(180000);

/**
 * **موظّفٌ مقيَّدٌ بفرعٍ لا يرى رقماً من فرعٍ آخر: لا في لوحة التحكّم ولا في البحث** (توجيه ٢٧٤ الكتلة ٥ · مراجعة 3.3 ج-1 وج-2).
 *
 * جذران ثبتا بالتشغيل على `main` قبل الإصلاح (الكتلة ٢هـ):
 *
 * ① **لوحةُ التحكّم قائمةُ دخلٍ بلا حارس**: إيرادُها ومصروفُها وسلسلتُها من الدفتر كلِّه (`reports.service.ts`
 *    `dashboard`)، والقوائمُ المالية تُرفض لمن لا يرى الفروعَ كلَّها (`ق-١٤٥٢`). ومثلُها ميزانُ المراجعة بلا فرعٍ مسمّى.
 * ② **مرشِّحُ الفرع يُمحى حين يجتمع مع «أو» آخر**: `branchFilter` المقيَّدُ مفتاحُه `OR`، فإن نُشر في الكائن نفسِه مع
 *    `OR` البحث أو `NOT_REPLACED_REJECTED` حلّ الثاني محلّه **فعادت صفوفُ الفروع كلِّها**: البحثُ في الفواتير والسندات
 *    وسندات الصرف والعروض والشطب، وأعمارُ الذمم بلا فرعٍ مسمّى (فتصل اللوحةَ ذممُ المنشأة كلِّها).
 *
 * والحكمُ لكلِّ قراءةٍ واحد: **أرقامُ فرع القارئ وحدَه، أو رفضٌ يدلّه على ملخّص الفرع**. وكلُّ حالةٍ سالبة لها
 * ضابطٌ موجب: المالكُ يرى فرعَ ب بالمسبار نفسِه، فغيابُه عند المقيَّد حكمٌ لا عمى.
 *
 * الأرقام: فرع أ بيعٌ 100 بفئة S (115 بالضريبة) قُبض منه 15، وشراءٌ معفى 40 سُدّد منه 10 · فرع ب بيعٌ 7,000 (8,050)
 * قُبض منه 50، وشراءٌ معفى 3,000 سُدّد منه 100.
 */
interface Dash {
  revenue: string;
  expenses: string;
  netProfit: string;
  receivables: string;
  monthly: { month: string; revenue: string }[];
}
type Auth = (r: request.Test) => request.Test;

const halalas = (amount: string): number => Math.round(Number(amount) * 100);
const monthlyTotal = (d: Dash): number => d.monthly.reduce((s, m) => s + halalas(m.revenue), 0);
const idsOf = (body: unknown): string[] => ((Array.isArray(body) ? body : (body as { items: unknown[] }).items) as { id: string }[]).map((i) => i.id);
const PASSWORD = 'DashScope123!';
const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;

describe('موظّفٌ مقيَّدٌ بفرع: لا رقم من فرعٍ آخر في لوحة التحكّم ولا في البحث (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const bearer = (token: string): Auth => (r) => r.set('Authorization', `Bearer ${token}`);
  let owner: Auth;
  let dashboardOnly: Auth;
  let restricted: Auth;
  let branchA: string;
  let branchB: string;
  /** لكلِّ قائمةٍ تُبحث: مسارُها ومعرّفا صفَّي الفرعين. */
  const rows: Record<string, { route: string; a: string; b: string }> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'dash-scope');
    owner = bearer(company.token);

    branchA = (await owner(http().post('/branches')).send({ name: `فرع أ ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    branchB = (await owner(http().post('/branches')).send({ name: `فرع ب ${suffix}`, type: 'فرع' }).expect(201)).body.id;

    const customerId = await createTenantCustomer(app, company.token, `عميل اللوحة ${suffix}`);
    const supplierId = (await owner(http().post('/suppliers')).send({ name: `مورد اللوحة ${suffix}` }).expect(201)).body.id as string;
    const sale = async (branchId: string, unitPrice: number): Promise<string> =>
      (
        await owner(http().post('/invoices'))
          .send({ customerId, branchId, issueDate: today, dueDate: today, lines: [{ description: `بيع ${suffix}`, quantity: 1, unitPrice, taxCategory: 'S' }] })
          .expect(201)
      ).body.id;
    const purchase = async (branchId: string, subtotal: number): Promise<string> =>
      (await owner(http().post('/purchases')).send({ supplierId, branchId, date: today, subtotal, exempt: true }).expect(201)).body.id;
    const receipt = async (branchId: string, invoiceId: string, amount: number): Promise<string> =>
      (await owner(http().post('/payments')).send({ customerId, branchId, date: today, amount, method: 'CASH', allocations: [{ invoiceId, amount }] }).expect(201)).body.id;
    const disbursement = async (branchId: string, purchaseId: string, amount: number): Promise<string> =>
      (await owner(http().post('/supplier-payments')).send({ supplierId, branchId, date: today, amount, method: 'CASH', allocations: [{ purchaseId, amount }] }).expect(201)).body.id;
    const quote = async (branchId: string): Promise<string> =>
      (
        await owner(http().post('/quotes'))
          .send({ customerId, branchId, issueDate: today, validUntil: today, lines: [{ description: `عرض ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }] })
          .expect(201)
      ).body.id;

    const invoiceA = await sale(branchA, 100);
    const invoiceB = await sale(branchB, 7000);
    const purchaseA = await purchase(branchA, 40);
    const purchaseB = await purchase(branchB, 3000);
    rows.invoices = { route: '/invoices', a: invoiceA, b: invoiceB };
    rows.payments = { route: '/payments', a: await receipt(branchA, invoiceA, 15), b: await receipt(branchB, invoiceB, 50) };
    rows.supplierPayments = { route: '/supplier-payments', a: await disbursement(branchA, purchaseA, 10), b: await disbursement(branchB, purchaseB, 100) };
    rows.quotes = { route: '/quotes', a: await quote(branchA), b: await quote(branchB) };

    const productId = (await owner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف اللوحة ${suffix}`, price: 10 }).expect(201)).body.id as string;
    const warehouseId = (await owner(http().post('/warehouses')).send({ name: `مستودع اللوحة ${suffix}` }).expect(201)).body.id as string;
    const writeOff = async (branchId: string): Promise<string> =>
      (
        await owner(http().post('/inventory/write-offs'))
          .send({ productId, warehouseId, branchId, qty: 1, reasonCode: NO_ADJUSTMENT.code, occurredAt: today, note: `تلف ${suffix}` })
          .expect(201)
      ).body.id;
    rows.writeOffs = { route: '/inventory/write-offs', a: await writeOff(branchA), b: await writeOff(branchB) };

    // ونظائرُ `searchWhere` الأربعة (مسحُ النظائر): الموظّفون والأدراجُ والبنوكُ ومناوباتُ الكاشير.
    const employee = async (branchId: string): Promise<string> =>
      (await owner(http().post('/employees')).send({ fullName: `موظف اللوحة ${suffix}`, hireDate: '2024-01-01', branchId }).expect(201)).body.id;
    const drawer = async (branchId: string): Promise<string> => (await owner(http().post('/cash-drawers')).send({ name: `درج اللوحة ${suffix}`, branchId }).expect(201)).body.id;
    const bank = async (branchId: string): Promise<string> =>
      (await owner(http().post('/banks')).send({ name: `بنك اللوحة ${suffix}`, kind: 'BANK_ACCOUNT', branchId }).expect(201)).body.id;
    rows.employees = { route: '/employees', a: await employee(branchA), b: await employee(branchB) };
    rows.cashDrawers = { route: '/cash-drawers', a: await drawer(branchA), b: await drawer(branchB) };
    rows.banks = { route: '/banks', a: await bank(branchA), b: await bank(branchB) };

    const template = async (label: string, allowedScreens: string[]): Promise<string> =>
      (await owner(http().post('/templates')).send({ name: `${label} ${suffix}`, allowedScreens }).expect(201)).body.id;
    const employeeOf = async (branchId: string, username: string, permissionTemplateId: string): Promise<string> => {
      await owner(http().post('/company-users')).send({ name: username, username, password: PASSWORD, permissionTemplateId, branchIds: [branchId] }).expect(201);
      return (await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200)).body.accessToken;
    };
    dashboardOnly = bearer(await employeeOf(branchA, `dash-only-${suffix}`, await template('اللوحة وحدها', ['dashboard'])));
    restricted = bearer(
      await employeeOf(
        branchA,
        `dash-reports-${suffix}`,
        await template('اللوحة والتقارير والمستندات', ['dashboard', 'reports', 'invoice', 'payments', 'suppliers', 'quotes', 'inventory', 'employees', 'banks', 'pos']),
      ),
    );
    // مناوبتان باسمَين يحملان اللاحقة: المقيَّدُ في فرع أ، وكاشيرُ فرع ب في فرعه — فالبحثُ باللاحقة يُصيب الاثنتين.
    const cashierB = bearer(await employeeOf(branchB, `dash-cashier-b-${suffix}`, await template('الكاشير', ['pos'])));
    const shift = async (as: Auth, branchId: string): Promise<string> => (await as(http().post('/pos/shifts')).send({ openingFloat: 0, branchId }).expect(201)).body.id;
    rows.posShifts = { route: '/pos/shifts', a: await shift(restricted, branchA), b: await shift(cashierB, branchB) };
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.7] ① ضابطٌ موجب: المالك يرى الفرعين في اللوحة، فالمسبار يرى أرقام فرع ب حين تكون مرئية', async () => {
    const d = (await owner(http().get('/reports/dashboard')).query({ to: today }).expect(200)).body as Dash;
    expect({ revenue: d.revenue, expenses: d.expenses, netProfit: d.netProfit, receivables: d.receivables, monthlyTotal: monthlyTotal(d) }).toEqual({
      revenue: '7100.00',
      expenses: '3040.00',
      netProfit: '4060.00',
      receivables: '8100.00',
      monthlyTotal: 710000,
    });
  });

  it('[SPEC 2.7] ② ضابطٌ على القيد: الموظف مقيَّدٌ فعلاً، فالمركز المالي 403، وملخّص الفرع والأعمار بفرعٍ مسمّى بأرقام فرع أ وحده', async () => {
    const sheet = await restricted(http().get('/reports/balance-sheet'));
    const summary = (await restricted(http().get('/reports/branch-summary')).expect(200)).body as { consolidated: { revenue: string; expenses: string } };
    const agingNamed = (await restricted(http().get('/reports/receivables-aging')).query({ branchId: branchA }).expect(200)).body as { totals: { total: string } };
    expect({ sheet: sheet.status, revenue: summary.consolidated.revenue, expenses: summary.consolidated.expenses, agingNamed: agingNamed.totals.total }).toEqual({
      sheet: 403,
      revenue: '100.00',
      expenses: '40.00',
      agingNamed: '100.00',
    });
  });

  it('[SPEC 2.7] ③ قالب «لوحة التحكم» وحده: نقطتا الصفحة كلتاهما 403 SCREEN_FORBIDDEN، فلا رقم يتسرّب', async () => {
    const dash = await dashboardOnly(http().get('/reports/dashboard'));
    const list = await dashboardOnly(http().get('/invoices'));
    expect({ dash: dash.status, dashCode: dash.body.code, list: list.status, listCode: list.body.code }).toEqual({
      dash: 403,
      dashCode: 'SCREEN_FORBIDDEN',
      list: 403,
      listCode: 'SCREEN_FORBIDDEN',
    });
  });

  it('[SPEC 2.7] ④ القوائم بلا بحث (ضابط): صفّ فرع أ حاضر وصفّ فرع ب غائب في كلٍّ منها', async () => {
    const seen: Record<string, { a: boolean; b: boolean }> = {};
    for (const [name, r] of Object.entries(rows)) {
      const ids = idsOf((await restricted(http().get(r.route)).expect(200)).body);
      seen[name] = { a: ids.includes(r.a), b: ids.includes(r.b) };
    }
    const expected = Object.fromEntries(Object.keys(rows).map((name) => [name, { a: true, b: false }]));
    expect(seen).toEqual(expected);
  });

  it('[SPEC 2.7] 🔴 ⑤ لوحة التحكم وميزان المراجعة بلا فرعٍ مسمّى: 403 يدلّ على ملخّص الفرع، والميزانُ بفرع القارئ مسمّىً يبقى 200', async () => {
    const dash = await restricted(http().get('/reports/dashboard')).query({ to: today });
    const trial = await restricted(http().get('/reports/trial-balance'));
    const trialNamed = await restricted(http().get('/reports/trial-balance')).query({ branchId: branchA });
    expect({
      dash: dash.status,
      dashPointsToSummary: String(dash.body.message).includes('ملخّص الفرع'),
      trial: trial.status,
      trialPointsToSummary: String(trial.body.message).includes('ملخّص الفرع'),
      trialNamed: trialNamed.status,
    }).toEqual({ dash: 403, dashPointsToSummary: true, trial: 403, trialPointsToSummary: true, trialNamed: 200 });
  });

  it('[SPEC 2.7] 🔴 ⑥ أعمار الذمم بلا فرعٍ مسمّى: إجماليّ القارئ المقيَّد 100.00 لا 8100.00', async () => {
    const aging = (await restricted(http().get('/reports/receivables-aging')).expect(200)).body as { totals: { total: string } };
    expect(aging.totals.total).toBe('100.00');
  });

  it('[SPEC 2.7] 🔴 ⑦ البحث لا يمحو مرشّح الفرع: المالكُ يجد الصفّين بالكلمة نفسِها، والمقيَّدُ يجد صفّ فرعه وحدَه', async () => {
    const ownerSees: Record<string, { a: boolean; b: boolean }> = {};
    const restrictedSees: Record<string, { a: boolean; b: boolean }> = {};
    for (const [name, r] of Object.entries(rows)) {
      const all = idsOf((await owner(http().get(r.route)).query({ search: suffix }).expect(200)).body);
      const mine = idsOf((await restricted(http().get(r.route)).query({ search: suffix }).expect(200)).body);
      ownerSees[name] = { a: all.includes(r.a), b: all.includes(r.b) };
      restrictedSees[name] = { a: mine.includes(r.a), b: mine.includes(r.b) };
    }
    const both = Object.fromEntries(Object.keys(rows).map((name) => [name, { a: true, b: true }]));
    const onlyA = Object.fromEntries(Object.keys(rows).map((name) => [name, { a: true, b: false }]));
    expect({ owner: ownerSees, restricted: restrictedSees }).toEqual({ owner: both, restricted: onlyA });
  });
});
