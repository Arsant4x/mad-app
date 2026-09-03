import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Early termination: what the tenant owes for walking away.
 *
 * The accounting question these pin down is *which* account it lands in. It is
 * compensation for a period the tenant is not occupying the property — so it
 * must never touch rental revenue, or the occupancy-driven figures on the
 * reports stop meaning anything.
 */
describe('Contract cancellation settlement (e2e)', () => {
  let app: INestApplication;
  let token: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;

  async function balance(code: string): Promise<number> {
    const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  /** A fresh property/unit/contract per case: cancellation is terminal, so no
   * two cases can share one lease. */
  async function makeContract() {
    const tag = `${suffix}-${++seq}`;
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار التسوية ${tag}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `CS-${tag}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: unit.body.id,
        tenant: `مستأجر التسوية ${tag}`,
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
      })
      .expect(201);
    return contract.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('[SPEC 16.9] posts an agreed amount to other income, never to rent', async () => {
    const contract = await makeContract();
    const [receivableBefore, otherIncomeBefore, rentRevenueBefore] = await Promise.all([balance('1200'), balance('4300'), balance('4200')]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cancelDate: '2026-06-30',
        cancelReason: 'إخلاء مبكر باتفاق الطرفين',
        installmentDisposition: 'cancel',
        settlementBasis: 'amount',
        settlementAmount: 2000,
      })
      .expect(201);

    expect(Number(res.body.settlementAmount)).toBeCloseTo(2000);
    expect(res.body.settlementEntryId).toBeTruthy();

    // A receivable, not cash: agreeing the settlement and collecting it are
    // separate events.
    expect((await balance('1200')) - receivableBefore).toBeCloseTo(2000);
    expect((await balance('4300')) - otherIncomeBefore).toBeCloseTo(2000);
    // The line that matters most.
    expect(await balance('4200')).toBeCloseTo(rentRevenueBefore);
  }, 40000);

  it('[SPEC 16.9] computes the settlement from the next N unpaid installments', async () => {
    const contract = await makeContract();
    const receivableBefore = await balance('1200');

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cancelDate: '2026-06-30',
        cancelReason: 'إخلاء مبكر',
        installmentDisposition: 'cancel',
        settlementBasis: 'installments',
        settlementInstallments: 2,
      })
      .expect(201);

    // 12,000 a year over 12 monthly installments = 1,000 each.
    expect(Number(res.body.settlementAmount)).toBeCloseTo(2000);
    expect((await balance('1200')) - receivableBefore).toBeCloseTo(2000);
  }, 40000);

  it('[SPEC 16.5 16.9] computes "all" from every installment still unpaid from the cancel date', async () => {
    const contract = await makeContract();

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-07-01', cancelReason: 'إخلاء مبكر', installmentDisposition: 'cancel', settlementBasis: 'all' })
      .expect(201);

    // July through December — six of the twelve.
    expect(Number(res.body.settlementAmount)).toBeCloseTo(6000);

    // The installments are voided in the same call, and the settlement was
    // still computed from them: reading after voiding would have settled at 0.
    const cancelled = res.body.installments.filter((i: { status: string }) => i.status === 'CANCELLED');
    expect(cancelled.length).toBe(6);
  }, 40000);

  it('posts nothing when the parties agreed on no settlement', async () => {
    const contract = await makeContract();
    const [receivableBefore, otherIncomeBefore] = await Promise.all([balance('1200'), balance('4300')]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-06-30', cancelReason: 'اتفاق ودّي', installmentDisposition: 'cancel' })
      .expect(201);

    expect(res.body.settlementAmount).toBeNull();
    expect(res.body.settlementEntryId).toBeNull();
    expect(await balance('1200')).toBeCloseTo(receivableBefore);
    expect(await balance('4300')).toBeCloseTo(otherIncomeBefore);
  }, 40000);

  it('lets a held deposit be applied against the settlement it created', async () => {
    const contract = await makeContract();

    await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'RENT', amount: 3000, receivedAt: '2026-01-05' })
      .expect(201);

    const cancelled = await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        cancelDate: '2026-06-30',
        cancelReason: 'إخلاء مبكر',
        installmentDisposition: 'cancel',
        settlementBasis: 'amount',
        settlementAmount: 1800,
      })
      .expect(201);

    const receivableAfterCancel = await balance('1200');
    const deposit = cancelled.body.deposits.find((d: { status: string }) => d.status === 'HELD');

    // UNPAID_RENT settles a receivable — which is exactly what the settlement
    // just became. The two features compose without a special case.
    const settled = await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/deposits/${deposit.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        settledAt: '2026-06-30',
        deductions: [{ kind: 'UNPAID_RENT', amount: 1800, reason: 'تسوية إلغاء العقد' }],
      })
      .expect(201);

    expect(Number(settled.body.deposits.find((d: { id: string }) => d.id === deposit.id).refundAmount)).toBeCloseTo(1200);
    // The receivable the cancellation raised is now cleared by the deposit.
    expect((await balance('1200')) - receivableAfterCancel).toBeCloseTo(-1800);
  }, 40000);

  it('rejects a basis without the figure it needs', async () => {
    const contract = await makeContract();

    await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-06-30', cancelReason: 'إخلاء', installmentDisposition: 'cancel', settlementBasis: 'amount' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/contracts/${contract.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-06-30', cancelReason: 'إخلاء', installmentDisposition: 'cancel', settlementBasis: 'installments' })
      .expect(400);
  }, 40000);
});
