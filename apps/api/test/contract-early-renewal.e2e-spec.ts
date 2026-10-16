import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyToday } from '../src/common/company-day.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Six contracts and their renewals on two isolated companies, each read through the ledger and the VAT return.
jest.setTimeout(300000);

/**
 * An early renewal (a renewal that starts on or before the original's end) ends the original on the day before the
 * renewal starts, in the same transaction. What the original billed for the days after that is undone: an unpaid
 * accrual is reversed, rent already received for those days becomes tenant credit carried to the renewal, and an
 * installment that crosses the cut keeps only its share of days. The reversal is dated on the later of the cut day
 * and the day the renewal is recorded, so a renewal recorded late never rewrites a past VAT period.
 *
 * Expected figures are worked out by hand in each case: a commercial exclusive month is 1,000 net, 150 VAT and
 * 1,150 gross; a residential year is 24,000 with no VAT.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const dayBefore = (d: Date) => addDays(d, -1);
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
const daysInMonth = (monthStart: Date) => new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0)).getUTCDate();
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));

interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string;
  status: string;
  serviceEnd: string | null;
}
interface E2ePayment {
  id: string;
  installmentId: string | null;
  amount: string;
  date: string;
  creditFromContractId?: string | null;
}
interface E2eContract {
  id: string;
  end: string;
  installments: E2eInstallment[];
  payments: E2ePayment[];
  claims: E2eClaim[];
  fees: E2eFee[];
  tenantCredit?: string;
}
interface RentSection {
  standard: number;
  standardVat: number;
  exempt: number;
  commissionStandard: number;
  commissionStandardVat: number;
  chargesStandard: number;
  chargesStandardVat: number;
}
interface E2eClaim {
  installmentId: string | null;
  status: string;
}
interface E2eFee {
  endedAt: string | null;
}

const LEDGER = ['1200', '2200', '2400', '4200', '2450', '2500', '4250'] as const;

describe('An early renewal ends the original contract on the day before it starts (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let closedCompany: IsolatedCompany;
  let seq = 0;
  let today: Date;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

  /** First day of the month `k` months from the company's current month. */
  const M = (k: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
  /** The server bills every installment due by now when a contract is created. */
  const billedNow = (due: Date) => due.getTime() <= Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'early-renew');
    closedCompany = await registerIsolatedCompany(app, 'early-renew-closed');
    today = await tenantPrisma.runInTenantContext(company.companyId, (tx) => companyToday(tx, company.companyId));
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await removeIsolatedCompany(app, closedCompany);
    await app.close();
  });

  async function ledger(c: IsolatedCompany): Promise<Record<string, number>> {
    const accounts = (await as(c)(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[];
    return Object.fromEntries(LEDGER.map((code) => [code, Number(accounts.find((a) => a.code === code)?.balance ?? 0)]));
  }
  async function rentOf(c: IsolatedCompany, month: Date): Promise<RentSection> {
    const body = (await as(c)(http().get('/obligations/vat-declaration')).query({ year: month.getUTCFullYear(), month: month.getUTCMonth() + 1 }).expect(200)).body as {
      rent: Record<string, string>;
    };
    return {
      standard: Number(body.rent.standard),
      standardVat: Number(body.rent.standardVat),
      exempt: Number(body.rent.exempt),
      commissionStandard: Number(body.rent.commissionStandard),
      commissionStandardVat: Number(body.rent.commissionStandardVat),
      chargesStandard: Number(body.rent.chargesStandard),
      chargesStandardVat: Number(body.rent.chargesStandardVat),
    };
  }
  const diff = (after: Record<string, number>, before: Record<string, number>) => Object.fromEntries(Object.keys(after).map((k) => [k, r2(after[k] - before[k])]));

  /** The ledger and the return for the given months, read together before and after one action. */
  async function measured(c: IsolatedCompany, months: Date[], action: () => Promise<unknown>) {
    const read = async () => ({ ledger: await ledger(c), rent: await Promise.all(months.map((m) => rentOf(c, m))) });
    const before = await read();
    const result = await action();
    const after = await read();
    return {
      result,
      ledger: diff(after.ledger, before.ledger),
      rent: after.rent.map((r, i) => diff(r as unknown as Record<string, number>, before.rent[i] as unknown as Record<string, number>)),
    };
  }

  async function makeUnit(c: IsolatedCompany, ownership: 'owned' | 'managed'): Promise<string> {
    const n = `${tag}-${++seq}`;
    const property = await as(c)(http().post('/properties'))
      .send({ name: `early renewal property ${n}`, ownership, ...(ownership === 'managed' ? { opRate: 10 } : {}) })
      .expect(201);
    const unit = await as(c)(http().post('/units')).send({ propertyId: property.body.id, unitNo: `ER-${n}`, type: 'shop', rentMonthly: 1000 }).expect(201);
    return unit.body.id as string;
  }

  async function makeContract(c: IsolatedCompany, unitId: string, body: Record<string, unknown>): Promise<string> {
    const customerId = await createTenantCustomer(app, c.token, `early renewal tenant ${tag}-${++seq}`);
    const res = await as(c)(http().post('/contracts')).send({ unitId, customerId, ...body }).expect(201);
    return res.body.id as string;
  }

  const getContract = async (c: IsolatedCompany, id: string) => (await as(c)(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const byDue = (contract: E2eContract) => [...contract.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const installmentDue = (contract: E2eContract, due: Date) => contract.installments.find((i) => i.dueDate.slice(0, 10) === iso(due))!;
  const billable = (contract: E2eContract) => r2(contract.installments.filter((i) => i.status !== 'CANCELLED').reduce((s, i) => s + Number(i.amount), 0));
  const cancelledFrom = (contract: E2eContract, cut: Date) =>
    contract.installments.filter((i) => i.dueDate.slice(0, 10) > iso(cut)).every((i) => i.status === 'CANCELLED');

  const commercial = { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' };
  const residential = { classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' };

  it('commercial monthly, cut inside an installment, recorded late: the original keeps its days and what it billed after the cut is reversed today', async () => {
    const unitId = await makeUnit(company, 'owned');
    const sourceId = await makeContract(company, unitId, { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-3)), end: iso(dayBefore(M(9))) });

    // The renewal starts on the 16th of the month two months back, so the original keeps 15 days of that month.
    const renewStart = addDays(M(-2), 15);
    const cut = dayBefore(renewStart);
    const kept = r2((1000 * 15) / daysInMonth(M(-2)));
    const keptGross = r2(kept + r2(kept * 0.15));
    const straddleGross = r2(1150 - keptGross);
    const straddleTax = r2((straddleGross * 150) / 1150);
    const billedAfterCut = [M(-1), M(0)].filter(billedNow).length;
    const reversedGross = r2(straddleGross + 1150 * billedAfterCut);
    const reversedTax = r2(straddleTax + 150 * billedAfterCut);
    const reversedNet = r2(reversedGross - reversedTax);

    const run = await measured(company, [M(0), M(-2)], () =>
      as(company)(http().post(`/contracts/${sourceId}/renew`))
        .send({ ...commercial, start: iso(renewStart), end: iso(dayBefore(addMonths(renewStart, 12))), cycle: 'annual' })
        .expect(201),
    );
    const source = await getContract(company, sourceId);

    expect({
      end: source.end.slice(0, 10),
      straddleAmount: Number(installmentDue(source, M(-2)).amount),
      laterCancelled: cancelledFrom(source, cut),
      billable: billable(source),
      ledger: { 1200: run.ledger['1200'], 2200: run.ledger['2200'], revenue: r2(run.ledger['2400'] + run.ledger['4200']) },
      returnToday: { standard: run.rent[0].standard, standardVat: run.rent[0].standardVat },
      returnRenewalMonth: { standard: run.rent[1].standard, standardVat: run.rent[1].standardVat },
    }).toEqual({
      end: iso(cut),
      straddleAmount: kept,
      laterCancelled: true,
      billable: r2(1000 + kept),
      // The renewal's single annual installment is billed at its start (13,800 gross, 1,800 VAT); the original's
      // billing after the cut comes off.
      ledger: { 1200: r2(13800 - reversedGross), 2200: r2(1800 - reversedTax), revenue: r2(12000 - reversedNet) },
      returnToday: { standard: -reversedNet, standardVat: -reversedTax },
      returnRenewalMonth: { standard: 12000, standardVat: 1800 },
    });
  });

  it('residential annual paid in advance: the share received for after the cut becomes tenant credit and pays the renewal', async () => {
    const unitId = await makeUnit(company, 'owned');
    const start = M(-6);
    const end = dayBefore(M(6));
    const sourceId = await makeContract(company, unitId, { ...residential, value: 24000, cycle: 'annual', start: iso(start), end: iso(end) });
    await as(company)(http().post(`/contracts/${sourceId}/payments`)).send({ date: iso(today), amount: 24000, method: 'CASH' }).expect(201);

    const renewStart = M(2);
    const cut = dayBefore(renewStart);
    const totalDays = daysBetween(start, end);
    const kept = r2((24000 * daysBetween(start, cut)) / totalDays);
    const credit = r2(24000 - kept);
    // The billing entry on the due date took one day of the year as revenue; the rest of the kept share is taken on the cut day.
    const earnedAtBilling = r2(24000 / totalDays);

    const run = await measured(company, [M(0), M(1)], () =>
      as(company)(http().post(`/contracts/${sourceId}/renew`))
        .send({ ...residential, start: iso(renewStart), end: iso(dayBefore(M(14))), cycle: 'annual' })
        .expect(201),
    );
    const renewal = await getContract(company, (run.result as request.Response).body.id as string);
    const source = await getContract(company, sourceId);
    const first = byDue(renewal)[0];

    expect({
      end: source.end.slice(0, 10),
      sourceInstallment: { amount: Number(source.installments[0].amount), status: source.installments[0].status },
      sourceCredit: Number(source.tenantCredit),
      transfers: renewal.payments.filter((p) => p.creditFromContractId === sourceId).map((p) => ({ installmentId: p.installmentId, amount: Number(p.amount), date: p.date.slice(0, 10) })),
      firstStatus: first.status,
      ledger: run.ledger,
      returns: run.rent.map((r) => ({ exempt: r.exempt, standardVat: r.standardVat })),
    }).toEqual({
      end: iso(cut),
      sourceInstallment: { amount: kept, status: 'PAID' },
      sourceCredit: 0,
      transfers: [{ installmentId: first.id, amount: credit, date: iso(cut) }],
      firstStatus: 'PARTIAL',
      // Nothing is billed or taxed twice: the credit leaves the original's deferred rent and enters the renewal's.
      ledger: { 1200: 0, 2200: 0, 2400: -r2(kept - earnedAtBilling), 4200: r2(kept - earnedAtBilling), 2450: 0, 2500: 0, 4250: 0 },
      returns: [
        { exempt: 0, standardVat: 0 },
        { exempt: 0, standardVat: 0 },
      ],
    });
  });

  it('operated property leased by the owner: installments after the cut are cancelled and the crossing one is shortened, with no posting', async () => {
    const unitId = await makeUnit(company, 'managed');
    const sourceId = await makeContract(company, unitId, {
      ...commercial,
      lessor: 'OWNER',
      ownerName: `owner ${tag}`,
      ownerVatNumber: '300000000000003',
      value: 12000,
      cycle: 'monthly',
      start: iso(M(-2)),
      end: iso(dayBefore(M(10))),
    });
    await as(company)(http().post(`/contracts/${sourceId}/payments`)).send({ date: iso(today), amount: 2300, method: 'CASH' }).expect(201);

    const renewStart = addDays(M(1), 15);
    const cut = dayBefore(renewStart);
    const kept = r2((1000 * 15) / daysInMonth(M(1)));

    const run = await measured(company, [M(0), M(1)], () =>
      as(company)(http().post(`/contracts/${sourceId}/renew`))
        .send({ ...commercial, lessor: 'OWNER', ownerName: `owner ${tag}`, ownerVatNumber: '300000000000003', start: iso(renewStart), end: iso(dayBefore(addMonths(renewStart, 12))) })
        .expect(201),
    );
    const source = await getContract(company, sourceId);
    const crossing = installmentDue(source, M(1));

    expect({
      end: source.end.slice(0, 10),
      crossing: { amount: Number(crossing.amount), serviceEnd: crossing.serviceEnd?.slice(0, 10) },
      laterCancelled: cancelledFrom(source, cut),
      billable: billable(source),
      ledger: run.ledger,
      commission: run.rent.map((r) => ({ standard: r.commissionStandard, vat: r.commissionStandardVat })),
    }).toEqual({
      end: iso(cut),
      crossing: { amount: kept, serviceEnd: iso(cut) },
      laterCancelled: true,
      billable: r2(3000 + kept),
      ledger: { 1200: 0, 2200: 0, 2400: 0, 4200: 0, 2450: 0, 2500: 0, 4250: 0 },
      commission: [
        { standard: 0, vat: 0 },
        { standard: 0, vat: 0 },
      ],
    });
  });

  it('renewal recorded late: the reversal and the waived fee claims are dated on the day it is recorded, not in the past month of the cut', async () => {
    const unitId = await makeUnit(company, 'owned');
    const sourceId = await makeContract(company, unitId, { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-3)), end: iso(dayBefore(M(9))) });
    // A parking fee of 100 (15 VAT) is claimed with every installment that has fallen due.
    await as(company)(http().post(`/contracts/${sourceId}/fees`)).send({ label: 'parking', amount: 100, effectiveFrom: iso(M(-3)) }).expect(201);

    const renewStart = M(-1);
    const cut = dayBefore(renewStart);
    const afterCut = [M(-1), M(0)].filter(billedNow);
    const billedAfterCut = afterCut.length;

    const run = await measured(company, [M(-2), M(-1), M(0)], () =>
      as(company)(http().post(`/contracts/${sourceId}/renew`))
        .send({ ...commercial, start: iso(renewStart), end: iso(dayBefore(M(11))), cycle: 'annual' })
        .expect(201),
    );
    const source = await getContract(company, sourceId);
    const afterCutIds = new Set(afterCut.map((d) => installmentDue(source, d).id));

    expect({
      end: source.end.slice(0, 10),
      laterCancelled: cancelledFrom(source, cut),
      feeEndedAt: source.fees.map((f) => f.endedAt?.slice(0, 10)),
      claimsAfterCut: source.claims.filter((c) => afterCutIds.has(c.installmentId ?? '')).map((c) => c.status),
      claimsKept: source.claims.filter((c) => !afterCutIds.has(c.installmentId ?? '')).map((c) => c.status),
      returns: run.rent.map((r) => ({ standard: r.standard, standardVat: r.standardVat, charges: r.chargesStandard, chargesVat: r.chargesStandardVat })),
      ledger: { 1200: run.ledger['1200'], 2200: run.ledger['2200'] },
    }).toEqual({
      end: iso(cut),
      laterCancelled: true,
      feeEndedAt: [iso(cut)],
      claimsAfterCut: afterCut.map(() => 'WAIVED'),
      claimsKept: ['OPEN', 'OPEN'],
      returns: [
        // The month of the cut is not touched.
        { standard: 0, standardVat: 0, charges: 0, chargesVat: 0 },
        // The renewal is billed at its start.
        { standard: 12000, standardVat: 1800, charges: 0, chargesVat: 0 },
        // What the original billed after the cut comes off in the month the renewal is recorded.
        { standard: -1000 * billedAfterCut, standardVat: -150 * billedAfterCut, charges: -100 * billedAfterCut, chargesVat: -15 * billedAfterCut },
      ],
      ledger: { 1200: r2(13800 - 1265 * billedAfterCut), 2200: r2(1800 - 165 * billedAfterCut) },
    });
  });

  it('a partly paid installment after the cut is cancelled and what was paid on it pays the renewal', async () => {
    const unitId = await makeUnit(company, 'owned');
    const sourceId = await makeContract(company, unitId, { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-1)), end: iso(dayBefore(M(11))) });
    const before = await getContract(company, sourceId);
    const later = installmentDue(before, M(2));
    // Dated on the UTC day, the day the server bills receipts on, so the 400 is billed when received.
    await as(company)(http().post(`/contracts/${sourceId}/payments`)).send({ date: iso(new Date()), amount: 400, method: 'CASH', installmentId: later.id }).expect(201);
    expect(installmentDue(await getContract(company, sourceId), M(2)).status).toBe('PARTIAL');

    const renewStart = M(2);
    const cut = dayBefore(renewStart);
    const run = await measured(company, [M(0), M(1)], () =>
      as(company)(http().post(`/contracts/${sourceId}/renew`))
        .send({ ...commercial, start: iso(renewStart), end: iso(dayBefore(M(14))) })
        .expect(201),
    );
    const renewal = await getContract(company, (run.result as request.Response).body.id as string);
    const source = await getContract(company, sourceId);
    const first = byDue(renewal)[0];

    expect({
      end: source.end.slice(0, 10),
      laterStatus: installmentDue(source, M(2)).status,
      laterCancelled: cancelledFrom(source, cut),
      sourceCredit: Number(source.tenantCredit),
      transfers: renewal.payments.filter((p) => p.creditFromContractId === sourceId).map((p) => ({ installmentId: p.installmentId, amount: Number(p.amount) })),
      firstStatus: first.status,
      ledger: run.ledger,
      returns: run.rent.map((r) => ({ standard: r.standard, standardVat: r.standardVat })),
    }).toEqual({
      end: iso(cut),
      laterStatus: 'CANCELLED',
      laterCancelled: true,
      sourceCredit: 0,
      transfers: [{ installmentId: first.id, amount: 400 }],
      firstStatus: 'PARTIAL',
      // The 400 was taxed when received (52.17); it moves to the renewal without a second tax point.
      ledger: { 1200: 0, 2200: 0, 2400: 0, 4200: 0, 2450: 0, 2500: 0, 4250: 0 },
      returns: [
        { standard: 0, standardVat: 0 },
        { standard: 0, standardVat: 0 },
      ],
    });
  });

  it('rent received for after the cut and not billed yet becomes tenant credit on its own date and pays the renewal', async () => {
    const unitId = await makeUnit(company, 'owned');
    const sourceId = await makeContract(company, unitId, { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-1)), end: iso(dayBefore(M(11))) });
    const later = installmentDue(await getContract(company, sourceId), M(3));
    // A receipt dated tomorrow is not billed until that day comes.
    const tomorrow = addDays(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())), 1);
    await as(company)(http().post(`/contracts/${sourceId}/payments`)).send({ date: iso(tomorrow), amount: 400, method: 'CASH', installmentId: later.id }).expect(201);

    const renewStart = M(2);
    const run = await measured(company, [], () =>
      as(company)(http().post(`/contracts/${sourceId}/renew`))
        .send({ ...commercial, start: iso(renewStart), end: iso(dayBefore(M(14))) })
        .expect(201),
    );
    const renewal = await getContract(company, (run.result as request.Response).body.id as string);
    const source = await getContract(company, sourceId);
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.rentAccrual.findMany({ where: { contractId: sourceId, kind: 'TENANT_CREDIT' }, select: { date: true, amountGross: true, amountTax: true } }),
    );

    expect({
      laterStatus: installmentDue(source, M(3)).status,
      credit: rows.map((r) => ({ date: iso(r.date), gross: Number(r.amountGross), tax: Number(r.amountTax) })),
      transfers: renewal.payments.filter((p) => p.creditFromContractId === sourceId).map((p) => ({ installmentId: p.installmentId, amount: Number(p.amount) })),
      ledger: run.ledger,
    }).toEqual({
      laterStatus: 'CANCELLED',
      // Taxed on the day it was received, 400 x 15/115.
      credit: [{ date: iso(tomorrow), gross: 400, tax: 52.17 }],
      transfers: [{ installmentId: byDue(renewal)[0].id, amount: 400 }],
      // The receivable the receipt settled is billed now; the net passes through 2450 into the renewal's deferred rent.
      ledger: { 1200: 400, 2200: 52.17, 2400: 347.83, 4200: 0, 2450: 0, 2500: 0, 4250: 0 },
    });
  });

  it('closed period: the month of the cut is closed and the renewal still records, with the reversal in the open month', async () => {
    const c = closedCompany;
    const unitId = await makeUnit(c, 'owned');
    const sourceId = await makeContract(c, unitId, { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-3)), end: iso(dayBefore(M(9))) });

    const renewStart = M(-1);
    const cut = dayBefore(renewStart);
    const years = (await as(c)(http().get('/fiscal-years')).expect(200)).body as { periods: { id: string; month: number; year: number }[] }[];
    const period = years.flatMap((y) => y.periods).find((p) => p.month === cut.getUTCMonth() + 1 && p.year === cut.getUTCFullYear())!;
    await as(c)(http().patch(`/fiscal-years/periods/${period.id}/close`)).expect(200);
    const billedAfterCut = [M(-1), M(0)].filter(billedNow).length;

    const run = await measured(c, [M(0)], () =>
      as(c)(http().post(`/contracts/${sourceId}/renew`)).send({ ...commercial, start: iso(renewStart), end: iso(dayBefore(M(11))), cycle: 'annual' }),
    );
    const source = await getContract(c, sourceId);

    expect({
      status: (run.result as request.Response).status,
      end: source.end.slice(0, 10),
      returnToday: { standard: run.rent[0].standard, standardVat: run.rent[0].standardVat },
    }).toEqual({
      status: 201,
      end: iso(cut),
      returnToday: { standard: -1000 * billedAfterCut, standardVat: -150 * billedAfterCut },
    });
  });

  it('an early renewal needs the delete permission on contracts, like a cancellation; a renewal after the end does not', async () => {
    const password = 'EarlyRenew123!';
    const template = await as(company)(http().post('/templates'))
      .send({ name: `renew only ${tag}`, allowedScreens: ['contracts'], screenActions: { contracts: ['view', 'add'] } })
      .expect(201);
    const username = `er-${tag}`;
    await as(company)(http().post('/company-users')).send({ name: 'renew only', username, password, permissionTemplateId: template.body.id, allBranches: true }).expect(201);
    const login = await http().post('/auth/login').send({ username, password }).expect(200);
    const asClerk = (r: request.Test) => r.set('Authorization', `Bearer ${login.body.accessToken as string}`);

    const early = await makeContract(company, await makeUnit(company, 'owned'), { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-1)), end: iso(dayBefore(M(11))) });
    const refused = await asClerk(http().post(`/contracts/${early}/renew`)).send({ ...commercial, start: iso(M(2)), end: iso(dayBefore(M(14))) });
    const untouched = await getContract(company, early);

    const onTime = await makeContract(company, await makeUnit(company, 'owned'), { ...commercial, value: 12000, cycle: 'monthly', start: iso(M(-1)), end: iso(dayBefore(M(11))) });
    const accepted = await asClerk(http().post(`/contracts/${onTime}/renew`)).send({ ...commercial, start: iso(M(11)), end: iso(dayBefore(M(23))) });

    expect({
      refused: { status: refused.status, message: refused.body.message },
      untouchedEnd: untouched.end.slice(0, 10),
      accepted: accepted.status,
    }).toEqual({
      refused: { status: 403, message: 'contracts.early_renewal_needs_cancel_permission' },
      untouchedEnd: iso(dayBefore(M(11))),
      accepted: 201,
    });
  });
});
