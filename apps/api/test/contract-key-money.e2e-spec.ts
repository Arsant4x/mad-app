import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * التقبيل — a lump sum for the *right to a commercial location*, and the third
 * distinct kind of money a lease can carry.
 *
 * What these lock in is that its direction decides everything: received is
 * income the landlord keeps, paid is an asset the company bought. Getting that
 * backwards would either invent profit or bury a long-lived asset in one
 * month's expenses.
 */
describe('Contract key money (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function balance(code: string): Promise<number> {
    const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
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
      .send({ name: `عقار التقبيل ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `KM-${suffix}`, type: 'محل', rentMonthly: 2000 })
      .expect(201);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: unit.body.id,
        tenant: `مستأجر التقبيل ${suffix}`,
        value: 24000,
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

  it('[SPEC 16.16] books key money received as income, not as a refundable deposit', async () => {
    const [cashBefore, otherIncomeBefore, depositsBefore, rentRevenueBefore] = await Promise.all([
      balance('1000'),
      balance('4300'),
      balance('2300'),
      balance('4200'),
    ]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/key-money`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'RECEIVED', amount: 50000, paidAt: '2026-01-10', note: 'تقبيل موقع تجاري' })
      .expect(201);

    const entry = res.body.keyMoney[0];
    expect(entry.direction).toBe('RECEIVED');
    expect(entry.journalEntryId).toBeTruthy();

    expect((await balance('1000')) - cashBefore).toBeCloseTo(50000);
    expect((await balance('4300')) - otherIncomeBefore).toBeCloseTo(50000);
    // Not a deposit: key money is never refunded, so 2300 must not move.
    expect(await balance('2300')).toBeCloseTo(depositsBefore);
    // And not rent.
    expect(await balance('4200')).toBeCloseTo(rentRevenueBefore);
  }, 30000);

  it('[SPEC 16.16] capitalizes key money paid instead of expensing it in one month', async () => {
    const [cashBefore, keyMoneyAssetBefore, otherIncomeBefore] = await Promise.all([balance('1000'), balance('1600'), balance('4300')]);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contractId}/key-money`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'PAID', amount: 30000, paidAt: '2026-02-01' })
      .expect(201);

    const paid = res.body.keyMoney.find((k: { direction: string }) => k.direction === 'PAID');
    expect(paid.journalEntryId).toBeTruthy();

    expect((await balance('1000')) - cashBefore).toBeCloseTo(-30000);
    // 1600 is an asset — the benefit runs for the whole tenancy.
    expect((await balance('1600')) - keyMoneyAssetBefore).toBeCloseTo(30000);
    // Paying key money is not income under any reading.
    expect(await balance('4300')).toBeCloseTo(otherIncomeBefore);
  }, 30000);

  it('[SPEC 16.16] keeps both directions on the same contract as separate records', async () => {
    const contract = await request(app.getHttpServer()).get(`/contracts/${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);

    // A tenancy can legitimately carry more than one — this is why key money is
    // its own table rather than a field on the contract.
    expect(contract.body.keyMoney).toHaveLength(2);
    expect(contract.body.keyMoney.map((k: { direction: string }) => k.direction).sort()).toEqual(['PAID', 'RECEIVED']);
  }, 30000);

  it('rejects a non-positive amount and an unknown direction', async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/key-money`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'RECEIVED', amount: 0, paidAt: '2026-01-10' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/key-money`)
      .set('Authorization', `Bearer ${token}`)
      .send({ direction: 'GIFTED', amount: 100, paidAt: '2026-01-10' })
      .expect(400);
  }, 30000);
});
