import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyToday } from '../src/common/company-day.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Four isolated companies with one contract each; not measured yet, so a wide budget.
jest.setTimeout(240000);

/**
 * What a cancellation counts and closes.
 *
 * A settlement worked out from the upcoming installments counts what is still unpaid of them, a partly paid one by its
 * unpaid remainder. Fee claims raised for installments the cancellation voids are waived with them, and the contract's
 * fee lines end on the last day served.
 *
 * Every contract is residential (1,000 a month, no VAT); the parking fee is 100 a month plus 15% VAT.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const dayBefore = (d: Date) => addDays(d, -1);

interface E2eContract {
  id: string;
  status: string;
  settlementAmount: string | null;
  installments: { id: string; dueDate: string; amount: string; status: string }[];
  claims: { id: string; kind: string; status: string; installmentId: string | null }[];
  fees: { id: string; endedAt: string | null }[];
  claimsOutstanding: string;
}

const residential = { classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' };

describe('Cancellation remainders and fee claims (e2e)', () => {
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
    const c = await registerIsolatedCompany(app, `cancel-rest-${++seq}`);
    companies.push(c);
    today = await tenantPrisma.runInTenantContext(c.companyId, (tx) => companyToday(tx, c.companyId));
    return c;
  }

  async function balance(c: IsolatedCompany, code: string): Promise<number> {
    const accounts = (await as(c)(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[];
    return Number(accounts.find((a) => a.code === code)?.balance ?? 0);
  }

  async function makeContract(c: IsolatedCompany, body: Record<string, unknown>): Promise<E2eContract> {
    const n = `${tag}-${++seq}`;
    const property = await as(c)(http().post('/properties')).send({ name: `cancel rest property ${n}`, ownership: 'owned' }).expect(201);
    const unit = await as(c)(http().post('/units')).send({ propertyId: property.body.id, unitNo: `CR-${n}`, type: 'flat', rentMonthly: 1000 }).expect(201);
    const customerId = await createTenantCustomer(app, c.token, `cancel rest tenant ${n}`);
    const res = await as(c)(http().post('/contracts')).send({ ...residential, unitId: unit.body.id, customerId, cycle: 'monthly', ...body }).expect(201);
    return res.body as E2eContract;
  }

  const getContract = async (c: IsolatedCompany, id: string) => (await as(c)(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const installmentDue = (contract: E2eContract, due: Date) => contract.installments.find((i) => i.dueDate.slice(0, 10) === iso(due))!;
  const cancel = (c: IsolatedCompany, id: string, body: Record<string, unknown>) =>
    as(c)(http().post(`/contracts/${id}/cancel`)).send({ cancelReason: 'early exit', ...body });

  /** Twelve installments from last month; 400 of next month's is paid, so it is partly paid when the contract is cancelled on its due date. */
  async function partlyPaidContract(c: IsolatedCompany) {
    const created = await makeContract(c, { value: 12000, start: iso(M(-1)), end: iso(dayBefore(M(11))) });
    const target = installmentDue(created, M(1));
    await as(c)(http().post(`/contracts/${created.id}/payments`)).send({ date: iso(today), amount: 400, method: 'CASH', installmentId: target.id }).expect(201);
    expect(installmentDue(await getContract(c, created.id), M(1)).status).toBe('PARTIAL');
    return created;
  }

  it('a settlement from all the unpaid installments counts the unpaid remainder of a partly paid one', async () => {
    const c = await freshCompany();
    const created = await partlyPaidContract(c);

    const res = await cancel(c, created.id, { cancelDate: iso(M(1)), installmentDisposition: 'cancel', settlementBasis: 'all', unearnedDisposition: 'refund' }).expect(201);

    // From next month to the end: the 600 left of next month's installment and nine more at 1,000.
    expect(Number((res.body as E2eContract).settlementAmount)).toBe(9600);
  });

  it('a settlement from the next installments counts a partly paid one by its remainder, in due date order', async () => {
    const c = await freshCompany();
    const created = await partlyPaidContract(c);

    const res = await cancel(c, created.id, {
      cancelDate: iso(M(1)),
      installmentDisposition: 'cancel',
      settlementBasis: 'installments',
      settlementInstallments: 2,
      unearnedDisposition: 'refund',
    }).expect(201);

    expect(Number((res.body as E2eContract).settlementAmount)).toBe(1600);
  });

  it('fee claims of the installments a cancellation voids are waived and the fee lines end on the last day served', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 12000, start: iso(M(-3)), end: iso(dayBefore(M(9))), fees: [{ label: 'parking', amount: 100 }] });
    // Recorded today, effective in the middle of the month two months back: the fees of what fell due since are raised.
    const cancelDate = addDays(M(-2), 14);
    const voidedIds = new Set(created.installments.filter((i) => i.dueDate.slice(0, 10) >= iso(cancelDate)).map((i) => i.id));
    const raisedForVoided = created.claims.filter((cl) => cl.kind === 'FEE' && cl.installmentId && voidedIds.has(cl.installmentId)).length;
    const raisedBefore = created.claims.filter((cl) => cl.kind === 'FEE' && cl.installmentId && !voidedIds.has(cl.installmentId)).length;
    expect({ raisedForVoided: raisedForVoided > 0, raisedBefore }).toEqual({ raisedForVoided: true, raisedBefore: 2 });
    const vatBefore = await balance(c, '2200');

    await cancel(c, created.id, { cancelDate: iso(cancelDate), installmentDisposition: 'cancel', unearnedDisposition: 'income' }).expect(201);
    const contract = await getContract(c, created.id);
    const feeClaims = contract.claims.filter((cl) => cl.kind === 'FEE');

    expect({
      voided: feeClaims.filter((cl) => voidedIds.has(cl.installmentId!)).map((cl) => cl.status),
      kept: feeClaims.filter((cl) => !voidedIds.has(cl.installmentId!)).map((cl) => cl.status),
      outstanding: Number(contract.claimsOutstanding),
      // The rent is exempt, so only the waived fees move output VAT.
      vat: r2((await balance(c, '2200')) - vatBefore),
      feeEnds: contract.fees.map((f) => f.endedAt?.slice(0, 10) ?? null),
    }).toEqual({
      voided: Array(raisedForVoided).fill('WAIVED'),
      kept: ['OPEN', 'OPEN'],
      outstanding: 230,
      vat: r2(-15 * raisedForVoided),
      feeEnds: [iso(dayBefore(cancelDate))],
    });
  });

  it('keeping the installments due leaves their fee claims open, and the fee lines still end', async () => {
    const c = await freshCompany();
    const created = await makeContract(c, { value: 12000, start: iso(M(-3)), end: iso(dayBefore(M(9))), fees: [{ label: 'parking', amount: 100 }] });
    const cancelDate = addDays(M(-2), 14);
    const raised = created.claims.filter((cl) => cl.kind === 'FEE').length;

    await cancel(c, created.id, { cancelDate: iso(cancelDate), installmentDisposition: 'keep', unearnedDisposition: 'income' }).expect(201);
    const contract = await getContract(c, created.id);

    expect({
      statuses: contract.claims.filter((cl) => cl.kind === 'FEE').map((cl) => cl.status),
      feeEnds: contract.fees.map((f) => f.endedAt?.slice(0, 10) ?? null),
    }).toEqual({ statuses: Array(raised).fill('OPEN'), feeEnds: [iso(dayBefore(cancelDate))] });
  });
});
