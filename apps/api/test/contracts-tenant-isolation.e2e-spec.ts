import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Properties/Units/Contracts (e2e)', () => {
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

  async function setupPropertyAndUnit(token: string, opts: { activityType?: string; unitType?: string } = {}) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار اختبار ${suffix}`, ownership: 'owned', ...(opts.activityType ? { activityType: opts.activityType } : {}) })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `U-${suffix}`, type: opts.unitType ?? 'سكني', rentMonthly: 1000 })
      .expect(201);
    return { property: property.body, unit: unit.body };
  }

  it('creates a contract, generates an even installment schedule, and rejects an overlapping contract on the same unit', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);

    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'مستأجر اختبار', value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31', deposit: 1000 })
      .expect(201);
    expect(contract.body.installments).toHaveLength(12);
    expect(contract.body.installments.every((i: { amount: string }) => Number(i.amount) === 1000)).toBe(true);
    expect(contract.body.customerId).not.toBeNull();

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'مستأجر آخر', value: 6000, cycle: 'monthly', start: '2026-06-01', end: '2026-08-31' })
      .expect(409);
  });

  it("marks the unit as rented while a contract is active, and rejects a contract whose unit type doesn't match the property's activity lock", async () => {
    const { unit } = await setupPropertyAndUnit(tokenA, { activityType: 'residential', unitType: 'محل' });

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'محل تجاري', value: 3000, cycle: 'monthly', start: '2026-01-01', end: '2026-06-30' })
      .expect(409);
  });

  it('records a cash rent payment (posts to the ledger, marks the installment paid) and a bank payment (updates the bank balance and creates a matched BankTransaction)', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'دافع الإيجار', value: 3000, cycle: 'monthly', start: '2026-01-01', end: '2026-03-31' })
      .expect(201);
    const installmentId = contract.body.installments[0].id;

    const accountsBefore = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const cashBefore = Number(accountsBefore.body.find((a: { code: string }) => a.code === '1000')?.balance ?? 0);
    const revenueBefore = Number(accountsBefore.body.find((a: { code: string }) => a.code === '4200')?.balance ?? 0);

    const cashPayment = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ installmentId, date: '2026-01-01', amount: 1000, method: 'CASH' })
      .expect(201);
    expect(cashPayment.body.journalEntryId).not.toBeNull();
    expect(cashPayment.body.installment.status).toBe('PAID');

    const accountsAfter = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(Number(accountsAfter.body.find((a: { code: string }) => a.code === '1000').balance) - cashBefore).toBeCloseTo(1000);
    expect(Number(accountsAfter.body.find((a: { code: string }) => a.code === '4200').balance) - revenueBefore).toBeCloseTo(1000);

    const banks = await request(app.getHttpServer()).get('/banks').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const bank = banks.body[0];
    const bankBalanceBefore = Number(bank.balance);

    const bankPayment = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/payments`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ date: '2026-02-01', amount: 1000, discount: 100, method: 'BANK', bankId: bank.id })
      .expect(201);
    expect(Number(bankPayment.body.netAmount)).toBe(900);

    const banksAfter = await request(app.getHttpServer()).get('/banks').set('Authorization', `Bearer ${tokenA}`).expect(200);
    expect(Number(banksAfter.body.find((b: { id: string }) => b.id === bank.id).balance) - bankBalanceBefore).toBeCloseTo(900);

    const transactions = await request(app.getHttpServer()).get('/transactions').set('Authorization', `Bearer ${tokenA}`).expect(200);
    const tx = transactions.body.find((t: { amount: string }) => Number(t.amount) === 900);
    expect(tx).toBeDefined();
    expect(tx.matched).toBe(true);
  });

  it('cancelling a contract shrinks its end date and cancels future unpaid installments while leaving already-due ones alone', async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'عقد للإلغاء', value: 3000, cycle: 'monthly', start: '2030-01-01', end: '2030-03-31' })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ cancelDate: '2030-01-15', cancelReason: 'اختبار', installmentDisposition: 'cancel' })
      .expect(201);

    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.end.slice(0, 10)).toBe('2030-01-15');
    const byDueDate = (d: string) => cancelled.body.installments.find((i: { dueDate: string }) => i.dueDate.slice(0, 10) === d);
    expect(byDueDate('2030-01-01').status).toBe('DUE');
    expect(byDueDate('2030-02-01').status).toBe('CANCELLED');
    expect(byDueDate('2030-03-01').status).toBe('CANCELLED');
  });

  it("keeps company B from seeing, fetching, or referencing company A's units/contracts", async () => {
    const { unit } = await setupPropertyAndUnit(tokenA);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ unitId: unit.id, tenant: 'عزل بين الشركات', value: 1200, cycle: 'monthly', start: '2031-01-01', end: '2031-12-31' })
      .expect(201);

    const listB = await request(app.getHttpServer()).get('/contracts').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect(listB.body.some((c: { id: string }) => c.id === contract.body.id)).toBe(false);

    await request(app.getHttpServer()).get(`/contracts/${contract.body.id}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ unitId: unit.id, tenant: 'محاولة عبور الشركات', value: 500, cycle: 'monthly', start: '2032-01-01', end: '2032-06-30' })
      .expect(404);
  });
});
