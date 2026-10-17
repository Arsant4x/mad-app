import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { RETAINED_EARNINGS_CODE } from '../src/fiscal/year-closing.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * Closing an earlier fiscal year while a later one stands closed would move the earlier
 * result into retained earnings a second time, since the later closing already carried
 * the cumulative result. Figures are chosen by hand: 2024 earns 1,000 and 2025 earns 300.
 */
jest.setTimeout(120000);

describe('Fiscal year closing order (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;

  interface YearBody { id: string; name: string; periods: { id: string }[] }
  interface SheetLine { code: string; name: string; amount: string }
  interface Sheet { equity: SheetLine[]; balanced: boolean }

  let year2024: YearBody;
  let year2025: YearBody;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const accountId = async (code: string): Promise<string> => {
    const list = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const row = list.find((a) => a.code === code);
    if (!row) throw new Error(`no account with code ${code}`);
    return row.id;
  };

  const sheetAt = async (to: string): Promise<Sheet> => (await auth(http().get(`/reports/balance-sheet?to=${to}`)).expect(200)).body as Sheet;
  const periodResultLine = (sheet: Sheet) => sheet.equity.find((l) => l.name.includes('نتيجة الفترة'));
  const retainedLine = (sheet: Sheet) => sheet.equity.find((l) => l.code === RETAINED_EARNINGS_CODE);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'year-closing-order');
    token = company.token;

    // The years exist before the entries, so posting does not create its own year that would overlap.
    year2024 = (await auth(http().post('/fiscal-years')).send({ name: 'FY 2024 order', start: '2024-01-01', end: '2024-12-31' }).expect(201)).body as YearBody;
    year2025 = (await auth(http().post('/fiscal-years')).send({ name: 'FY 2025 order', start: '2025-01-01', end: '2025-12-31' }).expect(201)).body as YearBody;
    expect(year2024.periods).toHaveLength(12);
    expect(year2025.periods).toHaveLength(12);

    const [receivable, sales] = await Promise.all([accountId('1200'), accountId('4100')]);
    for (const [date, amount] of [['2024-03-01', 1000], ['2025-03-01', 300]] as const) {
      await auth(http().post('/journal'))
        .send({ date, memo: 'sale', lines: [{ accountId: receivable, debit: amount, credit: 0 }, { accountId: sales, debit: 0, credit: amount }] })
        .expect(201);
    }

    for (const p of [...year2024.periods, ...year2025.periods]) await auth(http().patch(`/fiscal-years/periods/${p.id}/close`)).expect(200);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses closing an earlier year while a later year has an active closing entry', async () => {
    const later = await auth(http().post(`/fiscal-years/${year2025.id}/close`)).expect(201);
    // The later closing carries the cumulative result of both years: 1,000 + 300.
    expect((later.body as { netResult: number }).netResult).toBe(1300);

    const res = await auth(http().post(`/fiscal-years/${year2024.id}/close`)).expect(409);
    expect(String(res.body.message)).toContain(year2025.name);

    const sheet = await sheetAt('2025-12-31');
    expect(periodResultLine(sheet)).toBeUndefined();
    expect(retainedLine(sheet)?.amount).toBe('1300.00');
    expect(sheet.balanced).toBe(true);
  });

  it('closes in order after reopening the later year, and each result is transferred once', async () => {
    await auth(http().patch(`/fiscal-years/periods/${year2025.periods[5].id}/reopen`)).send({ reason: 'close the earlier year first' }).expect(200);

    const earlier = await auth(http().post(`/fiscal-years/${year2024.id}/close`)).expect(201);
    expect((earlier.body as { netResult: number }).netResult).toBe(1000);

    await auth(http().patch(`/fiscal-years/periods/${year2025.periods[5].id}/close`)).expect(200);
    const later = await auth(http().post(`/fiscal-years/${year2025.id}/close`)).expect(201);
    expect((later.body as { netResult: number }).netResult).toBe(300);

    const sheet2024 = await sheetAt('2024-12-31');
    expect(periodResultLine(sheet2024)).toBeUndefined();
    expect(retainedLine(sheet2024)?.amount).toBe('1000.00');

    const sheet2025 = await sheetAt('2025-12-31');
    expect(periodResultLine(sheet2025)).toBeUndefined();
    expect(retainedLine(sheet2025)?.amount).toBe('1300.00');
    expect(sheet2025.balanced).toBe(true);
  });
});
