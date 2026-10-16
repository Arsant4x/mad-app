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
 * Closing a fiscal year and reopening one of its periods at the same moment.
 *
 * The interleaving is forced, not hoped for: a side transaction holds what the reopen needs once it has taken its
 * period, the year close is sent once the reopen stands there (read from pg_stat_activity), and only then is the hold
 * released. Each scenario runs more than once.
 */
describe('A year close and a period reopen at the same moment (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let yearId: string;
  let periodIds: string[];

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

  const inContext = <T>(read: (tx: Prisma.TransactionClient) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
      return read(tx);
    });

  /** Closing entries of the year that no reversal cancels, and the status of one period. */
  const stateOf = (periodId: string) =>
    inContext(async (tx) => {
      const [closings] = await tx.$queryRaw<{ active: bigint }[]>`
        SELECT (count(*) FILTER (WHERE "reversalOfId" IS NULL) - count(*) FILTER (WHERE "reversalOfId" IS NOT NULL))::bigint AS active
        FROM "journal_entries" WHERE "companyId" = ${company.companyId} AND "closingForFiscalYearId" = ${yearId}`;
      const [period] = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS status FROM "fiscal_periods" WHERE id = ${periodId}`;
      return { activeClosings: Number(closings.active), period: period.status };
    });

  const reopen = (periodId: string) => auth(http().patch(`/fiscal-years/periods/${periodId}/reopen`)).send({ reason: 'Correction during the race' });
  const closePeriod = (periodId: string) => auth(http().patch(`/fiscal-years/periods/${periodId}/close`));
  const closeYear = () => auth(http().post(`/fiscal-years/${yearId}/close`));

  /**
   * Holds with `take`, sends the reopen and waits until it stands on the hold, then sends the year close and waits
   * until it either answers or stands on a lock too, and releases.
   */
  const race = async (periodId: string, take: (tx: Prisma.TransactionClient) => Promise<number>) => {
    const held = await hold(take);
    const baseline = await waitingOnLocks();
    let closeDone = false;
    try {
      const a = reopen(periodId).then((r) => r);
      const reopenStood = await waitUntil(async () => (await waitingOnLocks()) >= baseline + 1);
      const b = closeYear().then((r) => {
        closeDone = true;
        return r;
      });
      await waitUntil(async () => closeDone || (await waitingOnLocks()) >= baseline + 2);
      await held.release();
      const [ra, rb] = await Promise.all([a, b]);
      return { probe: { held: held.rows > 0, reopenStood }, reopen: ra.status, close: rb.status, ...(await stateOf(periodId)) };
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

    company = await registerIsolatedCompany(app, 'year-close-race');
    // A past year defined before any posting in it, so the posting does not create the year itself.
    const year = (await auth(http().post('/fiscal-years')).send({ name: 'Race year 2024', start: '2024-01-01', end: '2024-12-31' }).expect(201)).body as {
      id: string;
      periods: { id: string }[];
    };
    yearId = year.id;
    periodIds = year.periods.map((p) => p.id);
    if (periodIds.length !== 12) throw new Error(`expected a twelve month fiscal year, got ${periodIds.length}`);

    const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
    const byCode = (code: string) => accounts.find((a) => a.code === code)!.id;
    await auth(http().post('/journal'))
      .send({ date: '2024-03-01', memo: 'Sale of the race year', lines: [{ accountId: byCode('1200'), debit: 900, credit: 0 }, { accountId: byCode('4100'), debit: 0, credit: 900 }] })
      .expect(201);
    for (const id of periodIds) await closePeriod(id).expect(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('a year close that meets a period reopen in progress waits for it and is refused, so no closing entry stands over an open period', async () => {
    const results = [];
    for (const periodId of periodIds.slice(1, 4)) {
      // The reopen takes its period and then stands before writing the new status; the close comes in meanwhile.
      results.push(await race(periodId, (tx) => tx.$executeRaw`LOCK TABLE "fiscal_periods" IN SHARE MODE`.then(() => 1)));
      // Back to every period closed with no closing entry: a reopen reverses any closing entry, then the close.
      await reopen(periodId).expect(200);
      await closePeriod(periodId).expect(200);
    }
    expect(results).toEqual(results.map(() => ({ probe: { held: true, reopenStood: true }, reopen: 200, close: 409, activeClosings: 0, period: 'OPEN' })));
  });

  it('closing a closed year again while a period is reopened is refused without a deadlock, and the closing entry is reversed', async () => {
    const results = [];
    for (const periodId of periodIds.slice(5, 8)) {
      await closeYear().expect(201);
      // The reopen takes its period and stands on the journal number of the reversal it writes; the close comes in meanwhile.
      results.push(
        await race(periodId, (tx) =>
          tx.$queryRaw<{ id: string }[]>`SELECT id FROM "document_sequences" WHERE "companyId" = ${company.companyId} AND "kind" = 'JE' FOR UPDATE`.then((r) => r.length),
        ),
      );
      await closePeriod(periodId).expect(200);
    }
    expect(results).toEqual(results.map(() => ({ probe: { held: true, reopenStood: true }, reopen: 200, close: 409, activeClosings: 0, period: 'OPEN' })));
  });
});
