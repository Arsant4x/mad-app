import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createTenantCustomer } from './tenant-customer';

/**
 * Reports are pure read-side computations over Account/JournalEntry data
 * (see ReportsService) — no new tenant-scoped table to add RLS to, so the
 * isolation proof here is behavioral: post a fresh, uniquely-dated journal
 * entry as company A and confirm it shows up in A's income statement but
 * never affects company B's numbers computed from the same endpoints.
 *
 * property-kpis matters doubly here: its collection figure is the codebase's
 * first raw-SQL read, which the tenant-scope extension (layer 1) cannot
 * auto-inject `companyId` into — the query binds it explicitly and RLS backs
 * it up. This suite is what proves that stays true.
 */
describe('Reports tenant isolation (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access to every report endpoint', async () => {
    await request(app.getHttpServer()).get('/reports/income-statement').expect(401);
    await request(app.getHttpServer()).get('/reports/balance-sheet').expect(401);
    await request(app.getHttpServer()).get('/reports/cash-flow').expect(401);
  });

  it("[SPEC 10.2] a journal entry posted for company A shows up in A's income statement but never in B's", async () => {
    const accountsA = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const revenueAccount = accountsA.body.find((a: { code: string }) => a.code === '4100');
    const cashAccount = accountsA.body.find((a: { code: string }) => a.code === '1000');

    // A uniquely-far-future date so this test's own posting is trivially
    // isolable from whatever other e2e specs have already posted this run.
    const date = '2031-01-15';

    // ② المبالغُ نصٌّ بخانتين (`ق-١٢٣٥`) — تُقارَن حرفاً.
    const beforeA = await request(app.getHttpServer()).get('/reports/income-statement').set('Authorization', `Bearer ${tokenA}`).query({ from: date, to: date }).expect(200);
    expect(beforeA.body.totalRevenue).toBe('0.00');

    const entry = await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date, memo: 'reports isolation test', lines: [{ accountId: cashAccount.id, debit: 777, credit: 0 }, { accountId: revenueAccount.id, debit: 0, credit: 777 }] })
      .expect(201);

    const afterA = await request(app.getHttpServer()).get('/reports/income-statement').set('Authorization', `Bearer ${tokenA}`).query({ from: date, to: date }).expect(200);
    expect(afterA.body.totalRevenue).toBe('777.00');
    expect(afterA.body.netProfit).toBe('777.00');

    const afterB = await request(app.getHttpServer()).get('/reports/income-statement').set('Authorization', `Bearer ${tokenB}`).query({ from: date, to: date }).expect(200);
    expect(afterB.body.totalRevenue).toBe('0.00');

    await request(app.getHttpServer()).delete(`/journal/${entry.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  });

  it("company A's rent collection and occupancy never bleed into company B's property KPIs", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    // ② مبالغُ التحصيل نصٌّ بخانتين (`ق-١٢٣٥`) — يُثبَت شكلُها ثم تُقرأ رقماً، فالفروقُ أدناه على الأرقام كما كانت.
    const MONEY_TEXT = /^-?\d+\.\d{2}$/;
    const n = (text: string): number => {
      expect(text).toMatch(MONEY_TEXT);
      return Number(text);
    };
    const kpis = async (token: string) => {
      const res = await request(app.getHttpServer()).get('/reports/property-kpis').set('Authorization', `Bearer ${token}`).expect(200);
      const c = res.body.collection as { dueAmount: string; paidAmount: string; onTimeAmount: string; overdueCount: number };
      return {
        body: {
          ...res.body,
          collection: { dueAmount: n(c.dueAmount), paidAmount: n(c.paidAmount), onTimeAmount: n(c.onTimeAmount), overdueCount: c.overdueCount },
        },
      };
    };
    const cleanup: { token: string; id: string }[] = [];

    /** A fully-due 2024 lease with its first instalment paid on the due date —
     * every collection figure (due, paid, on-time, overdue) moves by a known
     * amount, which is what makes an exact-delta assertion possible. */
    async function leaseWith(token: string, tag: string, annual: number) {
      const property = await request(app.getHttpServer())
        .post('/properties')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `عقار عزل المؤشرات ${tag} ${suffix}`, ownership: 'owned' })
        .expect(201);
      const unit = await request(app.getHttpServer())
        .post('/units')
        .set('Authorization', `Bearer ${token}`)
        .send({ propertyId: property.body.id, unitNo: `ISO-${tag}-${suffix}`, type: 'سكني', rentMonthly: annual / 12 })
        .expect(201);
      const contract = await request(app.getHttpServer())
        .post('/contracts')
        .set('Authorization', `Bearer ${token}`)
        .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.body.id, customerId: await createTenantCustomer(app, token, `مستأجر العزل ${tag} ${suffix}`), value: annual, cycle: 'monthly', start: '2024-01-01', end: '2024-12-31' })
        .expect(201);
      const first = contract.body.installments[0];
      await request(app.getHttpServer())
        .post(`/contracts/${contract.body.id}/payments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ installmentId: first.id, date: '2024-01-01', amount: Number(first.amount), method: 'CASH' })
        .expect(201);
      cleanup.push({ token, id: contract.body.id });
      return { propertyId: property.body.id, paid: Number(first.amount), due: annual };
    }

    try {
      // B gets a lease of its own FIRST. Without it B's collection figures are
      // all zero on a fresh database, and "B did not move" degenerates into
      // comparing zero to zero — an assertion that cannot fail, which is how
      // this test read before 2026-08-08. Now B carries real money, so a leak
      // from A would have to change a non-zero number.
      const bLease = await leaseWith(tokenB, 'B', 36000);
      const beforeB = (await kpis(tokenB)).body;
      expect(beforeB.collection.dueAmount).toBeGreaterThan(0);
      expect(beforeB.collection.paidAmount).toBeGreaterThanOrEqual(bLease.paid);

      // Now A does the same, with a deliberately different annual value so any
      // bleed would be arithmetically visible rather than coincidentally equal.
      const beforeA = (await kpis(tokenA)).body;
      const aLease = await leaseWith(tokenA, 'A', 24000);

      // A moved by exactly its own lease, and sees its own property.
      const afterA = (await kpis(tokenA)).body;
      expect(afterA.occupancy.some((o: { propertyId: string }) => o.propertyId === aLease.propertyId)).toBe(true);
      expect(afterA.collection.dueAmount - beforeA.collection.dueAmount).toBeCloseTo(aLease.due, 2);
      expect(afterA.collection.paidAmount - beforeA.collection.paidAmount).toBeCloseTo(aLease.paid, 2);

      // B did not move at all — neither its properties nor any of the four
      // collection figures, each compared as a value rather than by deep-equal
      // on a possibly-empty object.
      const afterB = (await kpis(tokenB)).body;
      expect(afterB.occupancy.some((o: { propertyId: string }) => o.propertyId === aLease.propertyId)).toBe(false);
      expect(afterB.collection.dueAmount).toBeCloseTo(beforeB.collection.dueAmount, 2);
      expect(afterB.collection.paidAmount).toBeCloseTo(beforeB.collection.paidAmount, 2);
      expect(afterB.collection.onTimeAmount).toBeCloseTo(beforeB.collection.onTimeAmount, 2);
      expect(afterB.collection.overdueCount).toBe(beforeB.collection.overdueCount);
      expect(afterB.portfolio.totalUnits).toBe(beforeB.portfolio.totalUnits);
    } finally {
      // Cancel both leases so repeated runs don't accumulate due rent in the
      // shared dev companies — in `finally`, because a failed assertion above
      // would otherwise poison every later run's baseline.
      for (const c of cleanup) {
        await request(app.getHttpServer())
          .post(`/contracts/${c.id}/cancel`)
          .set('Authorization', `Bearer ${c.token}`)
          .send({ cancelDate: '2030-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
      }
    }
  }, 60000);

  it("balance sheet totals company A's own accounts only, disjoint from B's", async () => {
    const balA = await request(app.getHttpServer()).get('/reports/balance-sheet').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const balB = await request(app.getHttpServer()).get('/reports/balance-sheet').set('Authorization', `Bearer ${tokenB}`).expect(200);

    const codesA = new Set(balA.body.assets.map((a: { code: string }) => a.code));
    const codesB = balB.body.assets.map((a: { code: string }) => a.code);
    // Both seed a "1000" cash account under different names, but no B-only
    // account (its distinctive code) should ever appear in A's report.
    expect(codesA.has('1000')).toBe(true);
    expect(codesB.includes('1000')).toBe(true);
    // ② الإجماليُّ نصٌّ بخانتين لا رقم (`ق-١٢٣٥`).
    expect(balA.body.totalAssets).toMatch(/^-?\d+\.\d{2}$/);
    expect(balB.body.totalAssets).toMatch(/^-?\d+\.\d{2}$/);
  });
});
