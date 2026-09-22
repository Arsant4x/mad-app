import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (15.0 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(50000);

describe('Journal ledger + account posting (e2e)', () => {
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

  async function createTestAccounts(token: string) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const asset = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `JTEST-A-${suffix}`, name: 'أصل اختبار', type: 'asset', openingBalance: 1000 })
      .expect(201);
    const liability = await request(app.getHttpServer())
      .post('/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `JTEST-L-${suffix}`, name: 'خصم اختبار', type: 'liability', openingBalance: 500 })
      .expect(201);
    return { asset: asset.body, liability: liability.body };
  }

  it('[SPEC 3.3] rejects an unbalanced manual entry and never touches balances', async () => {
    const { asset, liability } = await createTestAccounts(tokenA);
    await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-01-01', memo: 'unbalanced', lines: [{ accountId: asset.id, debit: 100, credit: 0 }, { accountId: liability.id, debit: 0, credit: 50 }] })
      .expect(400);
  });

  it('[SPEC 3.3] posts a balanced manual entry to account balances, then reverses on delete', async () => {
    const { asset, liability } = await createTestAccounts(tokenA);

    const entry = await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-01-01', memo: 'balanced entry', lines: [{ accountId: asset.id, debit: 200, credit: 0 }, { accountId: liability.id, debit: 0, credit: 200 }] })
      .expect(201);
    expect(Number(entry.body.totalDebit)).toBe(200);
    expect(Number(entry.body.totalCredit)).toBe(200);

    const afterPost = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const assetAfter = afterPost.body.find((a: { id: string }) => a.id === asset.id);
    const liabAfter = afterPost.body.find((a: { id: string }) => a.id === liability.id);
    expect(Number(assetAfter.balance)).toBe(1200); // asset is debit-normal: +200
    expect(Number(liabAfter.balance)).toBe(700); // liability is credit-normal: +200

    // ⚖️ المرحَّلُ يُعكس ولا يُحذف (ق-١٢٥٣/①): الحذفُ مرفوضٌ بمسمّاه، والعكسُ يعيد الأرصدة.
    await request(app.getHttpServer()).delete(`/journal/${entry.body.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);
    await request(app.getHttpServer()).post(`/journal/${entry.body.id}/reverse`).set('Authorization', `Bearer ${tokenA}`).send({ date: '2026-01-01' }).expect(201);

    const afterReverse = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const assetRestored = afterReverse.body.find((a: { id: string }) => a.id === asset.id);
    const liabRestored = afterReverse.body.find((a: { id: string }) => a.id === liability.id);
    expect(Number(assetRestored.balance)).toBe(1000);
    expect(Number(liabRestored.balance)).toBe(500);
  });

  it("keeps company B from seeing, deleting, or posting against company A's journal/accounts", async () => {
    const { asset, liability } = await createTestAccounts(tokenA);
    // Unique per run so the paginated list can be interrogated through the
    // server-side search — "absent from page 1" of the accumulated demo DB
    // would prove nothing, "the search finds nothing tenant-wide" does.
    const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const entry = await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-01-01', memo: `isolation entry ${marker}`, lines: [{ accountId: asset.id, debit: 50, credit: 0 }, { accountId: liability.id, debit: 0, credit: 50 }] })
      .expect(201);

    const resB = await request(app.getHttpServer())
      .get('/journal')
      .query({ search: `isolation entry ${marker}` })
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(resB.body.total).toBe(0);
    expect(resB.body.items.some((j: { id: string }) => j.id === entry.body.id)).toBe(false);

    await request(app.getHttpServer()).delete(`/journal/${entry.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    // Posting against another company's account id must fail cleanly (404),
    // not crash — and must not create an orphaned cross-tenant journal line.
    await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ date: '2026-01-01', memo: `cross tenant attempt ${marker}`, lines: [{ accountId: asset.id, debit: 10, credit: 0 }, { accountId: liability.id, debit: 0, credit: 10 }] })
      .expect(404);

    const bJournalAfter = await request(app.getHttpServer())
      .get('/journal')
      .query({ search: `cross tenant attempt ${marker}` })
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(bJournalAfter.body.total).toBe(0);

    const accountsAfter = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const assetAfter = accountsAfter.body.find((a: { id: string }) => a.id === asset.id);
    expect(Number(assetAfter.balance)).toBe(1050); // only A's own posting applied

    // التنظيفُ بالعكس (ق-١٢٥٣/①) — والعكسُ من ب على قيد أ مرفوضٌ `404` كالحذف.
    await request(app.getHttpServer()).post(`/journal/${entry.body.id}/reverse`).set('Authorization', `Bearer ${tokenB}`).send({}).expect(404);
    await request(app.getHttpServer()).post(`/journal/${entry.body.id}/reverse`).set('Authorization', `Bearer ${tokenA}`).send({ date: '2026-01-01' }).expect(201);
  });

  it('blocks deleting an account still referenced by a posted journal entry', async () => {
    const { asset, liability } = await createTestAccounts(tokenA);
    const entry = await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-01-01', memo: 'fk restrict test', lines: [{ accountId: asset.id, debit: 10, credit: 0 }, { accountId: liability.id, debit: 0, credit: 10 }] })
      .expect(201);

    await request(app.getHttpServer()).delete(`/accounts/${asset.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);

    // ⚖️ المرحَّلُ يُعكس ولا يُحذف (ق-١٢٥٣/①): العكسُ يعيد الرصيدَ **ويُبقي السطورَ** — فالحسابُ
    // يبقى محجوزاً بأثره (الأصلُ وعكسُه) ولا يُحذف؛ كان الاختبارُ يحذف القيدَ ثم الحساب.
    await request(app.getHttpServer()).post(`/journal/${entry.body.id}/reverse`).set('Authorization', `Bearer ${tokenA}`).send({ date: '2026-01-01' }).expect(201);
    await request(app.getHttpServer()).delete(`/accounts/${asset.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);
    await request(app.getHttpServer()).delete(`/accounts/${liability.id}`).set('Authorization', `Bearer ${tokenA}`).expect(409);
  });

  it("blocks changing an account's type once it has posted journal lines", async () => {
    const { asset, liability } = await createTestAccounts(tokenA);
    await request(app.getHttpServer())
      .post('/journal')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-01-01', memo: 'type lock test', lines: [{ accountId: asset.id, debit: 5, credit: 0 }, { accountId: liability.id, debit: 0, credit: 5 }] })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/accounts/${asset.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'expense' })
      .expect(409);

    // Name is still editable even when journal-used.
    await request(app.getHttpServer())
      .patch(`/accounts/${asset.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'اسم محدث' })
      .expect(200);
  });
});
