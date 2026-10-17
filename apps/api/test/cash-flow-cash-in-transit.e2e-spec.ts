import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

jest.setTimeout(75000);

/**
 * Cash on its way from the company's own drawer to its own bank (account 1190) is still cash (IAS 7),
 * so a drawer deposit and its bank confirmation are moves between cash accounts, not cash flows.
 * Isolated company, figures worked by hand: a sale of 1,000 into the drawer on 2026-06-01, a deposit of 400
 * on 2026-06-30 left unconfirmed, then confirmed by the bank statement on 2026-07-02.
 *   June: operating +1,000 and cash +1,000 (drawer 600 + in transit 400).
 *   July: nothing moves cash in or out, so every figure is zero.
 */
describe('Cash flow treats cash in transit as cash (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let drawerId: string;
  let bankId: string;
  let depositId: string;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const cashFlow = async (from: string, to: string) =>
    (await auth(http().get(`/reports/cash-flow?from=${from}&to=${to}`)).expect(200)).body as Record<string, string | boolean>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'cf-transit');

    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const revenueId = accounts.find((a) => a.code === '4100')!.id;
    const drawer = await auth(http().post('/cash-drawers')).send({ name: 'Transit drawer' }).expect(201);
    drawerId = drawer.body.id;
    const drawerAccountId = drawer.body.account?.id ?? drawer.body.accountId;
    const bank = await auth(http().post('/banks')).send({ name: 'Transit bank', kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    bankId = bank.body.id;

    await auth(http().post('/journal'))
      .send({ date: '2026-06-01', memo: 'Cash sale', lines: [{ accountId: drawerAccountId, debit: 1000, credit: 0 }, { accountId: revenueId, debit: 0, credit: 1000 }] })
      .expect(201);
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 10.3] an unconfirmed drawer deposit stays in cash and is not an operating outflow', async () => {
    const res = await auth(http().post('/banks/cash-deposits')).send({ drawerId, bankId, amount: 400, date: '2026-06-30' }).expect(201);
    depositId = res.body.id;

    const june = await cashFlow('2026-06-01', '2026-06-30');
    expect(Number(june.netProfit)).toBeCloseTo(1000, 2);
    expect(Number(june.otherOperatingChange)).toBeCloseTo(0, 2);
    expect(Number(june.operatingCashFlow)).toBeCloseTo(1000, 2);
    expect(Number(june.cashAccountsChange)).toBeCloseTo(1000, 2);
    expect(june.reconciled).toBe(true);
  });

  it('[SPEC 10.3] the bank confirmation in the next month is not a cash inflow', async () => {
    const row = (await auth(http().post('/transactions')).send({ bankId, date: '2026-07-02', description: 'Cash deposit', amount: 400 }).expect(201)).body.id;
    await auth(http().post(`/banks/${bankId}/reconciliation/post`)).send({ transactionId: row, depositId }).expect(201);

    const july = await cashFlow('2026-07-01', '2026-07-31');
    expect(Number(july.otherOperatingChange)).toBeCloseTo(0, 2);
    expect(Number(july.operatingCashFlow)).toBeCloseTo(0, 2);
    expect(Number(july.netCashChange)).toBeCloseTo(0, 2);
    expect(Number(july.cashAccountsChange)).toBeCloseTo(0, 2);
    expect(july.reconciled).toBe(true);
  });
});
