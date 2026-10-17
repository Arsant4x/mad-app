import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed.
jest.setTimeout(75000);

/**
 * The cash in transit account 1190 lies inside the first bank code band. Creating it (a drawer deposit) must not move
 * the next bank code or the remaining band capacity: it is a reserved code, not a bank.
 */
describe('Cash in transit code does not consume bank codes (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;

  interface BandStatus {
    capacity: number;
    remaining: number;
    next: string | null;
  }

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const band = async () => (await auth(http().get('/banks/code-band')).expect(200)).body as BandStatus;
  const accountCode = async (accountId: string) => {
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    return accounts.find((a) => a.id === accountId)?.code;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'transit-code');
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a drawer deposit creates 1190 and the next bank still takes the bank MAX+1', async () => {
    const first = await auth(http().post('/banks')).send({ name: 'Bank one', kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    expect(await accountCode(first.body.accountId)).toBe('1100');

    const drawer = await auth(http().post('/cash-drawers')).send({ name: 'Deposit drawer' }).expect(201);
    const drawerAccountId = drawer.body.account?.id ?? drawer.body.accountId;
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const revenueId = accounts.find((a) => a.code === '4100')!.id;
    await auth(http().post('/journal'))
      .send({ date: '2026-06-01', memo: 'Fund the drawer', lines: [{ accountId: drawerAccountId, debit: 100, credit: 0 }, { accountId: revenueId, debit: 0, credit: 100 }] })
      .expect(201);

    const before = await band();
    expect(before.next).toBe('1101');

    await auth(http().post('/banks/cash-deposits')).send({ drawerId: drawer.body.id, bankId: first.body.id, amount: 50, date: '2026-06-05' }).expect(201);
    const afterAccounts = (await auth(http().get('/accounts')).expect(200)).body as { code: string }[];
    expect(afterAccounts.some((a) => a.code === '1190')).toBe(true);

    const after = await band();
    expect(after.next).toBe('1101');
    expect(after.remaining).toBe(before.remaining);

    const second = await auth(http().post('/banks')).send({ name: 'Bank two', kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: '2026-01-01' }).expect(201);
    expect(await accountCode(second.body.accountId)).toBe('1101');
  });
});
