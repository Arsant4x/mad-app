import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { companyToday } from '../src/common/company-day.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { accrueDueWithinTx, AccrualSweepResult } from '../src/journal/rent-accrual.util';
import { raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Three forced overlaps, two of them with a hold of a few seconds inside the sweep.
jest.setTimeout(240000);

/**
 * Rent accrual against a receipt, and a receipt against a cancellation, on the same contract at the same time.
 *
 * The sweep reads the open installments once and then writes each one's tax points. Two races hold the sweep inside the
 * database while a receipt on the same installment is recorded: once between its first read and its writes, once right
 * after it read the installment again before billing it. Either way the installment's tax point must be written once.
 * A third race holds the contract row while a cancellation and then a receipt are sent: the receipt must see the
 * cancellation.
 *
 * The contract is commercial and VAT exclusive: 1,000 a month plus 150 VAT, so each installment is 1,150 gross.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

const POSITIVE_KINDS = ['DUE', 'PREPAYMENT', 'UNLINKED', 'TENANT_CREDIT', 'CREDIT_TRANSFER'];

interface E2eContract {
  id: string;
  no: string;
  installments: { id: string; dueDate: string }[];
}

/**
 * The same transaction client, except that the first call of `installment[method]` reports itself and then sleeps in
 * the database before returning, so the sweep resumes with what that call read.
 */
function holdAfterFirstRead(tx: Prisma.TransactionClient, method: 'findMany' | 'findUniqueOrThrow', seconds: number, onRead: () => void): Prisma.TransactionClient {
  let held = false;
  const bind = (target: object, prop: string | symbol) => {
    const value = Reflect.get(target, prop) as unknown;
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  };
  const installment = new Proxy(tx.installment, {
    get(target, prop) {
      if (prop !== method) return bind(target, prop);
      return async (...args: unknown[]) => {
        const rows = await (target[method] as (...a: unknown[]) => Promise<unknown>)(...args);
        if (!held) {
          held = true;
          onRead();
          await tx.$queryRaw`SELECT 1 FROM pg_sleep(${seconds})`;
        }
        return rows;
      };
    },
  });
  return new Proxy(tx, { get: (target, prop) => (prop === 'installment' ? installment : bind(target, prop)) });
}

describe('Rent accrual and receipts on the same contract at the same time (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let company: IsolatedCompany;
  let race: ReturnType<typeof raceHarness>;
  let today: Date;
  let seq = 0;
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const ar = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'rent-accrual-race');
    race = raceHarness(() => company.companyId, holdClient, probe);
    today = await tenantPrisma.runInTenantContext(company.companyId, (tx) => companyToday(tx, company.companyId));
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  /** A year's contract starting in two days, so nothing of it is billed when it is created. */
  async function makeContract(): Promise<E2eContract> {
    const n = `${tag}-${++seq}`;
    const property = await auth(http().post('/properties')).send({ name: `accrual race property ${n}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `AR-${n}`, type: 'shop', rentMonthly: 1000 }).expect(201);
    const customerId = await createTenantCustomer(app, company.token, `accrual race tenant ${n}`);
    const start = addDays(today, 2);
    const res = await auth(http().post('/contracts'))
      .send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.body.id, customerId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(addDays(addMonths(start, 12), -1)) })
      .expect(201);
    return res.body as E2eContract;
  }

  const firstInstallment = (c: E2eContract) => [...c.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const pay = (contractId: string, installmentId: string, amount: number) =>
    auth(http().post(`/contracts/${contractId}/payments`)).send({ date: iso(today), amount, method: 'CASH', installmentId });

  /** What the installment carries as billed: its accrual rows, its running totals, and the receivable their entries debited. */
  const billed = (installmentId: string) =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
      const rows = await tx.rentAccrual.findMany({ where: { installmentId }, select: { kind: true, amountGross: true, amountTax: true, journalEntryId: true } });
      const positive = rows.filter((r) => POSITIVE_KINDS.includes(r.kind));
      const entryIds = rows.map((r) => r.journalEntryId).filter((id): id is string => id !== null);
      const receivable = await tx.journalLine.aggregate({ where: { journalEntryId: { in: entryIds }, account: { code: '1200' } }, _sum: { debit: true } });
      const counters = await tx.installment.findUniqueOrThrow({ where: { id: installmentId }, select: { baseAccruedGross: true, baseAccruedTax: true } });
      return {
        gross: r2(positive.reduce((s, r) => s + Number(r.amountGross), 0)),
        tax: r2(positive.reduce((s, r) => s + Number(r.amountTax), 0)),
        accruedGross: r2(Number(counters.baseAccruedGross)),
        accruedTax: r2(Number(counters.baseAccruedTax)),
        receivableDebited: r2(Number(receivable._sum.debit ?? 0)),
      };
    });

  /**
   * Runs the sweep for one contract, held after the first call of `installment[method]`, and sends a full receipt on the
   * installment 150 ms after that call returned. Returns when both are done, with the moments each finished.
   */
  async function sweepAgainstReceipt(contract: E2eContract, installmentId: string, method: 'findMany' | 'findUniqueOrThrow', holdSeconds: number) {
    const asOf = addDays(new Date(firstInstallment(contract).dueDate), 1);
    let markRead: () => void = () => undefined;
    const sweepRead = new Promise<void>((done) => {
      markRead = done;
    });
    let sweepDoneAt = 0;
    const sweep = tenantPrisma
      .runInTenantContext(company.companyId, (tx) => accrueDueWithinTx(holdAfterFirstRead(tx, method, holdSeconds, markRead), company.companyId, asOf, contract.id), {
        timeout: 60000,
        maxWait: 10000,
      })
      .then((r: AccrualSweepResult) => {
        sweepDoneAt = Date.now();
        return r;
      });
    // A sweep that never makes that call still lets the receipt go once it is done.
    void sweep.finally(markRead).catch(() => undefined);
    await sweepRead;
    await sleep(150);
    const receipt = await pay(contract.id, installmentId, 1150);
    const receiptDoneAt = Date.now();
    const swept = await sweep;
    return { receipt, receiptDoneAt, sweepDoneAt, swept };
  }

  it('a sweep that read the installment before a receipt was committed bills its tax point once', async () => {
    const contract = await makeContract();
    const target = firstInstallment(contract);

    const run = await sweepAgainstReceipt(contract, target.id, 'findMany', 3);

    expect({
      receipt: run.receipt.status,
      // The receipt was recorded while the sweep stood between its read and its writes.
      receiptFirst: run.receiptDoneAt < run.sweepDoneAt,
      blockedByPeriodLock: run.swept.blockedByPeriodLock,
      billed: await billed(target.id),
    }).toEqual({
      receipt: 201,
      receiptFirst: true,
      blockedByPeriodLock: 0,
      billed: { gross: 1150, tax: 150, accruedGross: 1150, accruedTax: 150, receivableDebited: 1150 },
    });
  });

  it('a receipt sent while the sweep is billing the installment waits for it and bills nothing more', async () => {
    const contract = await makeContract();
    const target = firstInstallment(contract);

    // Held right after the sweep read the installment to bill it; the receipt's transaction must stay under its 5 s limit.
    const run = await sweepAgainstReceipt(contract, target.id, 'findUniqueOrThrow', 2);

    expect({
      receipt: run.receipt.status,
      receiptWaited: run.receiptDoneAt >= run.sweepDoneAt,
      blockedByPeriodLock: run.swept.blockedByPeriodLock,
      billed: await billed(target.id),
    }).toEqual({
      receipt: 201,
      receiptWaited: true,
      blockedByPeriodLock: 0,
      billed: { gross: 1150, tax: 150, accruedGross: 1150, accruedTax: 150, receivableDebited: 1150 },
    });
  });

  it('the database keeps one due tax point per installment', async () => {
    const contract = await makeContract();
    const target = firstInstallment(contract);
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => accrueDueWithinTx(tx, company.companyId, addDays(new Date(target.dueDate), 1), contract.id), { timeout: 60000 });

    const second = tenantPrisma.runInTenantContext(company.companyId, async (tx) => {
      const due = await tx.rentAccrual.findFirstOrThrow({ where: { installmentId: target.id, kind: 'DUE' } });
      const { id: _id, createdAt: _createdAt, ...copy } = due;
      return tx.rentAccrual.create({ data: copy as unknown as Prisma.RentAccrualUncheckedCreateInput });
    });

    await expect(second).rejects.toMatchObject({ code: 'P2002' });
    expect(await billed(target.id)).toEqual({ gross: 1150, tax: 150, accruedGross: 1150, accruedTax: 150, receivableDebited: 1150 });
  });

  it('a receipt sent while the contract is being cancelled sees the cancellation', async () => {
    const contract = await makeContract();
    const target = firstInstallment(contract);
    let calls = 0;
    const fire = () =>
      calls++ === 0
        ? auth(http().post(`/contracts/${contract.id}/cancel`)).send({ cancelReason: 'early exit', cancelDate: iso(today), installmentDisposition: 'cancel', unearnedDisposition: 'refund' })
        : pay(contract.id, target.id, 1150);

    const result = await race.raceBehindLock('contracts', contract.id, fire);
    const [cancelled, receipt] = result.responses;
    const receipts = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.rentPayment.count({ where: { contractId: contract.id } }));

    expect({
      race: { locked: result.locked, held: result.heldWhenFired, blocked: result.blocked },
      cancel: cancelled.status,
      receipt: receipt.status,
      refusal: receipt.body?.message,
      receipts,
    }).toEqual({
      race: { locked: 1, held: 'held', blocked: 2 },
      cancel: 201,
      receipt: 409,
      refusal: ar(MSG.contract_cancelled_no_payment),
      receipts: 0,
    });
  });
});
