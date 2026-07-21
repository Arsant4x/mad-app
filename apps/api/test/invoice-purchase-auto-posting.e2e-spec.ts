import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Proves invoices/purchases auto-post to the ledger through the real chart
 * of accounts seeded for demo-company-a (1200/4100/2200/2100/5300 — see
 * prisma/seed.ts's LEDGER_ACCOUNTS), and that editing/deleting the source
 * document reverses/reposts the linked journal entry rather than leaving it
 * to drift. Complements journal-tenant-isolation.e2e-spec.ts (which covers
 * manual entries) and the soft-skip path (verified manually against a fresh,
 * ledger-account-less company — not practical to set up here since the demo
 * companies already have the full chart seeded).
 */
describe('Invoice/purchase auto-posting (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let customerId: string;
  let supplierId: string;
  let accountByCode: Record<string, { id: string; balance: string }>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    const customers = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${token}`).expect(200);
    customerId = customers.body[0].id;
    const suppliers = await request(app.getHttpServer()).get('/suppliers').set('Authorization', `Bearer ${token}`).expect(200);
    supplierId = suppliers.body[0].id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  async function balances() {
    const res = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    accountByCode = Object.fromEntries(res.body.map((a: { code: string; id: string; balance: string }) => [a.code, a]));
    return accountByCode;
  }

  it('posts a new invoice to A/R, revenue, and VAT, then reverses on delete', async () => {
    const before = await balances();

    const inv = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        issueDate: '2026-07-20',
        dueDate: '2026-08-20',
        lines: [{ description: 'auto-post test', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);
    expect(inv.body.journalEntryId).not.toBeNull();

    const after = await balances();
    expect(Number(after['1200'].balance) - Number(before['1200'].balance)).toBeCloseTo(115);
    expect(Number(after['4100'].balance) - Number(before['4100'].balance)).toBeCloseTo(100);
    expect(Number(after['2200'].balance) - Number(before['2200'].balance)).toBeCloseTo(15);

    await request(app.getHttpServer()).delete(`/invoices/${inv.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);

    const restored = await balances();
    expect(Number(restored['1200'].balance)).toBeCloseTo(Number(before['1200'].balance));
    expect(Number(restored['4100'].balance)).toBeCloseTo(Number(before['4100'].balance));
    expect(Number(restored['2200'].balance)).toBeCloseTo(Number(before['2200'].balance));

    // The auto-entry went with it — can't be found under the invoice's old id.
    await request(app.getHttpServer()).delete(`/journal/${inv.body.journalEntryId}`).set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('re-posts fresh (reversing the old entry) when an invoice is edited', async () => {
    const before = await balances();

    const inv = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, issueDate: '2026-07-20', dueDate: '2026-08-20', lines: [{ description: 'v1', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const firstEntryId = inv.body.journalEntryId;

    const updated = await request(app.getHttpServer())
      .patch(`/invoices/${inv.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lines: [{ description: 'v2', quantity: 1, unitPrice: 200, taxRate: 15 }] })
      .expect(200);
    expect(updated.body.journalEntryId).not.toBe(firstEntryId);

    // Only the final (v2) totals should be reflected — not v1 + v2 both applied.
    const after = await balances();
    expect(Number(after['1200'].balance) - Number(before['1200'].balance)).toBeCloseTo(230);
    expect(Number(after['4100'].balance) - Number(before['4100'].balance)).toBeCloseTo(200);
    expect(Number(after['2200'].balance) - Number(before['2200'].balance)).toBeCloseTo(30);

    await request(app.getHttpServer()).delete(`/invoices/${inv.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);
  });

  it('posts a new purchase to its expense account, VAT, and A/P using the default expense account when no category matches', async () => {
    const before = await balances();

    const pur = await request(app.getHttpServer())
      .post('/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, date: '2026-07-20', subtotal: 200 })
      .expect(201);
    expect(pur.body.journalEntryId).not.toBeNull();
    expect(Number(pur.body.total)).toBeCloseTo(230);

    const after = await balances();
    expect(Number(after['5300'].balance) - Number(before['5300'].balance)).toBeCloseTo(200);
    // 2200 (VAT payable) is debited by input VAT on a purchase — it's a
    // credit, offsetting what's owed to the authority, so its balance
    // (credit-normal) goes *down*, mirroring how an invoice's output VAT
    // credit made it go up in the previous test.
    expect(Number(after['2200'].balance) - Number(before['2200'].balance)).toBeCloseTo(-30);
    expect(Number(after['2100'].balance) - Number(before['2100'].balance)).toBeCloseTo(230);

    await request(app.getHttpServer()).delete(`/purchases/${pur.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);

    const restored = await balances();
    expect(Number(restored['5300'].balance)).toBeCloseTo(Number(before['5300'].balance));
    expect(Number(restored['2200'].balance)).toBeCloseTo(Number(before['2200'].balance));
    expect(Number(restored['2100'].balance)).toBeCloseTo(Number(before['2100'].balance));
  });

  it('cannot delete an auto-posted entry directly through the journal endpoint', async () => {
    const inv = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, issueDate: '2026-07-20', dueDate: '2026-08-20', lines: [{ description: 'guard test', quantity: 1, unitPrice: 10, taxRate: 15 }] })
      .expect(201);

    await request(app.getHttpServer()).delete(`/journal/${inv.body.journalEntryId}`).set('Authorization', `Bearer ${token}`).expect(409);

    await request(app.getHttpServer()).delete(`/invoices/${inv.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);
  });
});
