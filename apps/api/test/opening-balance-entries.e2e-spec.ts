import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Opening balances must be *posted*, never seeded (CLAUDE.md rule 11 / the
 * named 3.8 debt): a non-zero opening balance becomes a real balanced قيد
 * افتتاحي against the 3900 opening-balances equity account, edits adjust via
 * a delta entry (no silent mutation), the trial balance therefore carries it,
 * and period locks govern it like any other posting.
 *
 * Runs against demo-company-b. The fiscal-calendar block creates a year
 * covering today and must clean it up — a leftover calendar would constrain
 * every other suite's postings by date (same discipline as
 * fiscal-period-lock.e2e-spec.ts).
 */
describe('Opening balances as posted journal entries (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const createdYearIds: string[] = [];
  const createdAccountIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    token = login.body.accessToken;
  }, 30000);

  afterAll(async () => {
    for (const id of createdYearIds) {
      await request(app.getHttpServer()).delete(`/fiscal-years/${id}`).set('Authorization', `Bearer ${token}`);
    }
    // Deleting an account also deletes its opening entries (reversing 3900),
    // so this leaves no trace in the shared demo company.
    for (const id of createdAccountIds) {
      await request(app.getHttpServer()).delete(`/accounts/${id}`).set('Authorization', `Bearer ${token}`);
    }
    await app.close();
  });

  const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function createAccount(body: Record<string, unknown>, expected = 201) {
    const res = await request(app.getHttpServer()).post('/accounts').set('Authorization', `Bearer ${token}`).send(body).expect(expected);
    if (expected === 201) createdAccountIds.push(res.body.id);
    return res.body;
  }

  async function listAccounts() {
    const res = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return res.body as { id: string; code: string; type: string; openingBalance: string; balance: string }[];
  }

  // The journal list is paginated now, and the shared demo company has
  // thousands of accumulated entries — so the entries for one account are
  // located through the server-side search. Every account this suite creates
  // has a unique suffixed code, and the journal search matches line account
  // codes, so searching by code returns exactly this account's entries.
  async function listJournal(search: string) {
    const res = await request(app.getHttpServer()).get('/journal').query({ search, pageSize: 100 }).set('Authorization', `Bearer ${token}`).expect(200);
    return res.body.items as {
      id: string;
      no: string;
      date: string;
      memo: string;
      auto: boolean;
      totalDebit: string;
      totalCredit: string;
      openingForAccountId: string | null;
      lines: { accountId: string; debit: string; credit: string; account: { code: string } }[];
    }[];
  }

  const entriesFor = (journal: Awaited<ReturnType<typeof listJournal>>, accountId: string) =>
    journal.filter((e) => e.openingForAccountId === accountId);

  it('posts a balanced قيد افتتاحي against 3900 when an account is created with an opening balance', async () => {
    const code = `OB-A-${suffix()}`;
    const account = await createAccount({ code, name: 'أصل افتتاحي', type: 'asset', openingBalance: 750 });

    // The response's balance already reflects the posted entry — the ledger
    // is the only thing that moved it (the account row is born at 0).
    expect(Number(account.balance)).toBe(750);
    expect(Number(account.openingBalance)).toBe(750);

    const equity = (await listAccounts()).find((a) => a.code === '3900');
    expect(equity).toBeDefined();
    expect(equity!.type).toBe('equity');

    const entries = entriesFor(await listJournal(account.code), account.id);
    expect(entries).toHaveLength(1);
    const [entry] = entries;
    expect(entry.auto).toBe(true);
    expect(entry.memo).toContain('قيد افتتاحي');
    expect(entry.memo).toContain(code);
    expect(Number(entry.totalDebit)).toBe(750);
    expect(Number(entry.totalCredit)).toBe(750);

    // Asset (debit-normal): the account is debited, 3900 is credited.
    const accountLine = entry.lines.find((l) => l.accountId === account.id)!;
    const equityLine = entry.lines.find((l) => l.account.code === '3900')!;
    expect(Number(accountLine.debit)).toBe(750);
    expect(Number(accountLine.credit)).toBe(0);
    expect(Number(equityLine.credit)).toBe(750);
    expect(Number(equityLine.debit)).toBe(0);
  });

  it('credits the account and debits 3900 for a credit-normal (liability) opening balance', async () => {
    const account = await createAccount({ code: `OB-L-${suffix()}`, name: 'خصم افتتاحي', type: 'liability', openingBalance: 300 });
    expect(Number(account.balance)).toBe(300);

    const [entry] = entriesFor(await listJournal(account.code), account.id);
    const accountLine = entry.lines.find((l) => l.accountId === account.id)!;
    expect(Number(accountLine.credit)).toBe(300);
    expect(Number(accountLine.debit)).toBe(0);
  });

  it('flips the sides for a negative opening balance instead of posting negative amounts', async () => {
    const account = await createAccount({ code: `OB-N-${suffix()}`, name: 'أصل بافتتاحي سالب', type: 'asset', openingBalance: -200 });
    expect(Number(account.balance)).toBe(-200);

    const [entry] = entriesFor(await listJournal(account.code), account.id);
    expect(Number(entry.totalDebit)).toBe(200);
    const accountLine = entry.lines.find((l) => l.accountId === account.id)!;
    expect(Number(accountLine.credit)).toBe(200);
    expect(Number(accountLine.debit)).toBe(0);
  });

  it('posts no entry at all for a zero opening balance', async () => {
    const account = await createAccount({ code: `OB-Z-${suffix()}`, name: 'بلا افتتاحي', type: 'expense' });
    expect(Number(account.balance)).toBe(0);
    expect(entriesFor(await listJournal(account.code), account.id)).toHaveLength(0);
  });

  it('carries the opening amounts into the trial balance, which stays balanced', async () => {
    const code = `OB-TB-${suffix()}`;
    const account = await createAccount({ code, name: 'حساب ميزان', type: 'asset', openingBalance: 1234.56 });

    const res = await request(app.getHttpServer()).get('/reports/trial-balance').set('Authorization', `Bearer ${token}`).expect(200);
    const row = res.body.rows.find((r: { code: string }) => r.code === code);
    expect(row).toBeDefined();
    expect(row.debitTotal).toBe(1234.56);
    expect(row.balanceDebit).toBe(1234.56);
    expect(res.body.rows.some((r: { code: string }) => r.code === '3900')).toBe(true);
    expect(res.body.balanced).toBe(true);
    // The account row exists in the report *because* of a real posted line —
    // the report reads journal lines only, so this is the ledger speaking.
    expect(account.id).toBeDefined();
  });

  it('adjusts an edited opening balance through a delta entry — the original entry is untouched', async () => {
    const code = `OB-E-${suffix()}`;
    const account = await createAccount({ code, name: 'حساب معدَّل', type: 'asset', openingBalance: 750 });

    await request(app.getHttpServer()).patch(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).send({ openingBalance: 1000 }).expect(200);

    let entries = entriesFor(await listJournal(account.code), account.id);
    expect(entries).toHaveLength(2);
    const original = entries.find((e) => Number(e.totalDebit) === 750)!;
    const delta = entries.find((e) => Number(e.totalDebit) === 250)!;
    expect(original.memo).toContain('قيد افتتاحي');
    expect(delta.memo).toContain('تعديل الرصيد الافتتاحي');
    expect(delta.auto).toBe(true);

    let after = (await listAccounts()).find((a) => a.id === account.id)!;
    expect(Number(after.openingBalance)).toBe(1000);
    expect(Number(after.balance)).toBe(1000);

    // Downward past the original: a third entry on the flipped side, never an
    // edit of history.
    await request(app.getHttpServer()).patch(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).send({ openingBalance: 400 }).expect(200);

    entries = entriesFor(await listJournal(account.code), account.id);
    expect(entries).toHaveLength(3);
    const downward = entries.find((e) => Number(e.totalDebit) === 600)!;
    const accountLine = downward.lines.find((l) => l.accountId === account.id)!;
    expect(Number(accountLine.credit)).toBe(600);

    after = (await listAccounts()).find((a) => a.id === account.id)!;
    expect(Number(after.openingBalance)).toBe(400);
    expect(Number(after.balance)).toBe(400);
  });

  it('posts nothing when the opening balance is "edited" to its current value', async () => {
    const account = await createAccount({ code: `OB-S-${suffix()}`, name: 'حساب ساكن', type: 'revenue', openingBalance: 90 });
    await request(app.getHttpServer()).patch(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).send({ openingBalance: 90 }).expect(200);
    expect(entriesFor(await listJournal(account.code), account.id)).toHaveLength(1);
  });

  it('refuses an opening balance on the 3900 counterpart account itself', async () => {
    const equity = (await listAccounts()).find((a) => a.code === '3900')!;
    const res = await request(app.getHttpServer())
      .patch(`/accounts/${equity.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalance: 999 })
      .expect(409);
    expect(res.body.message).toContain('3900');
  });

  it('deletes an account together with its opening entries, restoring 3900 exactly', async () => {
    const equityBefore = Number((await listAccounts()).find((a) => a.code === '3900')!.balance);

    const account = await createAccount({ code: `OB-D-${suffix()}`, name: 'حساب مؤقت', type: 'asset', openingBalance: 500 });
    await request(app.getHttpServer()).patch(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).send({ openingBalance: 650 }).expect(200);
    expect(Number((await listAccounts()).find((a) => a.code === '3900')!.balance)).toBe(equityBefore + 650);

    await request(app.getHttpServer()).delete(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).expect(204);

    const journal = await listJournal(account.code);
    expect(entriesFor(journal, account.id)).toHaveLength(0);
    expect(Number((await listAccounts()).find((a) => a.code === '3900')!.balance)).toBe(equityBefore);
  });

  it('dates opening entries at the fiscal-year start, and lets a closed period refuse them atomically', async () => {
    const year = await request(app.getHttpServer())
      .post('/fiscal-years')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'سنة القيود الافتتاحية', start: '2026-01-01', end: '2026-12-31' })
      .expect(201);
    createdYearIds.push(year.body.id);
    const january = year.body.periods.find((p: { month: number }) => p.month === 1);

    try {
      const account = await createAccount({ code: `OB-F-${suffix()}`, name: 'حساب مؤرَّخ', type: 'asset', openingBalance: 900 });
      const [entry] = entriesFor(await listJournal(account.code), account.id);
      expect(entry.date.startsWith('2026-01-01')).toBe(true);

      await request(app.getHttpServer()).patch(`/fiscal-years/periods/${january.id}/close`).set('Authorization', `Bearer ${token}`).expect(200);

      // Closed opening period: creating an account with an opening balance is
      // refused — and atomically, the account row must not survive either.
      const blockedCode = `OB-F-BLOCKED-${suffix()}`;
      const blocked = await request(app.getHttpServer())
        .post('/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: blockedCode, name: 'مرفوض', type: 'asset', openingBalance: 100 })
        .expect(409);
      expect(blocked.body.message).toContain('مقفلة');
      expect((await listAccounts()).some((a) => a.code === blockedCode)).toBe(false);

      // Same lock governs the delta path and the delete path — the opening
      // entry is history inside a closed period.
      await request(app.getHttpServer()).patch(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).send({ openingBalance: 1200 }).expect(409);
      expect(Number((await listAccounts()).find((a) => a.id === account.id)!.openingBalance)).toBe(900);
      await request(app.getHttpServer()).delete(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).expect(409);

      // Reopened: the same edit and delete go through.
      await request(app.getHttpServer()).patch(`/fiscal-years/periods/${january.id}/reopen`).set('Authorization', `Bearer ${token}`).expect(200);
      await request(app.getHttpServer()).patch(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).send({ openingBalance: 1200 }).expect(200);
      await request(app.getHttpServer()).delete(`/accounts/${account.id}`).set('Authorization', `Bearer ${token}`).expect(204);
    } finally {
      // Never leave the period closed or the calendar behind for other suites,
      // even on assertion failure — afterAll deletes the year as a backstop.
      await request(app.getHttpServer()).patch(`/fiscal-years/periods/${january.id}/reopen`).set('Authorization', `Bearer ${token}`);
    }
  });
});
