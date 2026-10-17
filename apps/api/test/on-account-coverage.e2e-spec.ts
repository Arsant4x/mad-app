import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: about three times the measured run, declared here rather than assumed.
jest.setTimeout(240000);

/**
 * An amount received on account must be covered by what the customer still owes on issued invoices, in base
 * currency, after what earlier receipts already left on account. Anything beyond that is a prepayment and needs
 * its own tax document, so it is refused as on-account.
 */
describe('On-account receipt coverage (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let race: ReturnType<typeof raceHarness>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let branchId: string;
  let cashBoxId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);

  const newCustomer = async (tag: string): Promise<string> =>
    (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `Customer ${tag} ${suffix}` }).expect(201)).body.id;

  const makeInvoice = async (customerId: string, total: number, currency?: string, exchangeRate?: number): Promise<string> =>
    (
      await auth(http().post('/invoices'))
        .send({
          customerId,
          branchId,
          issueDate: today(),
          dueDate: today(),
          ...(currency ? { currency, exchangeRate } : {}),
          lines: [{ description: `Line ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
        })
        .expect(201)
    ).body.id;

  const onAccount = (customerId: string, amount: number) =>
    auth(http().post('/payments')).send({ customerId, branchId, date: today(), amount, method: 'CASH', bankId: cashBoxId, unallocated: 'ON_ACCOUNT' });

  const receiptsOf = async (customerId: string) => (await auth(http().get(`/payments?customerId=${customerId}`)).expect(200)).body as { id: string }[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'on-account');
    race = raceHarness(() => company.companyId, holdClient, probe);
    branchId = (await auth(http().post('/branches')).send({ name: `Branch ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(http().post('/banks')).send({ name: `Box ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: today(), branchId }).expect(201)).body.id;
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a second on-account receipt is refused once an earlier one already covers the open invoice', async () => {
    const customerId = await newCustomer('second');
    await makeInvoice(customerId, 1000);

    await onAccount(customerId, 1000).expect(201);
    const second = await onAccount(customerId, 1000);
    expect(second.status).toBe(400);
    expect(String(second.body.message)).toContain('1000.00');
    expect(String(second.body.message)).toContain(': 0.00)');
    expect(await receiptsOf(customerId)).toHaveLength(1);
  });

  it('a foreign currency invoice covers its base value, not its face amount', async () => {
    const customerId = await newCustomer('foreign');
    await makeInvoice(customerId, 100, 'USD', 3.75);

    const over = await onAccount(customerId, 376);
    expect(over.status).toBe(400);
    expect(String(over.body.message)).toContain(': 375.00)');
    await onAccount(customerId, 375).expect(201);
  });

  it('two on-account receipts at once against one open invoice: exactly one is written', async () => {
    const customerId = await newCustomer('race');
    await makeInvoice(customerId, 1000);

    const result = await race.raceBehindLock('customers', customerId, () => onAccount(customerId, 1000));
    expect({ locked: result.locked, held: result.heldWhenFired, blocked: result.blocked }).toEqual({ locked: 1, held: 'held', blocked: 2 });
    expect(result.responses.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await receiptsOf(customerId)).toHaveLength(1);
  });
});
