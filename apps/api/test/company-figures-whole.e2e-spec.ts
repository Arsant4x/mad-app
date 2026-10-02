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
 * ⚖️ **أرقامُ المنشأة كلِّها تُرفض للموظّف المقيَّد بفرع** (توجيه ٢٧٥ · `ق-١٥٨١`، بحكم صاحب المشروع): «**الأرقامُ المجمَّعة
 * على مستوى المنشأة (أرصدةُ الحسابات وملخّصُها · الإقرار · ملخّصاتُ العميل والمورّد · ما لم يُبلَّغ للهيئة · سجلُّ التدقيق)
 * تُرفض للمقيَّد كالقوائم المالية**».
 *
 * وصل كلُّها في مسح توجيه ٢٧٤ (الكتلة ٥ج): موظّفٌ مقيَّدٌ بفرعٍ يقرأها كاملةً بعلامة «على مستوى المنشأة بحقّها» أو `@TenantWide`.
 * والحكمُ نوعان: **مسارٌ رقمُه رقمُ المنشأة** يُرفض كلُّه (403 يسمّي السبب)، **وقائمةٌ يحتاجها المقيَّد** (دليلُ الحسابات في
 * منتقيات القيد · أسطرُ قيود فرعه · قائمةُ العملاء) تبقى، ويسقط منها الرقمُ وحدَه: رصيدُ الحساب وذمّةُ العميل.
 *
 * ولكلِّ رفضٍ ضابطان موجبان: المالكُ يقرأ المسارَ نفسَه 200، **وموظّفٌ يرى الفروعَ كلَّها** (`allBranches`) يقرؤه 200 —
 * فالرفضُ للفروع لا لكونه موظّفاً.
 */
