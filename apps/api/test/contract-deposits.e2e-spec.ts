import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * A deposit is the one piece of rental money that is **not** income: it belongs
 * to the tenant until the lease ends. These lock in that distinction, because
 * getting it wrong overstates profit for a year and then needs unwinding.
 *
 * Assertions are on account balances rather than on the returned rows — a
 * deposit that shows up correctly in the API but never reaches the ledger is
 * exactly the bug this feature exists to fix.
 */
describe('Contract deposits (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;

  async function balance(code: string): Promise<number> {
    const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار التأمينات ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `DEP-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: unit.body.id,
        tenant: `مستأجر التأمينات ${suffix}`,
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
        deposit: 3000,
      })
      .expect(201);
    contractId = contract.body.id;
  }, 60000);

  afterAll(async () => {
    // A contract cannot be deleted (it carries posted ledger entries); freeing
    // the unit is the most cleanup the domain allows.
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-12-31' });
    await app.close();
  });

  async function recordDeposit(type: 'RENT' | 'FACILITY', amount: number) {
    return request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type, amount, receivedAt: '2026-01-05' })
      .expect(201);
  }

  it('books a received deposit as a liability, not as revenue', async () => {
    const [cashBefore, depositsBefore, rentRevenueBefore] = await Promise.all([balance('1000'), balance('2300'), balance('4200')]);

    const res = await recordDeposit('RENT', 3000);

    const deposit = res.body.deposits.find((d: { type: string }) => d.type === 'RENT');
    expect(deposit.status).toBe('HELD');
    expect(deposit.journalEntryId).toBeTruthy();

    expect((await balance('1000')) - cashBefore).toBeCloseTo(3000);
    // 2300 is credit-normal (a liability), so receiving 3000 raises it by 3000.
    expect((await balance('2300')) - depositsBefore).toBeCloseTo(3000);
    // The whole point: rental revenue must not move.
    expect(await balance('4200')).toBeCloseTo(rentRevenueBefore);
  }, 30000);

  it('keeps the two deposit types independent', async () => {
    const res = await recordDeposit('FACILITY', 1000);

    const held = res.body.deposits.filter((d: { status: string }) => d.status === 'HELD');
    expect(held).toHaveLength(2);
    expect(held.map((d: { type: string }) => d.type).sort()).toEqual(['FACILITY', 'RENT']);
  }, 30000);

  it('splits a settlement across receivable, income and cash', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const rentDeposit = contract.body.deposits.find((d: { type: string; status: string }) => d.type === 'RENT' && d.status === 'HELD');

    const [cashBefore, depositsBefore, receivableBefore, otherIncomeBefore] = await Promise.all([
      balance('1000'),
      balance('2300'),
      balance('1200'),
      balance('4300'),
    ]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits/${rentDeposit.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        settledAt: '2026-12-31',
        deductions: [
          { kind: 'UNPAID_RENT', amount: 500, reason: 'إيجار شهر ديسمبر' },
          { kind: 'DAMAGE', amount: 300, reason: 'كسر باب المطبخ' },
        ],
      })
      .expect(201);

    const settled = res.body.deposits.find((d: { id: string }) => d.id === rentDeposit.id);
    expect(settled.status).toBe('SETTLED');
    expect(Number(settled.refundAmount)).toBeCloseTo(2200);
    expect(settled.deductions).toHaveLength(2);
    expect(settled.settlementEntryId).toBeTruthy();

    // The liability is cleared in full — the obligation ends regardless of
    // where the money went.
    expect((await balance('2300')) - depositsBefore).toBeCloseTo(-3000);
    // Unpaid rent settles the receivable; it must NOT be credited to income
    // again, since raising the rent invoice already recognized it.
    expect((await balance('1200')) - receivableBefore).toBeCloseTo(-500);
    // Damage is income the landlord keeps — and it lands in 4300, not 4200,
    // so a forfeited deposit never masquerades as rental revenue.
    expect((await balance('4300')) - otherIncomeBefore).toBeCloseTo(300);
    // Only the remainder actually leaves the till.
    expect((await balance('1000')) - cashBefore).toBeCloseTo(-2200);
  }, 30000);

  it('refunds the whole amount when there is nothing to deduct', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const facility = contract.body.deposits.find((d: { type: string; status: string }) => d.type === 'FACILITY' && d.status === 'HELD');

    const cashBefore = await balance('1000');

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits/${facility.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settledAt: '2026-12-31', deductions: [] })
      .expect(201);

    const settled = res.body.deposits.find((d: { id: string }) => d.id === facility.id);
    expect(Number(settled.refundAmount)).toBeCloseTo(1000);
    expect((await balance('1000')) - cashBefore).toBeCloseTo(-1000);
  }, 30000);

  it('refuses to settle the same deposit twice', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const settled = contract.body.deposits.find((d: { status: string }) => d.status === 'SETTLED');

    // A second settlement would credit cash the landlord never paid out.
    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits/${settled.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settledAt: '2026-12-31', deductions: [] })
      .expect(409);

    expect(res.body.message).toContain('تمت تسوية');
  }, 30000);

  it('refuses deductions larger than the deposit', async () => {
    const created = await recordDeposit('RENT', 500);
    const deposit = created.body.deposits.find((d: { status: string; type: string }) => d.status === 'HELD' && d.type === 'RENT');

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits/${deposit.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settledAt: '2026-12-31', deductions: [{ kind: 'DAMAGE', amount: 900, reason: 'أضرار' }] })
      .expect(400);

    // Localized, and it names the amount so the user can correct it.
    expect(res.body.message).toContain('500.00');
  }, 30000);

  describe('a deposit blocked on the Ejar platform', () => {
    /**
     * The company never receives this money — Ejar is the custodian and refunds
     * the tenant directly. Posting cash and a liability for it would inflate
     * both sides of the balance sheet with money that isn't there.
     */
    async function recordEjarDeposit(amount: number) {
      return request(app.getHttpServer())
        .post(`/contracts/${contractId}/deposits`)
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'FACILITY', holder: 'EJAR', amount, receivedAt: '2026-01-05', note: 'محجوز لدى منصة إيجار' })
        .expect(201);
    }

    it('is tracked on the contract but touches neither cash nor the deposit liability', async () => {
      const [cashBefore, depositsBefore] = await Promise.all([balance('1000'), balance('2300')]);

      const res = await recordEjarDeposit(2000);

      const deposit = res.body.deposits.find((d: { holder: string; status: string }) => d.holder === 'EJAR' && d.status === 'HELD');
      expect(deposit).toBeTruthy();
      expect(Number(deposit.amount)).toBeCloseTo(2000);
      // Recorded, deliberately unposted.
      expect(deposit.journalEntryId).toBeNull();

      expect(await balance('1000')).toBeCloseTo(cashBefore);
      expect(await balance('2300')).toBeCloseTo(depositsBefore);
    }, 30000);

    it('posts nothing at all when Ejar refunds the tenant in full', async () => {
      const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
      const ejar = contract.body.deposits.find((d: { holder: string; status: string }) => d.holder === 'EJAR' && d.status === 'HELD');

      const [cashBefore, depositsBefore] = await Promise.all([balance('1000'), balance('2300')]);

      const res = await request(app.getHttpServer())
        .post(`/contracts/${contractId}/deposits/${ejar.id}/settle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ settledAt: '2026-12-31', deductions: [] })
        .expect(201);

      const settled = res.body.deposits.find((d: { id: string }) => d.id === ejar.id);
      expect(settled.status).toBe('SETTLED');
      expect(Number(settled.refundAmount)).toBeCloseTo(2000);
      // The money moved between Ejar and the tenant — not through this company.
      expect(settled.settlementEntryId).toBeNull();
      expect(await balance('1000')).toBeCloseTo(cashBefore);
      expect(await balance('2300')).toBeCloseTo(depositsBefore);
    }, 30000);

    it('posts only what Ejar releases to the company, as cash in', async () => {
      await recordEjarDeposit(1000);
      const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
      const ejar = contract.body.deposits.find((d: { holder: string; status: string }) => d.holder === 'EJAR' && d.status === 'HELD');

      const [cashBefore, depositsBefore, otherIncomeBefore] = await Promise.all([balance('1000'), balance('2300'), balance('4300')]);

      await request(app.getHttpServer())
        .post(`/contracts/${contractId}/deposits/${ejar.id}/settle`)
        .set('Authorization', `Bearer ${token}`)
        .send({ settledAt: '2026-12-31', deductions: [{ kind: 'DAMAGE', amount: 400, reason: 'أضرار بالوحدة' }] })
        .expect(201);

      // Only the awarded 400 arrives; the other 600 goes back to the tenant
      // from Ejar and never appears here.
      expect((await balance('1000')) - cashBefore).toBeCloseTo(400);
      expect((await balance('4300')) - otherIncomeBefore).toBeCloseTo(400);
      // 2300 is for money the company holds — an Ejar deposit must never reach it.
      expect(await balance('2300')).toBeCloseTo(depositsBefore);
    }, 30000);
  });

  it('rejects a deduction with no reason and a non-positive deposit', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const held = contract.body.deposits.find((d: { status: string }) => d.status === 'HELD');

    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits/${held.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settledAt: '2026-12-31', deductions: [{ kind: 'DAMAGE', amount: 100, reason: '' }] })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'RENT', amount: 0, receivedAt: '2026-01-05' })
      .expect(400);
  }, 30000);
});
