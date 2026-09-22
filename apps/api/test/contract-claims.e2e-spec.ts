import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (26.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(85000);

/**
 * Claims are money demanded of the tenant outside the rent schedule.
 *
 * Two things these pin down: the claim becomes a receivable the moment it is
 * raised (not when someone pays), and it never touches rental revenue — a
 * repair the tenant caused is income, but not income from letting property.
 */
describe('Contract claims (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function balance(code: string): Promise<number> {
    const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  async function raiseClaim(amount: number, kind = 'MAINTENANCE') {
    return request(app.getHttpServer())
      .post(`/contracts/${contractId}/claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind, amount, description: 'إصلاح سخان المياه', issuedAt: '2026-03-01' })
      .expect(201);
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

    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار المطالبات ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `CL-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: unit.body.id,
        customerId: await createTenantCustomer(app, token, `مستأجر المطالبات ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
      })
      .expect(201);
    contractId = contract.body.id;
  }, 60000);

  afterAll(async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
    await app.close();
  });

  it('[SPEC 16.13] becomes a receivable the moment it is raised, credited to other income', async () => {
    const [receivableBefore, otherIncomeBefore, rentRevenueBefore] = await Promise.all([balance('1200'), balance('4300'), balance('4200')]);

    const res = await raiseClaim(750);
    const claim = res.body.claims[0];

    expect(claim.status).toBe('OPEN');
    expect(claim.journalEntryId).toBeTruthy();
    expect(claim.description).toBe('إصلاح سخان المياه');

    expect((await balance('1200')) - receivableBefore).toBeCloseTo(750);
    expect((await balance('4300')) - otherIncomeBefore).toBeCloseTo(750);
    // A repair the tenant caused is income — but not from letting property.
    expect(await balance('4200')).toBeCloseTo(rentRevenueBefore);
  }, 30000);

  it('[SPEC 16.13] clears the receivable into cash when collected', async () => {
    const raised = await raiseClaim(400, 'LATE_FEE');
    const claim = raised.body.claims.find((c: { status: string; amount: string }) => c.status === 'OPEN' && Number(c.amount) === 400);

    const [cashBefore, receivableBefore, otherIncomeBefore] = await Promise.all([balance('1000'), balance('1200'), balance('4300')]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/claims/${claim.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paidAt: '2026-03-15' })
      .expect(201);

    const paid = res.body.claims.find((c: { id: string }) => c.id === claim.id);
    expect(paid.status).toBe('PAID');
    expect(paid.settlementEntryId).toBeTruthy();

    expect((await balance('1000')) - cashBefore).toBeCloseTo(400);
    expect((await balance('1200')) - receivableBefore).toBeCloseTo(-400);
    // Income was recognized when the claim was raised; collecting it must not
    // recognize it a second time.
    expect(await balance('4300')).toBeCloseTo(otherIncomeBefore);
  }, 30000);

  it('[SPEC 16.13] reverses the income when a claim is written off, and keeps the record', async () => {
    const raised = await raiseClaim(250, 'DAMAGE');
    const claim = raised.body.claims.find((c: { status: string; amount: string }) => c.status === 'OPEN' && Number(c.amount) === 250);

    const [receivableBefore, otherIncomeBefore] = await Promise.all([balance('1200'), balance('4300')]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/claims/${claim.id}/waive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ waivedAt: '2026-04-01', reason: 'تنازل ودّي' })
      .expect(201);

    const waived = res.body.claims.find((c: { id: string }) => c.id === claim.id);
    // Written off, not deleted: the claim really was raised and the tenant may
    // well have been told about it.
    expect(waived.status).toBe('WAIVED');
    expect(waived.waiveReason).toBe('تنازل ودّي');

    expect((await balance('1200')) - receivableBefore).toBeCloseTo(-250);
    expect((await balance('4300')) - otherIncomeBefore).toBeCloseTo(-250);
  }, 30000);

  it('lets a held deposit settle an open claim, with no special case', async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'FACILITY', amount: 1000, receivedAt: '2026-01-05' })
      .expect(201);

    const raised = await raiseClaim(600, 'UTILITIES');
    const deposit = raised.body.deposits.find((d: { status: string }) => d.status === 'HELD');
    const receivableAfterClaim = await balance('1200');

    // UNPAID_RENT is the deduction kind that settles a receivable — which is
    // exactly what an open claim is.
    const settled = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/deposits/${deposit.id}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ settledAt: '2026-04-30', deductions: [{ kind: 'UNPAID_RENT', amount: 600, reason: 'خصم مطالبة فواتير الخدمات' }] })
      .expect(201);

    expect(Number(settled.body.deposits.find((d: { id: string }) => d.id === deposit.id).refundAmount)).toBeCloseTo(400);
    expect((await balance('1200')) - receivableAfterClaim).toBeCloseTo(-600);
  }, 30000);

  it('refuses to settle the same claim twice', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
    const settled = contract.body.claims.find((c: { status: string }) => c.status === 'PAID');

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/claims/${settled.id}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ paidAt: '2026-05-01' })
      .expect(409);

    expect(res.body.message).toContain('مسوّاة بالفعل');
  }, 30000);

  it('rejects a claim with no description or a non-positive amount', async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'OTHER', amount: 100, description: '  ', issuedAt: '2026-03-01' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/claims`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'OTHER', amount: 0, description: 'بلا مبلغ', issuedAt: '2026-03-01' })
      .expect(400);
  }, 30000);
});
