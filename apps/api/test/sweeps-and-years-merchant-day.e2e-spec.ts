import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { RentAccrualService } from '../src/contracts/rent-accrual.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ISOLATED_PASSWORD, IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

jest.setTimeout(300000);

/**
 * The rent sweeps, the contract and instalment statuses and the fiscal year choice read the merchant's day, not the UTC
 * day. The clock is fixed at 22:30 UTC, which is already the next day for a company three hours east of UTC, so an
 * instalment due on that next day is due now and one due the day before is late; and at 10:00 UTC, when an instalment
 * due that same day is not late yet.
 */
describe('Sweeps, statuses and fiscal years take the merchant day (e2e)', () => {
  const SETUP_MORNING = new Date('2026-10-15T09:00:00.000Z');
  const OCTOBER_LAST_NOON = new Date('2026-10-31T10:00:00.000Z');
  const OCTOBER_NIGHT = new Date('2026-10-31T22:30:00.000Z');
  const NOVEMBER_FIRST = '2026-11-01';
  const DECEMBER_NIGHT = new Date('2026-12-31T22:30:00.000Z');

  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let unposted: IsolatedCompany;
  let born: IsolatedCompany | undefined;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());
  const day = (value: Date) => value.toISOString().slice(0, 10);
  /** A status check that names the server's answer when it differs. */
  const is = (status: number) => (res: request.Response) => {
    if (res.status !== status) throw new Error(`expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
  };

  const signIn = async (who: IsolatedCompany): Promise<string> =>
    ((await http().post('/auth/login').send({ username: who.username, password: ISOLATED_PASSWORD }).expect(is(200))).body as { accessToken: string }).accessToken;

  /** Moves the clock to a fixed instant (Date only, so the driver and the HTTP server keep real timers) and signs in again. */
  const fixClock = async (instant: Date) => {
    jest.useRealTimers();
    jest.useFakeTimers({
      now: instant,
      advanceTimers: true,
      doNotFake: ['hrtime', 'nextTick', 'performance', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'],
    });
    expect(new Date().toISOString().slice(0, 13)).toBe(instant.toISOString().slice(0, 13));
    token = await signIn(company);
  };

  /** Checks the company's zone puts the instant on the given merchant day, before relying on it. */
  const expectMerchantDay = async (instant: Date, merchantDay: string) => {
    const { timeZone } = await app.get(PrismaService).company.findUniqueOrThrow({ where: { id: company.companyId }, select: { timeZone: true } });
    expect(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)).toBe(merchantDay);
  };

  const contract = async (tag: string, body: Record<string, unknown>): Promise<string> => {
    const property = (await auth(http().post('/properties')).send({ name: `property ${tag} ${suffix}`, ownership: 'owned' }).expect(is(201))).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `SY-${tag}-${suffix}`, type: 'محل', rentMonthly: 1000 }).expect(is(201))).body as { id: string };
    const tenantId = await createTenantCustomer(app, token, `tenant ${tag} ${suffix}`);
    return ((await auth(http().post('/contracts'))
      .send({ unitId: unit.id, customerId: tenantId, value: 12000, cycle: 'monthly', start: '2026-10-01', end: '2027-09-30', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', ...body })
      .expect(is(201))).body as { id: string }).id;
  };

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

  const contractStatus = async (contractId: string): Promise<string> => ((await auth(http().get(`/contracts/${contractId}`)).expect(is(200))).body as { status: string }).status;

  const instalmentStatus = async (contractId: string, dueDay: string): Promise<string> => {
    const body = (await auth(http().get(`/contracts/${contractId}`)).expect(is(200))).body as { installments: { dueDate: string; status: string }[] };
    return body.installments.find((i) => i.dueDate.slice(0, 10) === dueDay)!.status;
  };

  const fiscalYearStarts = async (companyId: string): Promise<string[]> => {
    const rows = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.fiscalYear.findMany({ where: { companyId }, select: { start: true }, orderBy: { start: 'asc' } }));
    return rows.map((r) => day(r.start));
  };

  // Created on 15 October and acted on later.
  let sweptId: string;
  let sweptFeeId: string;
  let addFeeId: string;
  let paidId: string;
  let renewSourceId: string;
  let upcomingRenewalId: string;
  let monthEndId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'sweeps-day');
    unposted = await registerIsolatedCompany(app, 'start-month-day');
    await fixClock(SETUP_MORNING);

    sweptId = await contract('swept', {});
    sweptFeeId = await contract('swept-fee', { fees: [{ label: 'parking', amount: 50 }] });
    addFeeId = await contract('add-fee', {});
    paidId = await contract('paid', {});
    renewSourceId = await contract('renew', { end: '2026-10-31' });
    const upcomingSourceId = await contract('upcoming', { end: '2026-10-31' });
    upcomingRenewalId = ((await auth(http().post(`/contracts/${upcomingSourceId}/renew`))
      .send({ start: NOVEMBER_FIRST, end: '2027-10-31', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })
      .expect(is(201))).body as { id: string }).id;
    monthEndId = await contract('month-end', { start: '2026-10-31', end: '2027-10-30' });

    // What fell due on 1 October is accrued when the contract is created; 1 November is still ahead.
    expect(await accruedDueDays(sweptId)).toEqual(['2026-10-01']);
    expect(await contractStatus(upcomingRenewalId)).toBe('UPCOMING');
  });

  afterAll(async () => {
    jest.useRealTimers();
    await removeIsolatedCompany(app, born);
    await removeIsolatedCompany(app, unposted);
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  describe('at 10:00 UTC on 31 October', () => {
    beforeAll(async () => {
      await fixClock(OCTOBER_LAST_NOON);
      await expectMerchantDay(OCTOBER_LAST_NOON, '2026-10-31');
    });

    it('keeps an instalment due today due, not late', async () => {
      expect(await instalmentStatus(monthEndId, '2026-10-31')).toBe('DUE');
    });
  });

  describe('at 22:30 UTC on 31 October', () => {
    beforeAll(async () => {
      await fixClock(OCTOBER_NIGHT);
      await expectMerchantDay(OCTOBER_NIGHT, NOVEMBER_FIRST);
    });

    it('turns an instalment due on the merchant day before late', async () => {
      expect(await instalmentStatus(monthEndId, '2026-10-31')).toBe('LATE');
    });

    it('accrues the instalment due on the merchant day in the nightly sweep', async () => {
      await app.get(RentAccrualService).runForCompany(company.companyId);
      expect(await accruedDueDays(sweptId)).toEqual(['2026-10-01', NOVEMBER_FIRST]);
    });

    it('raises the fee of the instalment due on the merchant day in the nightly sweep', async () => {
      await app.get(RentAccrualService).runForCompany(company.companyId);
      expect(await feeClaimDueDays(sweptFeeId)).toEqual(['2026-10-01', NOVEMBER_FIRST]);
    });

    it('accrues and bills a contract created now up to the merchant day', async () => {
      const createdId = await contract('created-now', { fees: [{ label: 'cleaning', amount: 30 }] });
      expect(await accruedDueDays(createdId)).toEqual(['2026-10-01', NOVEMBER_FIRST]);
      expect(await feeClaimDueDays(createdId)).toEqual(['2026-10-01', NOVEMBER_FIRST]);
    });

    it('raises a fee added now for the instalment due on the merchant day', async () => {
      const fee = (await auth(http().post(`/contracts/${addFeeId}/fees`)).send({ label: 'storage', amount: 40 }).expect(is(201))).body as { raisedClaims: number };
      expect(fee.raisedClaims).toBe(1);
      expect(await feeClaimDueDays(addFeeId)).toEqual([NOVEMBER_FIRST]);
    });

    it('accrues the instalment a receipt dated the merchant day pays', async () => {
      const body = (await auth(http().get(`/contracts/${paidId}`)).expect(is(200))).body as { installments: { id: string; dueDate: string }[] };
      const november = body.installments.find((i) => i.dueDate.slice(0, 10) === NOVEMBER_FIRST)!;
      await auth(http().post(`/contracts/${paidId}/payments`)).send({ installmentId: november.id, date: NOVEMBER_FIRST, amount: 1150, method: 'CASH' }).expect(is(201));
      expect(await accruedDueDays(paidId)).toEqual(['2026-10-01', NOVEMBER_FIRST]);
    });

    it('creates a renewal starting on the merchant day as live and accrues its first instalment', async () => {
      const renewal = (await auth(http().post(`/contracts/${renewSourceId}/renew`))
        .send({ start: NOVEMBER_FIRST, end: '2027-10-31', classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })
        .expect(is(201))).body as { id: string; status: string };
      expect(renewal.status).toBe('DUE');
      expect(await accruedDueDays(renewal.id)).toEqual([NOVEMBER_FIRST]);
    });

    it('turns an upcoming renewal live on the merchant day its term starts', async () => {
      expect(await contractStatus(upcomingRenewalId)).toBe('DUE');
    });
  });

  describe('at 22:30 UTC on 31 December', () => {
    beforeAll(async () => {
      await fixClock(DECEMBER_NIGHT);
      await expectMerchantDay(DECEMBER_NIGHT, '2027-01-01');
    });

    it('gives a company born now the fiscal year of the merchant day', async () => {
      born = await registerIsolatedCompany(app, 'birth-year-day');
      expect(await fiscalYearStarts(born.companyId)).toEqual(['2027-01-01']);
    });

    it('rebuilds the calendar from the fiscal year of the merchant day when the start month is set', async () => {
      const ownerToken = await signIn(unposted);
      await http().patch('/fiscal-years/start-month').set('Authorization', `Bearer ${ownerToken}`).send({ month: 1 }).expect(is(204));
      expect(await fiscalYearStarts(unposted.companyId)).toEqual(['2027-01-01']);
    });
  });
});
