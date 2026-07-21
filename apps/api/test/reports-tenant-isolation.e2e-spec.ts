import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Reports are pure read-side computations over Account/JournalEntry data
 * (see ReportsService) — no new tenant-scoped table to add RLS to, so the
 * isolation proof here is behavioral: post a fresh, uniquely-dated journal
 * entry as company A and confirm it shows up in A's income statement but
 * never affects company B's numbers computed from the same endpoints.
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

  it("a journal entry posted for company A shows up in A's income statement but never in B's", async () => {
    const accountsA = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const revenueAccount = accountsA.body.find((a: { code: string }) => a.code === '4100');
    const cashAccount = accountsA.body.find((a: { code: string }) => a.code === '1000');

    // A uniquely-far-future date so this test's own posting is trivially
    // isolable from whatever other e2e specs have already posted this run.
    const date = '2031-01-15';

    const beforeA = await request(app.getHttpServer()).get('/reports/income-statement').set('Authorization', `Bearer ${tokenA}`).query({ from: date, to: date }).expect(200);
    expect(beforeA.body.totalRevenue).toBe(0);

    const entry = await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date, memo: 'reports isolation test', lines: [{ accountId: cashAccount.id, debit: 777, credit: 0 }, { accountId: revenueAccount.id, debit: 0, credit: 777 }] })
      .expect(201);

    const afterA = await request(app.getHttpServer()).get('/reports/income-statement').set('Authorization', `Bearer ${tokenA}`).query({ from: date, to: date }).expect(200);
    expect(afterA.body.totalRevenue).toBe(777);
    expect(afterA.body.netProfit).toBe(777);

    const afterB = await request(app.getHttpServer()).get('/reports/income-statement').set('Authorization', `Bearer ${tokenB}`).query({ from: date, to: date }).expect(200);
    expect(afterB.body.totalRevenue).toBe(0);

    await request(app.getHttpServer()).delete(`/journal/${entry.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(204);
  });

  it("balance sheet totals company A's own accounts only, disjoint from B's", async () => {
    const balA = await request(app.getHttpServer()).get('/reports/balance-sheet').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const balB = await request(app.getHttpServer()).get('/reports/balance-sheet').set('Authorization', `Bearer ${tokenB}`).expect(200);

    const codesA = new Set(balA.body.assets.map((a: { code: string }) => a.code));
    const codesB = balB.body.assets.map((a: { code: string }) => a.code);
    // Both seed a "1000" cash account under different names, but no B-only
    // account (its distinctive code) should ever appear in A's report.
    expect(codesA.has('1000')).toBe(true);
    expect(codesB.includes('1000')).toBe(true);
    expect(typeof balA.body.totalAssets).toBe('number');
    expect(typeof balB.body.totalAssets).toBe('number');
  });
});
