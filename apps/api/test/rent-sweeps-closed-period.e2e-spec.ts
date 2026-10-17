import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { raiseDueFeesWithinTx } from '../src/contracts/contract-fees.util';
import { RentAccrualService } from '../src/contracts/rent-accrual.service';
import { ISOLATED_PASSWORD, IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

jest.setTimeout(300000);

/**
 * An instalment that falls in a closed period is skipped and counted by the rent and fee sweeps, by contract creation and by
 * renewal; it does not fail the whole run. Once the period is reopened the next sweep bills it.
 *
 * The clock is fixed on 15 October 2026, so August is in the past and November in the future; the sweep is then run as of
 * 15 November with November closed.
 */
describe('Rent sweeps count instalments in a closed period (e2e)', () => {
  const SETUP_DAY = new Date('2026-10-15T09:00:00.000Z');
  const SWEEP_NOW = new Date('2026-11-15T09:00:00.000Z');
  const SWEEP_AS_OF = new Date('2026-11-15T00:00:00.000Z');

  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const day = (value: Date) => value.toISOString().slice(0, 10);
  /** A status check that names the server's answer when it differs. */
  const is = (status: number) => (res: request.Response) => {
    if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  };

  const periodId = async (month: number, year: number): Promise<string> => {
    const years = (await auth(http().get('/fiscal-years')).expect(is(200))).body as { periods: { id: string; month: number; year: number }[] }[];
    const found = years.flatMap((y) => y.periods).find((p) => p.month === month && p.year === year);
    if (!found) throw new Error(`no period ${month}/${year} for the test company`);
    return found.id;
  };
  const closePeriod = async (id: string) => auth(http().patch(`/fiscal-years/periods/${id}/close`)).expect(is(200));
  const reopenPeriod = async (id: string) => auth(http().patch(`/fiscal-years/periods/${id}/reopen`)).send({ reason: 'reopened by the test' }).expect(is(200));

  const unitFor = async (tag: string): Promise<{ unitId: string; customerId: string }> => {
    const property = (await auth(http().post('/properties')).send({ name: `property ${tag} ${suffix}`, ownership: 'owned' }).expect(is(201))).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `CP-${tag}-${suffix}`, type: 'محل', rentMonthly: 1000 }).expect(is(201))).body as { id: string };
    return { unitId: unit.id, customerId: await createTenantCustomer(app, token, `tenant ${tag} ${suffix}`) };
  };
  const contractBody = (where: { unitId: string; customerId: string }, start: string, end: string, extra: Record<string, unknown> = {}) => ({
    ...where,
    value: 12000,
    cycle: 'monthly',
    start,
    end,
    classification: 'COMMERCIAL',
    vatInclusion: 'EXCLUSIVE',
    ...extra,
  });

  /** Due dates of the contract's instalments that carry an accrual row. */
  const accruedDueDays = async (contractId: string): Promise<string[]> => {
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.installment.findMany({ where: { contractId, accruals: { some: {} } }, select: { dueDate: true }, orderBy: { dueDate: 'asc' } }),
    );
    return rows.map((r) => day(r.dueDate));
  };
  /** Due dates of the instalments the contract's fee claims were raised for. */
  const feeClaimDueDays = async (contractId: string): Promise<string[]> => {
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.contractClaim.findMany({ where: { contractId, kind: 'FEE' }, select: { installment: { select: { dueDate: true } } } }),
    );
    return rows.map((r) => day(r.installment!.dueDate)).sort();
  };

  let augustId: string;
  let novemberId: string;
  let renewSourceId: string;
  let futureId: string;
  let createdInAugustId: string;
  let renewalId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    // Date only, so the driver and the HTTP server keep real timers; the company is born on this day and gets its 2026 year.
    jest.useFakeTimers({
      now: SETUP_DAY,
      advanceTimers: true,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    expect(day(new Date())).toBe(day(SETUP_DAY));
    company = await registerIsolatedCompany(app, 'closed-period');
    token = ((await http().post('/auth/login').send({ username: company.username, password: ISOLATED_PASSWORD }).expect(is(200))).body as { accessToken: string }).accessToken;
    augustId = await periodId(8, 2026);
    novemberId = await periodId(11, 2026);

    // Built while every period is open: a contract that ended in July, to be renewed into August, and one starting in November.
    renewSourceId = ((await auth(http().post('/contracts')).send(contractBody(await unitFor('source'), '2025-08-01', '2026-07-31')).expect(is(201))).body as { id: string }).id;
    futureId = ((await auth(http().post('/contracts'))
      .send(contractBody(await unitFor('future'), '2026-11-01', '2027-10-31', { fees: [{ label: 'parking', amount: 50 }] }))
      .expect(is(201))).body as { id: string }).id;
    expect(await accruedDueDays(futureId)).toEqual([]);

    await closePeriod(augustId);
  });

  afterAll(async () => {
    jest.useRealTimers();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('creates a contract whose first instalment falls in a closed period and leaves that instalment unbilled', async () => {
    const res = await auth(http().post('/contracts'))
      .send(contractBody(await unitFor('august'), '2026-08-01', '2027-07-31', { fees: [{ label: 'parking', amount: 50 }] }))
      .expect(is(201));
    createdInAugustId = (res.body as { id: string }).id;
    expect(await accruedDueDays(createdInAugustId)).toEqual(['2026-09-01', '2026-10-01']);
    expect(await feeClaimDueDays(createdInAugustId)).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('renews a contract into a closed period and leaves the renewal instalment there unbilled', async () => {
    const res = await auth(http().post(`/contracts/${renewSourceId}/renew`))
      .send({ start: '2026-08-01', end: '2027-07-31', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(is(201));
    renewalId = (res.body as { id: string }).id;
    expect(await accruedDueDays(renewalId)).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('counts every instalment a closed period holds back in the nightly rent sweep instead of failing it', async () => {
    await closePeriod(novemberId);
    const result = await app.get(RentAccrualService).runForCompany(company.companyId, SWEEP_NOW);
    // August and November of the contract created into August and of the renewal, and November of the future contract.
    expect(result).toEqual({ accrued: 0, skippedUnclassified: 0, blockedByPeriodLock: 5 });
    expect(await accruedDueDays(futureId)).toEqual([]);
  });

  it('counts the fees a closed period holds back in the fee sweep instead of failing it', async () => {
    const fees = await tenantPrisma.runInTenantContext(company.companyId, (tx) => raiseDueFeesWithinTx(tx, company.companyId, SWEEP_AS_OF));
    // August and November of the contract created into August, and November of the future contract.
    expect(fees).toEqual({ raised: 0, blockedByPeriodLock: 3 });
    expect(await feeClaimDueDays(futureId)).toEqual([]);
  });

  it('bills what was held back once the periods are reopened', async () => {
    await reopenPeriod(augustId);
    await reopenPeriod(novemberId);
    const result = await app.get(RentAccrualService).runForCompany(company.companyId, SWEEP_NOW);
    expect(result).toEqual({ accrued: 5, skippedUnclassified: 0, blockedByPeriodLock: 0 });
    expect(await accruedDueDays(createdInAugustId)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
    expect(await accruedDueDays(renewalId)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
    expect(await accruedDueDays(futureId)).toEqual(['2026-11-01']);
    expect(await feeClaimDueDays(createdInAugustId)).toEqual(['2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
    expect(await feeClaimDueDays(futureId)).toEqual(['2026-11-01']);
  });
});
