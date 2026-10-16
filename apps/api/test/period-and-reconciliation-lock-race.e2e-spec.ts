import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma, PrismaClient } from '@mad-app/db';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(240000);

/**
 * Closing a fiscal period or a bank reconciliation and the work that checks those locks run at the same moment.
 *
 * The interleaving is forced, not hoped for: a side transaction holds a row that the first request needs after it
 * has read the lock, the second request is sent once the first stands on that row (read from pg_stat_activity), and
 * only then is the row released. Each scenario runs more than once.
 */
describe('Period and reconciliation closes wait for postings in flight (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let revenueId: string;
  let expenseId: string;
  let periods: { id: string; month: number; year: number }[];
  let year: number;

  const pad = (n: number) => String(n).padStart(2, '0');

  const waitingOnLocks = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    return Number(rows[0].n);
  };

  const waitUntil = async (done: () => Promise<boolean>): Promise<boolean> => {
    for (let i = 0; i < 40; i++) {
      if (await done()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };

  /** Runs `take` in a side transaction of this company and keeps it open until `release` is called. */
  const hold = async (take: (tx: Prisma.TransactionClient) => Promise<number>) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let ready!: (n: number) => void;
    const taken = new Promise<number>((r) => (ready = r));
    const done = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
        ready(await take(tx));
        await released;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    const rows = await Promise.race([taken, done.then(() => -1)]);
    return {
      rows,
      release: async () => {
        release();
        await done;
      },
    };
  };

  const lockRow = (table: string, id: string) => (tx: Prisma.TransactionClient) =>
    tx.$queryRaw<{ id: string }[]>`SELECT id FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`.then((r) => r.length);

  const inContext = <T>(read: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
      return read(tx);
    });

  const entriesIn = (p: { month: number; year: number }) =>
    inContext(async (tx) => {
      const from = new Date(Date.UTC(p.year, p.month - 1, 1));
      const to = new Date(Date.UTC(p.year, p.month, 1));
      const rows = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "journal_entries" WHERE "companyId" = ${company.companyId} AND "date" >= ${from} AND "date" < ${to}`;
      return Number(rows[0].n);
    });

  const bankLinesThrough = (accountId: string, until: string) =>
    inContext(async (tx) => {
      const rows = await tx.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM "journal_lines" l JOIN "journal_entries" e ON e.id = l."journalEntryId"
        WHERE l."accountId" = ${accountId} AND e."date" <= ${new Date(until)}`;
      return Number(rows[0].n);
    });

  const newBank = async (name: string) =>
    (await auth(http().post('/banks')).send({ name, kind: 'BANK_ACCOUNT', openingBalance: 0, openingDate: `${year}-01-01` }).expect(201)).body as { id: string; accountId: string };

  /**
   * Holds `table`/`id`, sends `first` and waits until it stands on that row, then sends `second` and waits until it
   * either answers or stands on a lock too, and releases. `onSecond` runs as soon as the second request answers.
   */
  const race = async <T>(table: string, id: string, first: () => request.Test, second: () => request.Test, onSecond: () => Promise<T>) => {
    const held = await hold(lockRow(table, id));
    const baseline = await waitingOnLocks();
    let atSecond: T | undefined;
    let secondDone = false;
    try {
      const a = first().then((r) => r);
      const firstStood = await waitUntil(async () => (await waitingOnLocks()) >= baseline + 1);
      const b = second().then(async (r) => {
        atSecond = await onSecond();
        secondDone = true;
        return r;
      });
      await waitUntil(async () => secondDone || (await waitingOnLocks()) >= baseline + 2);
      await held.release();
      const [ra, rb] = await Promise.all([a, b]);
      return { probe: { held: held.rows, firstStood }, first: ra.status, second: rb.status, atSecond: atSecond as T };
    } finally {
      await held.release();
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'lock-race');
    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    revenueId = accounts.find((a) => a.code === '4100')!.id;
    expenseId = accounts.find((a) => a.code === '5300')!.id;
    const years = (await auth(http().get('/fiscal-years')).expect(200)).body as { periods: { id: string; month: number; year: number }[] }[];
    periods = years[0].periods;
    year = periods[0].year;
    if (periods.length < 12) throw new Error(`expected a twelve month fiscal year, got ${periods.length}`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a period close waits for a posting already in flight, so nothing lands in the month after it is closed', async () => {
    const results = [];
    for (const period of periods.slice(0, 3)) {
      const date = `${year}-${pad(period.month)}-15`;
      const lines = [{ accountId: revenueId, debit: 0, credit: 25 }, { accountId: expenseId, debit: 25, credit: 0 }];
      const r = await race(
        'accounts',
        revenueId,
        () => auth(http().post('/journal')).send({ date, memo: `In flight ${period.month}`, lines }),
        () => auth(http().patch(`/fiscal-years/periods/${period.id}/close`)),
        () => entriesIn(period),
      );
      results.push({ probe: r.probe, posting: r.first, close: r.second, addedAfterClose: (await entriesIn(period)) - r.atSecond });
    }
    expect(results).toEqual(results.map(() => ({ probe: { held: 1, firstStood: true }, posting: 201, close: 200, addedAfterClose: 0 })));
  });

  it('a posting that arrives while a period close is being committed waits for it and is refused', async () => {
    const results = [];
    for (const period of periods.slice(3, 6)) {
      const date = `${year}-${pad(period.month)}-15`;
      const held = await hold((tx) => tx.$executeRaw`UPDATE "fiscal_periods" SET "status" = 'CLOSED', "closedAt" = now() WHERE id = ${period.id}`);
      const baseline = await waitingOnLocks();
      let answered = false;
      try {
        const posting = auth(http().post('/journal'))
          .send({ date, memo: `Arriving ${period.month}`, lines: [{ accountId: expenseId, debit: 25, credit: 0 }, { accountId: revenueId, debit: 0, credit: 25 }] })
          .then((r) => {
            answered = true;
            return r;
          });
        await waitUntil(async () => answered || (await waitingOnLocks()) >= baseline + 1);
        await held.release();
        results.push({ held: held.rows, posting: (await posting).status, entries: await entriesIn(period) });
      } finally {
        await held.release();
      }
    }
    expect(results).toEqual(results.map(() => ({ held: 1, posting: 409, entries: 0 })));
  });

  it('a reconciliation close waits for a posting on the bank account already in flight', async () => {
    const until = `${year}-07-31`;
    const results = [];
    for (let i = 0; i < 3; i++) {
      const bank = await newBank(`Reconciliation race ${i}`);
      const lines = [{ accountId: bank.accountId, debit: 10, credit: 0 }, { accountId: revenueId, debit: 0, credit: 10 }];
      const r = await race(
        'accounts',
        revenueId,
        () => auth(http().post('/journal')).send({ date: `${year}-07-10`, memo: `Bank in flight ${i}`, lines }),
        () => auth(http().post(`/banks/${bank.id}/reconciliation/close`)).send({ until }),
        () => bankLinesThrough(bank.accountId, until),
      );
      results.push({ probe: r.probe, posting: r.first, close: r.second, addedAfterClose: (await bankLinesThrough(bank.accountId, until)) - r.atSecond });
    }
    expect(results).toEqual(results.map(() => ({ probe: { held: 1, firstStood: true }, posting: 201, close: 201, addedAfterClose: 0 })));
  });

  it('a reconciliation close waits for an unmatch already in flight and then counts the line it left pending', async () => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const bank = await newBank(`Unmatch race ${i}`);
      await auth(http().post('/journal'))
        .send({ date: `${year}-08-05`, memo: `Unmatch ledger ${i}`, lines: [{ accountId: bank.accountId, debit: 70, credit: 0 }, { accountId: revenueId, debit: 0, credit: 70 }] })
        .expect(201);
      const rowId = (await auth(http().post('/transactions')).send({ bankId: bank.id, date: `${year}-08-06`, description: `Statement ${i}`, amount: 70 }).expect(201)).body.id as string;
      const overview = (await auth(http().get(`/banks/${bank.id}/reconciliation`)).expect(200)).body as { ledger: { rows: { lineId: string }[] } };
      await auth(http().post(`/banks/${bank.id}/reconciliation/match`)).send({ transactionId: rowId, lineId: overview.ledger.rows[0].lineId }).expect(201);

      const r = await race(
        'bank_transactions',
        rowId,
        () => auth(http().post(`/banks/${bank.id}/reconciliation/unmatch`)).send({ transactionId: rowId }),
        () => auth(http().post(`/banks/${bank.id}/reconciliation/close`)).send({ until: `${year}-08-31` }),
        async () => null,
      );
      results.push({ probe: r.probe, unmatch: r.first, close: r.second });
    }
    expect(results).toEqual(results.map(() => ({ probe: { held: 1, firstStood: true }, unmatch: 201, close: 409 })));
  });

  it('a reconciliation close waits for an edit moving a line into its range and then counts that line', async () => {
    const results = [];
    for (let i = 0; i < 3; i++) {
      const bank = await newBank(`Edit race ${i}`);
      const rowId = (await auth(http().post('/transactions')).send({ bankId: bank.id, date: `${year}-09-20`, description: `Late line ${i}`, amount: 15 }).expect(201)).body.id as string;
      const r = await race(
        'bank_transactions',
        rowId,
        () => auth(http().patch(`/transactions/${rowId}`)).send({ date: `${year}-09-05` }),
        () => auth(http().post(`/banks/${bank.id}/reconciliation/close`)).send({ until: `${year}-09-10` }),
        async () => null,
      );
      results.push({ probe: r.probe, edit: r.first, close: r.second });
    }
    expect(results).toEqual(results.map(() => ({ probe: { held: 1, firstStood: true }, edit: 200, close: 409 })));
  });

  it('two payments into the same bank at the same moment both post (the shared lock does not deadlock them)', async () => {
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'Race customer' }).expect(201)).body.id as string;
    const invoiceOf = async (total: number) =>
      (
        await auth(http().post('/invoices'))
          .send({
            customerId,
            issueDate: `${year}-07-01`,
            dueDate: `${year}-07-31`,
            lines: [{ description: 'Race service', quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
          })
          .expect(201)
      ).body.id as string;
    const results = [];
    for (let i = 0; i < 3; i++) {
      const bank = await newBank(`Payment race ${i}`);
      const invoices = new Map([
        [100, await invoiceOf(100)],
        [200, await invoiceOf(200)],
      ]);
      const pay = (amount: number) =>
        auth(http().post('/payments')).send({ customerId, date: `${year}-07-20`, amount, method: 'BANK', bankId: bank.id, allocations: [{ invoiceId: invoices.get(amount), amount }] });
      const held = await hold(lockRow('accounts', bank.accountId));
      const baseline = await waitingOnLocks();
      try {
        const both = Promise.all([pay(100).then((r) => r), pay(200).then((r) => r)]);
        const stood = await waitUntil(async () => (await waitingOnLocks()) >= baseline + 2);
        await held.release();
        const replies = await both;
        const balance = (await auth(http().get('/banks')).expect(200)).body.find((b: { id: string }) => b.id === bank.id).balance;
        results.push({ held: held.rows, stood, codes: replies.map((x) => x.status), balance: Number(balance) });
      } finally {
        await held.release();
      }
    }
    expect(results).toEqual(results.map(() => ({ held: 1, stood: true, codes: [201, 201], balance: 300 })));
  });
});
