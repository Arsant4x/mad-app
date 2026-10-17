import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyToday } from '../src/common/company-day.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MessageKey, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Four isolated companies, each with one contract; not measured yet, so a wide budget.
jest.setTimeout(300000);

/**
 * Unpaid rent taken from a security deposit is a payment of the rent installments it covers, made without cash. The
 * installments it pays close, so the receivable on 1200, the rent rows of the receivables aging and the reminder queue
 * all tell the same story. What it may take is capped at what the tenant owes on the contract: the rent due by the
 * settlement date, an open claim, or the settlement agreed at a cancellation. Anything above that would leave the tenant
 * with a credit nobody asked for, so it is refused and nothing is written.
 *
 * Every contract is residential: 1,000 a month with no VAT, so the gross of an installment is its amount.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));

interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string;
  status: string;
}
interface E2ePayment {
  id: string;
  installmentId: string | null;
  netAmount: string;
  depositId?: string | null;
}
interface E2eDeposit {
  id: string;
  type: string;
  status: string;
  refundAmount: string | null;
}
interface E2eContract {
  id: string;
  status: string;
  installments: E2eInstallment[];
  payments: E2ePayment[];
  deposits: E2eDeposit[];
}

describe('Unpaid rent taken from a deposit (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  const companies: IsolatedCompany[] = [];
  let today: Date;
  let seq = 0;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);
  /** First day of the month `k` months from the company's current month. */
  const M = (k: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
  const message = (key: MessageKey, params: Record<string, string>) => resolveMessage(formatMessage(key, params), DEFAULT_LANGUAGE);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
  });

  afterAll(async () => {
    for (const c of companies) await removeIsolatedCompany(app, c);
    await app.close();
  });

  async function freshCompany(): Promise<IsolatedCompany> {
    const c = await registerIsolatedCompany(app, `deposit-rent-${++seq}`);
    companies.push(c);
    today = await tenantPrisma.runInTenantContext(c.companyId, (tx) => companyToday(tx, c.companyId));
    return c;
  }

  async function balance(c: IsolatedCompany, code: string): Promise<number> {
    const accounts = (await as(c)(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[];
    return Number(accounts.find((a) => a.code === code)?.balance ?? 0);
  }

  /** The rent rows of the aging and the gap between the aging and 1200, both as of today. */
  async function aging(c: IsolatedCompany): Promise<{ rent: number; difference: number }> {
    const body = (await as(c)(http().get('/reports/receivables-aging')).query({ reconcile: 'true' }).expect(200)).body;
    return { rent: Number(body.totals.rent), difference: Number(body.reconciliation.difference) };
  }

  async function makeContract(c: IsolatedCompany, extra: Record<string, unknown> = {}, ownership: 'owned' | 'managed' = 'owned'): Promise<E2eContract> {
    const n = `${tag}-${++seq}`;
    const property = await as(c)(http().post('/properties'))
      .send({ name: `deposit rent property ${n}`, ownership, ...(ownership === 'managed' ? { opRate: 10 } : {}) })
      .expect(201);
    const unit = await as(c)(http().post('/units')).send({ propertyId: property.body.id, unitNo: `DR-${n}`, type: 'flat', rentMonthly: 1000 }).expect(201);
    const customerId = await createTenantCustomer(app, c.token, `deposit rent tenant ${n}`);
    const res = await as(c)(http().post('/contracts'))
      .send({
        classification: 'RESIDENTIAL',
        vatInclusion: 'EXCLUSIVE',
        unitId: unit.body.id,
        customerId,
        value: 12000,
        cycle: 'monthly',
        start: iso(M(-3)),
        end: iso(addDays(M(9), -1)),
        ...extra,
      })
      .expect(201);
    return res.body as E2eContract;
  }

  const getContract = async (c: IsolatedCompany, id: string) => (await as(c)(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const installmentDue = (contract: E2eContract, due: Date) => contract.installments.find((i) => i.dueDate.slice(0, 10) === iso(due))!;

  async function recordDeposit(c: IsolatedCompany, contractId: string, type: 'RENT' | 'FACILITY', amount: number): Promise<E2eDeposit> {
    const res = await as(c)(http().post(`/contracts/${contractId}/deposits`)).send({ type, amount, receivedAt: iso(M(-3)) }).expect(201);
    return (res.body as E2eContract).deposits.find((d) => d.type === type && d.status === 'HELD')!;
  }

  const settle = (c: IsolatedCompany, contractId: string, depositId: string, settledAt: string, deductions: Record<string, unknown>[]) =>
    as(c)(http().post(`/contracts/${contractId}/deposits/${depositId}/settle`)).send({ settledAt, deductions });

  it('pays the oldest unpaid installments, so the receivable, the aging and the reminders agree', async () => {
    const c = await freshCompany();
    const created = await makeContract(c);
    const deposit = await recordDeposit(c, created.id, 'RENT', 3000);

    const receivableBefore = await balance(c, '1200');
    const agingBefore = await aging(c);
    // The probe can see: the three installments already past are owed, and the aging matches 1200.
    expect(agingBefore.rent).toBeGreaterThanOrEqual(3000);
    expect(agingBefore.difference).toBe(0);

    await settle(c, created.id, deposit.id, iso(today), [
      { kind: 'UNPAID_RENT', amount: 1500, reason: 'unpaid rent' },
      { kind: 'DAMAGE', amount: 200, reason: 'broken door' },
    ]).expect(201);

    const contract = await getContract(c, created.id);
    const agingAfter = await aging(c);
    const oldest = installmentDue(contract, M(-3));
    const reminders = (await as(c)(http().get('/reminders/due')).query({ contractId: created.id }).expect(200)).body as { reminders: { installmentId: string }[] };

    expect({
      statuses: [M(-3), M(-2), M(-1)].map((d) => installmentDue(contract, d).status),
      receivableChange: r2((await balance(c, '1200')) - receivableBefore),
      agingRentChange: r2(agingAfter.rent - agingBefore.rent),
      agingDifference: agingAfter.difference,
      oldestStillChased: reminders.reminders.some((r) => r.installmentId === oldest.id),
      fromDeposit: contract.payments
        .filter((p) => p.depositId === deposit.id)
        .map((p) => Number(p.netAmount))
        .sort((a, b) => b - a),
    }).toEqual({
      statuses: ['PAID', 'PARTIAL', 'LATE'],
      receivableChange: -1500,
      agingRentChange: -1500,
      agingDifference: 0,
      oldestStillChased: false,
      fromDeposit: [1000, 500],
    });
  });

  it('refuses unpaid rent above what is due, writes nothing, and takes exactly what is due', async () => {
    const c = await freshCompany();
    const created = await makeContract(c);
    const deposit = await recordDeposit(c, created.id, 'RENT', 10000);
    const due = (await aging(c)).rent;
    expect(due).toBeGreaterThanOrEqual(3000);

    const receivableBefore = await balance(c, '1200');
    const refused = await settle(c, created.id, deposit.id, iso(today), [{ kind: 'UNPAID_RENT', amount: due + 1, reason: 'unpaid rent' }]).expect(400);
    expect(refused.body.message).toBe(message(MSG.deposit_unpaid_rent_exceeds_due, { due: due.toFixed(2) }));
    const untouched = await getContract(c, created.id);
    expect({
      receivable: await balance(c, '1200'),
      deposit: untouched.deposits.find((d) => d.id === deposit.id)!.status,
      payments: untouched.payments.length,
    }).toEqual({ receivable: receivableBefore, deposit: 'HELD', payments: 0 });

    await settle(c, created.id, deposit.id, iso(today), [{ kind: 'UNPAID_RENT', amount: due, reason: 'unpaid rent' }]).expect(201);
    const contract = await getContract(c, created.id);
    const owed = contract.installments.filter((i) => i.dueDate.slice(0, 10) <= iso(today));
    expect({
      paid: owed.every((i) => i.status === 'PAID'),
      receivable: r2((await balance(c, '1200')) - receivableBefore),
      aging: await aging(c),
    }).toEqual({ paid: true, receivable: r2(-due), aging: { rent: 0, difference: 0 } });
  });

  it('after a cancellation takes the agreed settlement from the deposit, and nothing beyond it', async () => {
    const c = await freshCompany();
    const created = await makeContract(c);
    const rentDeposit = await recordDeposit(c, created.id, 'RENT', 3000);
    const facility = await recordDeposit(c, created.id, 'FACILITY', 500);
    // Everything due is paid in cash first, so the settlement is the only thing the tenant still owes.
    const due = (await aging(c)).rent;
    await as(c)(http().post(`/contracts/${created.id}/payments`)).send({ date: iso(today), amount: due, method: 'CASH' }).expect(201);
    expect((await aging(c)).rent).toBe(0);

    await as(c)(http().post(`/contracts/${created.id}/cancel`))
      .send({ cancelDate: iso(M(1)), cancelReason: 'early exit', installmentDisposition: 'cancel', settlementBasis: 'amount', settlementAmount: 1800 })
      .expect(201);
    const receivableAfterCancel = await balance(c, '1200');

    await settle(c, created.id, rentDeposit.id, iso(M(1)), [{ kind: 'UNPAID_RENT', amount: 1800, reason: 'cancellation settlement' }]).expect(201);
    const refused = await settle(c, created.id, facility.id, iso(M(1)), [{ kind: 'UNPAID_RENT', amount: 100, reason: 'unpaid rent' }]).expect(400);
    const contract = await getContract(c, created.id);

    expect({
      receivable: r2((await balance(c, '1200')) - receivableAfterCancel),
      refusal: refused.body.message,
      facility: contract.deposits.find((d) => d.id === facility.id)!.status,
      fromDeposit: contract.payments.filter((p) => p.depositId).length,
    }).toEqual({
      receivable: -1800,
      refusal: message(MSG.deposit_unpaid_rent_exceeds_due, { due: '0.00' }),
      facility: 'HELD',
      fromDeposit: 0,
    });
  });

  it('refuses unpaid rent on a contract whose rent belongs to the owner, and writes nothing', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { lessor: 'OWNER', ownerName: 'unit owner' }, 'managed');
    const deposit = await recordDeposit(c, created.id, 'RENT', 3000);
    const receivableBefore = await balance(c, '1200');

    const refused = await settle(c, created.id, deposit.id, iso(today), [{ kind: 'UNPAID_RENT', amount: 1000, reason: 'unpaid rent' }]).expect(400);
    const contract = await getContract(c, created.id);
    expect({
      refusal: refused.body.message,
      receivable: await balance(c, '1200'),
      deposit: contract.deposits.find((d) => d.id === deposit.id)!.status,
    }).toEqual({
      refusal: message(MSG.deposit_unpaid_rent_not_receivable, {}),
      receivable: receivableBefore,
      deposit: 'HELD',
    });
  });
});
