import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyToday } from '../src/common/company-day.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { RentAccrualService } from '../src/contracts/rent-accrual.service';
import { RentRecognitionService } from '../src/contracts/rent-recognition.service';
import { ACCRUAL_CONTRACT_SELECT, accrueForPaymentWithinTx, treatmentOf } from '../src/journal/rent-accrual.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Seven isolated companies, each with one contract swept to its end; not measured yet, so a wide budget.
jest.setTimeout(300000);

/**
 * A cancelled contract is settled when it is cancelled. Afterwards neither the daily accrual sweep, the fee sweep nor
 * revenue recognition may bill it or turn it into rent revenue. Installments from the cancel date on are either
 * cancelled (and a partly paid one with them) or kept owed; kept ones are compensation for a period the tenant does not
 * occupy, so they go to other income (4300) at the cancellation, never to rent revenue (4200). A settlement worked out
 * from those same installments cannot be combined with keeping them.
 *
 * Every contract is residential: 1,000 a month with no VAT.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const dayBefore = (d: Date) => addDays(d, -1);

interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string;
  status: string;
  accrualCompletedAt: string | null;
}
interface E2eContract {
  id: string;
  no: string;
  status: string;
  installments: E2eInstallment[];
  claims: { kind: string; installmentId: string | null }[];
}
interface E2eEntry {
  lines: { debit: string; credit: string; account: { code: string } }[];
}

const LEDGER = ['1200', '2200', '2400', '4200', '4300'] as const;
const residential = { classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' };

describe('A cancelled contract stops billing (e2e)', () => {
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
    const c = await registerIsolatedCompany(app, `cancel-stop-${++seq}`);
    companies.push(c);
    today = await tenantPrisma.runInTenantContext(c.companyId, (tx) => companyToday(tx, c.companyId));
    return c;
  }

  async function ledger(c: IsolatedCompany): Promise<Record<string, number>> {
    const accounts = (await as(c)(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[];
    return Object.fromEntries(LEDGER.map((code) => [code, Number(accounts.find((a) => a.code === code)?.balance ?? 0)]));
  }
  const diff = (after: Record<string, number>, before: Record<string, number>) => Object.fromEntries(Object.keys(after).map((k) => [k, r2(after[k] - before[k])]));

  async function measured(c: IsolatedCompany, action: () => Promise<unknown>) {
    const before = await ledger(c);
    await action();
    return diff(await ledger(c), before);
  }

  /** The daily accrual and fee sweep, then revenue recognition, both run as of `asOf`. */
  async function sweepTo(c: IsolatedCompany, asOf: Date) {
    await app.get(RentAccrualService).runForCompany(c.companyId, asOf);
    await app.get(RentRecognitionService).runForCompany(c.companyId, asOf);
  }

  async function makeContract(c: IsolatedCompany, body: Record<string, unknown>): Promise<E2eContract> {
    const n = `${tag}-${++seq}`;
    const property = await as(c)(http().post('/properties')).send({ name: `cancel stop property ${n}`, ownership: 'owned' }).expect(201);
    const unit = await as(c)(http().post('/units')).send({ propertyId: property.body.id, unitNo: `CS-${n}`, type: 'flat', rentMonthly: 1000 }).expect(201);
    const customerId = await createTenantCustomer(app, c.token, `cancel stop tenant ${n}`);
    const res = await as(c)(http().post('/contracts')).send({ ...residential, unitId: unit.body.id, customerId, cycle: 'monthly', ...body }).expect(201);
    return res.body as E2eContract;
  }

  const getContract = async (c: IsolatedCompany, id: string) => (await as(c)(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const installmentDue = (contract: E2eContract, due: Date) => contract.installments.find((i) => i.dueDate.slice(0, 10) === iso(due))!;
  const cancel = (c: IsolatedCompany, id: string, body: Record<string, unknown>) =>
    as(c)(http().post(`/contracts/${id}/cancel`)).send({ cancelReason: 'early exit', ...body });

  it('a partly paid installment after the cancel date is cancelled with the others and never billed afterwards', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 12000, start: iso(M(-1)), end: iso(dayBefore(M(11))) });
    const target = installmentDue(created, M(1));
    await as(c)(http().post(`/contracts/${created.id}/payments`)).send({ date: iso(today), amount: 400, method: 'CASH', installmentId: target.id }).expect(201);
    expect(installmentDue(await getContract(c, created.id), M(1)).status).toBe('PARTIAL');

    await cancel(c, created.id, { cancelDate: iso(today), installmentDisposition: 'cancel', unearnedDisposition: 'refund' }).expect(201);
    const afterCancel = await measured(c, () => sweepTo(c, M(12)));
    const contract = await getContract(c, created.id);

    expect({ status: installmentDue(contract, M(1)).status, closed: installmentDue(contract, M(1)).accrualCompletedAt !== null, afterCancel }).toEqual({
      status: 'CANCELLED',
      closed: true,
      afterCancel: { 1200: 0, 2200: 0, 2400: 0, 4200: 0, 4300: 0 },
    });
    // It cannot be collected either, so nothing may stay owed on it.
    await as(c)(http().post(`/contracts/${created.id}/payments`)).send({ date: iso(today), amount: 600, method: 'CASH', installmentId: target.id }).expect(409);
  });

  it('a partly paid installment already billed is cancelled and its unpaid part reversed', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 12000, start: iso(M(-3)), end: iso(dayBefore(M(9))) });
    // This month's installment is billed at creation unless the company's month has started before the UTC one.
    const thisMonthBilled = M(0).getTime() <= Date.now();
    const target = installmentDue(created, M(-1));
    await as(c)(http().post(`/contracts/${created.id}/payments`)).send({ date: iso(today), amount: 400, method: 'CASH', installmentId: target.id }).expect(201);

    // Recorded today, effective in the middle of the month two months back: last month's and this month's installments
    // were billed when the contract was created, and both fall after the cancel date.
    const cancelDate = addDays(M(-2), 14);
    const run = await measured(c, () => cancel(c, created.id, { cancelDate: iso(cancelDate), installmentDisposition: 'cancel', unearnedDisposition: 'income' }).expect(201));
    const contract = await getContract(c, created.id);

    // The unpaid 600 of the partly paid installment and this month's unpaid 1,000 are reversed.
    expect({ status: installmentDue(contract, M(-1)).status, receivable: run['1200'] }).toEqual({ status: 'CANCELLED', receivable: thisMonthBilled ? -1600 : -600 });
  });

  it('installments kept due go to other income at the cancellation, and neither rent nor fees are billed for them afterwards', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 6000, start: iso(M(-1)), end: iso(dayBefore(M(5))), fees: [{ label: 'parking', amount: 100 }] });
    const now = Date.now();
    // Kept and not billed yet: due from the cancel date on and after the moment the contract was created.
    const kept = r2(created.installments.filter((i) => i.dueDate.slice(0, 10) >= iso(today) && new Date(i.dueDate).getTime() > now).reduce((s, i) => s + Number(i.amount), 0));
    expect(kept).toBeGreaterThan(0);
    // 400 of one of them is paid in advance: billed when received, it is kept as income by the chosen destination.
    await as(c)(http().post(`/contracts/${created.id}/payments`)).send({ date: iso(today), amount: 400, method: 'CASH', installmentId: installmentDue(created, M(2)).id }).expect(201);

    const atCancel = await measured(c, () => cancel(c, created.id, { cancelDate: iso(today), installmentDisposition: 'keep', unearnedDisposition: 'income' }).expect(201));
    const feeClaimsAtCancel = (await getContract(c, created.id)).claims.filter((cl) => cl.kind === 'FEE').length;
    const afterCancel = await measured(c, () => sweepTo(c, M(6)));
    const contract = await getContract(c, created.id);

    const journal = (await as(c)(http().get('/journal')).query({ search: contract.no, pageSize: 100 }).expect(200)).body as { items: E2eEntry[] };
    const compensation = journal.items.filter((e) => e.lines.map((l) => l.account.code).sort().join() === '1200,4300');
    const receivableDebits = compensation.map((e) => r2(Number(e.lines.find((l) => l.account.code === '1200')!.debit)));

    expect({
      compensation: receivableDebits,
      receivableAtCancel: r2(atCancel['1200']),
      afterCancel,
      newFeeClaims: contract.claims.filter((cl) => cl.kind === 'FEE').length - feeClaimsAtCancel,
    }).toEqual({
      compensation: [r2(kept - 400)],
      receivableAtCancel: r2(kept - 400),
      afterCancel: { 1200: 0, 2200: 0, 2400: 0, 4200: 0, 4300: 0 },
      newFeeClaims: 0,
    });
  });

  it('the sweeps leave a cancelled contract alone where an earlier cancellation left kept installments open', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 6000, start: iso(M(-1)), end: iso(dayBefore(M(5))), fees: [{ label: 'parking', amount: 100 }] });
    await cancel(c, created.id, { cancelDate: iso(today), installmentDisposition: 'keep', unearnedDisposition: 'income' }).expect(201);
    // As a cancellation recorded before kept installments were closed left them.
    await tenantPrisma.runInTenantContext(c.companyId, (tx) => tx.installment.updateMany({ where: { contractId: created.id, dueDate: { gte: M(1) } }, data: { accrualCompletedAt: null } }));

    const afterCancel = await measured(c, () => sweepTo(c, M(6)));

    expect(afterCancel).toEqual({ 1200: 0, 2200: 0, 2400: 0, 4200: 0, 4300: 0 });
  });

  it('keeping the installments due with a settlement worked out from them is refused', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 6000, start: iso(M(1)), end: iso(dayBefore(M(7))) });

    const all = await cancel(c, created.id, { cancelDate: iso(M(1)), installmentDisposition: 'keep', settlementBasis: 'all' }).expect(400);
    const some = await cancel(c, created.id, { cancelDate: iso(M(1)), installmentDisposition: 'keep', settlementBasis: 'installments', settlementInstallments: 2 }).expect(400);
    const contract = await getContract(c, created.id);

    expect({ all: String(all.body.message), some: String(some.body.message) }).toEqual({
      all: expect.stringContaining('لا تُبقى مستحقّةً'),
      some: expect.stringContaining('لا تُبقى مستحقّةً'),
    });
    expect(contract.status).not.toBe('CANCELLED');
  });

  it('installments due before a cancel date still to come are billed, and recognized up to it', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 6000, start: iso(M(1)), end: iso(dayBefore(M(7))) });

    // Effective on the last day of the month after next: the first two installments fall before it.
    const run = await measured(c, async () => {
      await cancel(c, created.id, { cancelDate: iso(dayBefore(M(3))), installmentDisposition: 'cancel' }).expect(201);
      await sweepTo(c, M(8));
    });

    expect(run).toEqual({ 1200: 2000, 2200: 0, 2400: 0, 4200: 2000, 4300: 0 });
  });

  it('recognition leaves rent billed on a cancelled contract in deferred revenue', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 6000, start: iso(M(-1)), end: iso(dayBefore(M(5))) });
    await cancel(c, created.id, { cancelDate: iso(today), installmentDisposition: 'cancel', unearnedDisposition: 'refund' }).expect(201);

    // Rent billed for an installment after the cancellation, as the daily sweep used to bill it.
    const target = installmentDue(created, M(2));
    await tenantPrisma.runInTenantContext(c.companyId, async (tx) => {
      const contract = await tx.contract.findUniqueOrThrow({ where: { id: created.id }, select: ACCRUAL_CONTRACT_SELECT });
      await accrueForPaymentWithinTx(tx, c.companyId, contract, treatmentOf(contract)!, { id: 'none', date: M(2), grossInContractCurrency: 0, installmentId: target.id }, M(2));
    });
    const recognized = await measured(c, () => app.get(RentRecognitionService).runForCompany(c.companyId, M(4)));

    expect(recognized).toEqual({ 1200: 0, 2200: 0, 2400: 0, 4200: 0, 4300: 0 });
  });
});
