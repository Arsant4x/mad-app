import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: a wide ceiling until the first measured run.
jest.setTimeout(120000);

/**
 * A manual journal entry has at least two lines, and every line carries exactly one side: a debit or a
 * credit above zero. Balanced totals alone used to let through a single line debiting and crediting the
 * same account, or lines carrying both sides at once. Each refusal is checked against what was stored,
 * and a well formed entry of the same size is accepted and can still be reversed.
 */
describe('Manual journal entries need two lines with one side each (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`).set('Accept-Language', 'en');
  const inTenant = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => tenantPrisma.runInTenantContext(company.companyId, fn);
  let cash: string;
  let revenue: string;

  type Line = { accountId: string; debit: number; credit: number };
  const post = (memo: string, lines: Line[]) => auth(http().post('/journal')).send({ date: today, memo, lines });
  const storedEntries = (memo: string) => inTenant((tx) => tx.journalEntry.count({ where: { memo } }));
  const outcome = async (memo: string, lines: Line[]) => {
    const res = await post(memo, lines);
    return { status: res.status, message: res.status >= 400 ? String(res.body.message) : undefined, stored: await storedEntries(memo) };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'je-shape');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    cash = accounts.find((a) => a.code === '1000')!.id;
    revenue = accounts.find((a) => a.code === '4100')!.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('accepts two one sided lines and the entry can be reversed', async () => {
    const memo = `two lines ${suffix}`;
    const res = await post(memo, [
      { accountId: cash, debit: 100, credit: 0 },
      { accountId: revenue, debit: 0, credit: 100 },
    ]);
    expect({ status: res.status, stored: await storedEntries(memo) }).toEqual({ status: 201, stored: 1 });
    const reversal = await auth(http().post(`/journal/${res.body.id as string}/reverse`)).send({ date: today });
    expect(reversal.status).toBe(201);
  });

  it('refuses a single line that debits and credits the same account', async () => {
    const memo = `single line ${suffix}`;
    expect(await outcome(memo, [{ accountId: cash, debit: 100, credit: 100 }])).toEqual({
      status: 400,
      message: 'A manual journal entry needs at least two lines',
      stored: 0,
    });
  });

  it('refuses balanced lines that each carry both a debit and a credit', async () => {
    const memo = `two sided ${suffix}`;
    expect(
      await outcome(memo, [
        { accountId: cash, debit: 100, credit: 40 },
        { accountId: revenue, debit: 40, credit: 100 },
      ]),
    ).toEqual({
      status: 400,
      message: 'Each line of a manual journal entry takes a debit or a credit above zero, not both',
      stored: 0,
    });
  });

  it('refuses a line with neither a debit nor a credit', async () => {
    const memo = `empty line ${suffix}`;
    expect(
      await outcome(memo, [
        { accountId: cash, debit: 100, credit: 0 },
        { accountId: revenue, debit: 0, credit: 100 },
        { accountId: revenue, debit: 0, credit: 0 },
      ]),
    ).toEqual({
      status: 400,
      message: 'Each line of a manual journal entry takes a debit or a credit above zero, not both',
      stored: 0,
    });
  });
});
