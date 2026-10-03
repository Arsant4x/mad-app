import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (9.3 ث محلّياً) دون الحدّ الأدنى، فالحدُّ الأدنى.
jest.setTimeout(30000);

/**
 * ⚖️ **قائمةُ التدفّقات النقدية من كلِّ حساب** (توجيه ٢٧٨ · القاعدة ٣٧) — كانت تقرأ ستّةَ حساباتٍ مسرودة، فيخرج رقمُها خاطئاً كلّما
 * تحرّك غيرُها. سنةٌ مستقبلية (`2088`) لمنشأةٍ معزولة فلا يدخل الفترةَ إلا ما صنعته الحزمة، والجوابُ محسوبٌ يداً:
 *
 *   ① رأسُ مالٍ نقداً 5,000            نقد +5,000 · `3100` +5,000           ⟸ تمويل +5,000
 *   ② صندوقٌ برصيدٍ افتتاحيّ 700        على `3900` — **ليس تدفّقاً**          ⟸ لا شيء
 *   ③ شراءٌ بالآجل 1,000 + ضريبة 150   مصروف 1,000 · `1250` +150 · `2100` +1,150
 *   ④ أصلٌ ثابت نقداً 2,000            `1400` +2,000 · نقد −2,000           ⟸ استثمار −2,000
 *   ⑤ مخزونٌ بالآجل 800                `1300` +800 · `2100` +800
 *   ⑥ سدادُ مورّدٍ نقداً 600             `2100` −600 · نقد −600
 *
 *   التشغيل = −1,000 − 800 − 150 + 1,350 = **−600** (النقدُ الذي دُفع فعلاً) · الصافي = −600 − 2,000 + 5,000 = **2,400**
 *   = نقد +5,000 − 2,000 − 600. **وكانت القائمةُ تقول**: تشغيل 350 · صافي −1,650.
 */
describe('Cash flow covers every account (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const RANGE = 'from=2088-01-01&to=2088-12-31';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'cash-flow');
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 10.3] every balance-sheet account lands in its section; opening balances are not flows; the net equals measured cash', async () => {
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const list = Array.isArray(accounts) ? accounts : (accounts as unknown as { items: { id: string; code: string }[] }).items;
    const idOf = (code: string) => {
      const a = list.find((x) => x.code === code);
      expect(a).toBeDefined();
      return a!.id;
    };
    const cash = idOf('1000');
    const payables = idOf('2100');
    const inventory = idOf('1300');
    const capital = (await auth(http().post('/accounts')).send({ code: '3100', name: 'رأس المال', type: 'equity' }).expect(201)).body.id as string;
    const fixed = (await auth(http().post('/accounts')).send({ code: '1400', name: 'الأصول الثابتة', type: 'asset' }).expect(201)).body.id as string;

    const journal = (date: string, memo: string, debit: string, credit: string, amount: number) =>
      auth(http().post('/journal'))
        .send({ date, memo, lines: [{ accountId: debit, debit: amount, credit: 0 }, { accountId: credit, debit: 0, credit: amount }] })
        .expect(201);

    await journal('2088-01-05', 'رأسُ مالٍ نقداً', cash, capital, 5000); // ①
    await auth(http().post('/banks')).send({ name: 'صندوق التدفّق', kind: 'CASH_BOX', openingBalance: 700, openingDate: '2088-01-02' }).expect(201); // ②
    const supplierId = (await auth(http().post('/suppliers')).send({ name: 'مورّد التدفّق' }).expect(201)).body.id as string;
    await auth(http().post('/purchases')).send({ supplierId, date: '2088-02-01', category: 'مصروفاتٌ متنوّعة', subtotal: 1000 }).expect(201); // ③
    await journal('2088-03-01', 'أصلٌ ثابت نقداً', fixed, cash, 2000); // ④
    await journal('2088-04-01', 'مخزونٌ بالآجل', inventory, payables, 800); // ⑤
    await journal('2088-05-01', 'سدادُ مورّدٍ نقداً', payables, cash, 600); // ⑥

    const body = (await auth(http().get(`/reports/cash-flow?${RANGE}`)).expect(200)).body as Record<string, string | boolean>;
    const n = (k: string) => Number(body[k]);
    expect(n('netProfit')).toBeCloseTo(-1000, 2);
    expect(n('payablesChange')).toBeCloseTo(1350, 2);
    // الحقلان القائمان قبل الإصلاح أوّلاً — فالقياسُ على القديم يُظهر رقمَه الخاطئ لا حقلاً غائباً.
    expect(n('operatingCashFlow')).toBeCloseTo(-600, 2);
    expect(n('netCashChange')).toBeCloseTo(2400, 2);
    expect(n('inventoryChange')).toBeCloseTo(800, 2);
    expect(n('inputVatChange')).toBeCloseTo(150, 2);
    expect(n('investingCashFlow')).toBeCloseTo(-2000, 2);
    expect(n('financingCashFlow')).toBeCloseTo(5000, 2);
    // والصافي مقيسٌ من حسابات النقد لا مشتقٌّ وحدَه — والرصيدُ الافتتاحيُّ للصندوق خارجه.
    expect(n('cashAccountsChange')).toBeCloseTo(2400, 2);
    expect(body.reconciled).toBe(true);
  });
});