describe('أرقامُ المنشأة كلِّها تُرفض للموظّف المقيَّد بفرع (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const year = new Date().getUTCFullYear();
  const http = () => request(app.getHttpServer());
  type Auth = (r: request.Test) => request.Test;
  const bearer = (token: string): Auth => (r) => r.set('Authorization', `Bearer ${token}`);
  let owner: Auth;
  let restricted: Auth;
  let wholeCompany: Auth;
  let customerId: string;
  let supplierId: string;

  /**
   * المساراتُ التي رقمُها رقمُ المنشأة — بأسمائها كما تقرؤها الواجهة. و`readerStatus` ما يردّه المسارُ لمن يرى الفروعَ كلَّها:
   * 200 إلا تسويةَ النسبة، فهي 404 مسمّى ما لم تُعلن نسبةُ السنة (`vat_ratio_not_declared`) — والمقيسُ أنها ليست 403.
   */
  const companyFigureReads = (): { name: string; path: string; readerStatus?: number }[] => [
    { name: 'ملخّصُ الحسابات', path: '/accounts/summary' },
    { name: 'إقرارُ الضريبة', path: `/obligations/vat-declaration?year=${year}&quarter=1` },
    { name: 'نسبةُ الخصم', path: `/obligations/vat-ratio?year=${year}` },
    { name: 'تسويةُ النسبة', path: `/obligations/vat-ratio/settlement?year=${year}`, readerStatus: 404 },
    { name: 'إقفالاتُ الإقرار', path: `/obligations/vat-declaration/closings?year=${year}` },
    { name: 'ما لم يُبلَّغ للهيئة', path: '/zatca/unreported' },
    { name: 'ملخّصُ العميل', path: `/customers/${customerId}/summary` },
    { name: 'ملخّصُ المورّد', path: `/suppliers/${supplierId}/summary` },
    { name: 'سجلُّ التدقيق', path: '/audit-log' },
    { name: 'مطابقةُ الاستلام', path: '/purchases/receipts/reconciliation' },
    { name: 'تقريرُ التأسيس', path: '/purchases/incorporation-report' },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'company-figures');
    owner = bearer(company.token);
    const branchA = (await owner(http().post('/branches')).send({ name: `فرع أ ${suffix}`, type: 'فرع' }).expect(201)).body.id as string;

    customerId = await createTenantCustomer(app, company.token, `عميل الأرقام ${suffix}`);
    supplierId = (await owner(http().post('/suppliers')).send({ name: `مورد الأرقام ${suffix}` }).expect(201)).body.id as string;
    const today = new Date().toISOString().slice(0, 10);
    // فاتورةٌ في فرع أ تُحرّك الحساباتِ وذمّةَ العميل، فللرقم المرفوض قيمةٌ غيرُ الصفر.
    await owner(http().post('/invoices'))
      .send({ customerId, branchId: branchA, issueDate: today, dueDate: today, lines: [{ description: `بيع ${suffix}`, quantity: 1, unitPrice: 100, taxCategory: 'S' }] })
      .expect(201);

    // قالبٌ بشاشات المسارات كلِّها وأفعالها كلِّها — فالرفضُ المقيس لا يأتي من القالب.
    const template = (
      await owner(http().post('/templates'))
        .send({ name: `الأرقام ${suffix}`, allowedScreens: ['dashboard', 'accounts', 'journal', 'obligations', 'customers', 'suppliers', 'audit', 'reports', 'invoice'] })
        .expect(201)
    ).body.id as string;
    const login = async (username: string, extra: Record<string, unknown>): Promise<Auth> => {
      await owner(http().post('/company-users')).send({ name: username, username, password: 'FiguresPass123!', permissionTemplateId: template, ...extra }).expect(201);
      return bearer((await http().post('/auth/login').send({ username, password: 'FiguresPass123!' }).expect(200)).body.accessToken);
    };
    restricted = await login(`figures-north-${suffix}`, { branchIds: [branchA] });
    wholeCompany = await login(`figures-all-${suffix}`, { allBranches: true });
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.7] 🔴 ① كلُّ مسارٍ رقمُه رقمُ المنشأة يُرفض للمقيَّد 403 مسمّى السبب، ويُقرأ للمالك ولمن يرى الفروعَ كلَّها 200', async () => {
    const seen: Record<string, { restricted: number; restrictedNamed: boolean; owner: number; wholeCompany: number }> = {};
    for (const { name, path } of companyFigureReads()) {
      const refused = await restricted(http().get(path));
      seen[name] = {
        restricted: refused.status,
        restrictedNamed: String(refused.body.message).includes('فروعَها كلَّها'),
        owner: (await owner(http().get(path))).status,
        wholeCompany: (await wholeCompany(http().get(path))).status,
      };
    }
    const expected = Object.fromEntries(
      companyFigureReads().map(({ name, readerStatus = 200 }) => [name, { restricted: 403, restrictedNamed: true, owner: readerStatus, wholeCompany: readerStatus }]),
    );
    expect(seen).toEqual(expected);
  });

  it('[SPEC 2.7] 🔴 ② والكتابةُ على إقرار المنشأة تُرفض للمقيَّد كقراءته: «قُدِّم» وإعلانُ النسبة والإقفال', async () => {
    const filed = await restricted(http().post('/obligations/vat-declaration/filed')).send({ year, quarter: 1 });
    const ratio = await restricted(http().post('/obligations/vat-ratio')).send({ year, ratio: 50 });
    const close = await restricted(http().post('/obligations/vat-declaration/closings')).send({ year, quarter: 1 });
    expect({ filed: filed.status, ratio: ratio.status, close: close.status }).toEqual({ filed: 403, ratio: 403, close: 403 });
  });

  it('[SPEC 2.7] 🔴 ③ القوائمُ تبقى للمقيَّد ويسقط منها رقمُ المنشأة: رصيدُ الحساب في الدليل وفي أسطر القيود، وذمّةُ العميل', async () => {
    const hasKey = (rows: unknown[], key: string) => rows.some((r) => key in (r as object));
    const rowsOf = (body: unknown): unknown[] => (Array.isArray(body) ? body : (body as { items: unknown[] }).items);
    const accountsMine = rowsOf((await restricted(http().get('/accounts')).expect(200)).body);
    const accountsAll = rowsOf((await owner(http().get('/accounts')).expect(200)).body);
    const journalMine = rowsOf((await restricted(http().get('/journal')).expect(200)).body) as { lines: { account: object }[] }[];
    const journalAll = rowsOf((await owner(http().get('/journal')).expect(200)).body) as { lines: { account: object }[] }[];
    const customersMine = rowsOf((await restricted(http().get('/customers')).expect(200)).body);
    const customersAll = rowsOf((await owner(http().get('/customers')).expect(200)).body);
    const lineAccounts = (entries: { lines: { account: object }[] }[]) => entries.flatMap((e) => e.lines.map((l) => l.account));
    expect({
      accountsMine: { rows: accountsMine.length > 0, balance: hasKey(accountsMine, 'balance'), openingBalance: hasKey(accountsMine, 'openingBalance') },
      accountsAll: { balance: hasKey(accountsAll, 'balance') },
      journalMine: { lines: lineAccounts(journalMine).length > 0, balance: hasKey(lineAccounts(journalMine), 'balance') },
      journalAll: { balance: hasKey(lineAccounts(journalAll), 'balance') },
      customersMine: { rows: customersMine.length > 0, outstanding: hasKey(customersMine, 'outstanding') },
      customersAll: { outstanding: hasKey(customersAll, 'outstanding') },
    }).toEqual({
      accountsMine: { rows: true, balance: false, openingBalance: false },
      accountsAll: { balance: true },
      journalMine: { lines: true, balance: false },
      journalAll: { balance: true },
      customersMine: { rows: true, outstanding: false },
      customersAll: { outstanding: true },
    });
  });
});
