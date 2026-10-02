import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ميزانية الحزمة (ق-١٢٨٥): لم تُقَس بعد، فتُعلن بسقفٍ واسع ثم تُضبط على ثلاثة أضعاف أوّل زمنٍ مقيس.
jest.setTimeout(180000);

/**
 * لوحة التحكم لموظفٍ مقيَّدٍ بفرع: لا رقمَ من فرعٍ آخر (إثبات احتمال لوحة التحكم، my-decisions-v2 §٧).
 *
 * الصفحة (apps/web/src/pages/DashboardPage.tsx:35-43) تنادي نقطتين: GET /reports/dashboard (شاشة reports)
 * وGET /invoices بلا بحث (شاشة invoice). والحكم المقبول لكلٍّ منهما واحدٌ من اثنين: 403 كالقوائم المالية
 * (ق-١٤٥٢)، أو أرقام فروع القارئ وحدها كملخّص الفرع.
 *
 * المتوقَّع على main (44128d1a) قراءةً لا تشغيلاً: ① ② ③ ④ خضر، و⑤ ⑥ ⑦ ⑧ حمر:
 *   الإيراد والمصروف والسلسلة من الدفتر كلّه (reports.service.ts:693 و708) بلا assertWholeCompanyReader؛
 *   والذمم يُمحى مرشّحُ فرعها لأن OR في NOT_REPLACED_REJECTED يدهس OR في branchFilter (receivables-exposure.util.ts:159)؛
 *   والبحث في الفواتير يدهس المرشّح بالطريقة نفسها (invoices.service.ts:181 و183).
 *
 * الأرقام: فرع أ بيعٌ 100 بفئة S (115 بالضريبة) وشراءٌ معفى 40 · فرع ب بيعٌ 7,000 (8,050) وشراءٌ معفى 3,000.
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

describe('لوحة التحكم لموظفٍ مقيَّدٍ بفرع: لا رقم من فرعٍ آخر (e2e)', () => {
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
  let invoiceA: string;
  let invoiceB: string;

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
    invoiceA = await sale(branchA, 100);
    invoiceB = await sale(branchB, 7000);
    await owner(http().post('/purchases')).send({ supplierId, branchId: branchA, date: today, subtotal: 40, exempt: true }).expect(201);
    await owner(http().post('/purchases')).send({ supplierId, branchId: branchB, date: today, subtotal: 3000, exempt: true }).expect(201);

    const template = async (label: string, allowedScreens: string[]): Promise<string> =>
      (await owner(http().post('/templates')).send({ name: `${label} ${suffix}`, allowedScreens }).expect(201)).body.id;
    const employeeOfBranchA = async (username: string, permissionTemplateId: string): Promise<string> => {
      await owner(http().post('/company-users')).send({ name: username, username, password: PASSWORD, permissionTemplateId, branchIds: [branchA] }).expect(201);
      return (await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200)).body.accessToken;
    };
    dashboardOnly = bearer(await employeeOfBranchA(`dash-only-${suffix}`, await template('اللوحة وحدها', ['dashboard'])));
    restricted = bearer(await employeeOfBranchA(`dash-reports-${suffix}`, await template('اللوحة والتقارير والفواتير', ['dashboard', 'reports', 'invoice'])));
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① ضابطٌ موجب: المالك يرى الفرعين، فالمسبار يرى أرقام فرع ب حين تكون مرئية', async () => {
    const d = (await owner(http().get('/reports/dashboard')).query({ to: today }).expect(200)).body as Dash;
    expect({ revenue: d.revenue, expenses: d.expenses, netProfit: d.netProfit, receivables: d.receivables, monthlyTotal: monthlyTotal(d) }).toEqual({
      revenue: '7100.00',
      expenses: '3040.00',
      netProfit: '4060.00',
      receivables: '8165.00',
      monthlyTotal: 710000,
    });
  });

  it('② ضابطٌ على القيد: الموظف مقيَّدٌ فعلاً، فالمركز المالي 403، وملخّص الفرع والأعمار بفرعٍ مسمّى بأرقام فرع أ وحده', async () => {
    const sheet = await restricted(http().get('/reports/balance-sheet'));
    const summary = (await restricted(http().get('/reports/branch-summary')).expect(200)).body as { consolidated: { revenue: string; expenses: string } };
    const agingNamed = (await restricted(http().get('/reports/receivables-aging')).query({ branchId: branchA }).expect(200)).body as { totals: { total: string } };
    expect({ sheet: sheet.status, revenue: summary.consolidated.revenue, expenses: summary.consolidated.expenses, agingNamed: agingNamed.totals.total }).toEqual({
      sheet: 403,
      revenue: '100.00',
      expenses: '40.00',
      agingNamed: '115.00',
    });
  });

  it('③ قالب «لوحة التحكم» وحده: نقطتا الصفحة كلتاهما 403 SCREEN_FORBIDDEN، فلا رقم يتسرّب', async () => {
    const dash = await dashboardOnly(http().get('/reports/dashboard'));
    const list = await dashboardOnly(http().get('/invoices'));
    expect({ dash: dash.status, dashCode: dash.body.code, list: list.status, listCode: list.body.code }).toEqual({
      dash: 403,
      dashCode: 'SCREEN_FORBIDDEN',
      list: 403,
      listCode: 'SCREEN_FORBIDDEN',
    });
  });

  it('④ أحدث الفواتير GET /invoices بلا بحث (كما تناديها الصفحة): فاتورة أ حاضرة وفاتورة ب غائبة', async () => {
    const ids = idsOf((await restricted(http().get('/invoices')).expect(200)).body);
    expect({ a: ids.includes(invoiceA), b: ids.includes(invoiceB) }).toEqual({ a: true, b: false });
  });

  it('⑤ الذمم في GET /reports/dashboard: 115.00 لفرع أ وحده، أو 403', async () => {
    const res = await restricted(http().get('/reports/dashboard')).query({ to: today });
    const seen = res.status === 200 ? { status: 200, receivables: (res.body as Dash).receivables } : { status: res.status };
    expect([{ status: 200, receivables: '115.00' }, { status: 403 }]).toContainEqual(seen);
  });

  it('⑥ الإيراد والمصروف والصافي والسلسلة الشهرية في GET /reports/dashboard: أرقام فرع أ وحده، أو 403', async () => {
    const res = await restricted(http().get('/reports/dashboard')).query({ to: today });
    const d = res.body as Dash;
    const seen =
      res.status === 200
        ? { status: 200, revenue: d.revenue, expenses: d.expenses, netProfit: d.netProfit, monthlyTotal: monthlyTotal(d) }
        : { status: res.status };
    expect([{ status: 200, revenue: '100.00', expenses: '40.00', netProfit: '60.00', monthlyTotal: 10000 }, { status: 403 }]).toContainEqual(seen);
  });

  it('⑦ الجذر نفسه في أعمار الذمم بلا فرعٍ مسمّى: إجماليّ القارئ المقيَّد 115.00 لا 8165.00', async () => {
    const aging = (await restricted(http().get('/reports/receivables-aging')).expect(200)).body as { totals: { total: string } };
    expect(aging.totals.total).toBe('115.00');
  });

  it('⑧ العائلة نفسها في البحث: GET /invoices?search= يُبقي فاتورة ب غائبة', async () => {
    const ids = idsOf((await restricted(http().get('/invoices')).query({ search: suffix }).expect(200)).body);
    expect({ a: ids.includes(invoiceA), b: ids.includes(invoiceB) }).toEqual({ a: true, b: false });
  });
});