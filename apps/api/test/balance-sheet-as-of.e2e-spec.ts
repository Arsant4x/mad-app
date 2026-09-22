import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * **المركزُ المالي بتاريخٍ ومن السطور** (`ق-١٢٧٩` · د/⑩A1 — `domain-scan/10` A1).
 *
 * ## ما كان (مقيسٌ في `§9-ب` وفي المراجعة الخارجية R26/R61)
 * `balanceSheet` يقرأ `account.balance` — رقمٌ تراكميٌّ منذ التأسيس **بلا تاريخ** (فلا ميزانيةَ «كما في
 * ٣١ ديسمبر»)، **ويهمل الإيرادَ والمصروف** فلا يتوازن أبداً بعد أوّل بيع: الفجوةُ = صافي الربح حرفياً
 * (قِيس `126,723.02` على `aa-test`).
 *
 * ## ما يُثبَت هنا — بأرقامٍ محسوبةٍ يداً لا بمطابقةِ شكلَين (`ق-٧١٥`)
 * منشأةٌ معزولة بقيدين بتاريخين: بيعٌ `1,000` في `2089-03-10` ومصروفٌ `400` في `2089-06-20`.
 * ① حتى `2089-03-31`: الأصولُ `1,000` = الخصوم `0` + حقوقُ الملكية `1,000` (نتيجةُ الفترة).
 * ② حتى `2089-12-31`: الأصولُ `600` وحقوقُ الملكية `600`.
 * ③ **والتوازنُ في الحالتين** — وقبل البناء كان `balanced: false` في كلتيهما.
 * ④ وتاريخٌ يسبق القيدين ⟵ صفرٌ في الطرفين: ميزانيةٌ فارغةٌ متوازنة.
 */
describe('[SPEC 10.2] المركزُ المالي بتاريخٍ ومن السطور — ويتوازن (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let cashId: string;
  let revenueId: string;
  let expenseId: string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());

  interface Line { code: string; name: string; amount: string }
  interface Sheet { asOf: string | null; assets: Line[]; totalAssets: string; liabilities: Line[]; equity: Line[]; totalLiabilitiesAndEquity: string; balanced: boolean }
  const sheet = async (to?: string): Promise<Sheet> =>
    (await auth(http().get(to ? `/reports/balance-sheet?to=${to}` : '/reports/balance-sheet')).expect(200)).body as Sheet;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'bs-asof');
    const accounts = await auth(http().get('/accounts')).expect(200);
    const byCode = (code: string) => accounts.body.find((a: { code: string }) => a.code === code).id;
    cashId = byCode('1000');
    revenueId = byCode('4100');
    expenseId = byCode('5300');

    await auth(http().post('/fiscal-years')).send({ name: 'سنة 2089', start: '2089-01-01', end: '2089-12-31' }).expect(201);
    await auth(http().post('/journal'))
      .send({ date: '2089-03-10', memo: 'بيعٌ نقديّ', lines: [{ accountId: cashId, debit: 1000, credit: 0 }, { accountId: revenueId, debit: 0, credit: 1000 }] })
      .expect(201);
    await auth(http().post('/journal'))
      .send({ date: '2089-06-20', memo: 'مصروفٌ نقديّ', lines: [{ accountId: expenseId, debit: 400, credit: 0 }, { accountId: cashId, debit: 0, credit: 400 }] })
      .expect(201);
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('⭐ ① حتى 2089-03-31: أصولٌ 1,000 وحقوقُ ملكيةٍ 1,000 — ويتوازن', async () => {
    const s = await sheet('2089-03-31');
    expect(s.asOf).toBe('2089-03-31');
    expect(s.assets.find((a) => a.code === '1000')?.amount).toBe('1000.00');
    expect(s.totalAssets).toBe('1000.00');
    expect(s.equity.find((e) => e.name.includes('نتيجة الفترة'))?.amount).toBe('1000.00');
    expect(s.totalLiabilitiesAndEquity).toBe('1000.00');
    expect(s.balanced).toBe(true);
  }, 40000);

  it('⭐ ② حتى 2089-12-31: أصولٌ 600 وحقوقُ ملكيةٍ 600 — فالمصروفُ يُقرأ كذلك', async () => {
    const s = await sheet('2089-12-31');
    expect(s.totalAssets).toBe('600.00');
    expect(s.equity.find((e) => e.name.includes('نتيجة الفترة'))?.amount).toBe('600.00');
    expect(s.totalLiabilitiesAndEquity).toBe('600.00');
    expect(s.balanced).toBe(true);
  }, 40000);

  it('③ تاريخٌ يسبق القيدين ⟵ ميزانيةٌ فارغةٌ متوازنة، ولا سطرَ نتيجةٍ أصلاً', async () => {
    const s = await sheet('2089-01-31');
    expect(s.totalAssets).toBe('0.00');
    expect(s.totalLiabilitiesAndEquity).toBe('0.00');
    expect(s.equity.some((e) => e.name.includes('نتيجة الفترة'))).toBe(false);
    expect(s.balanced).toBe(true);
  }, 40000);

  it('④ بلا تاريخ: حتى اليوم — والقيدان في الماضي فالأرقامُ نفسُها، و`asOf` فارغ', async () => {
    const s = await sheet();
    expect(s.asOf).toBeNull();
    expect(s.totalAssets).toBe('600.00');
    expect(s.balanced).toBe(true);
  }, 40000);
});
