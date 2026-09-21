import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { createTenantCustomer } from './tenant-customer';

/**
 * The portfolio KPIs. Every figure is derived at read time, so these check the
 * *definitions* — which is where this kind of report goes wrong. A collection
 * rate that quietly counts next year's unissued rent as "uncollected", or an
 * occupancy rate that hides maintenance in the denominator, is worse than no
 * number at all because it looks authoritative.
 */
describe('Property KPIs (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let propertyId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdContractIds: string[] = [];

  function kpis() {
    return request(app.getHttpServer()).get('/reports/property-kpis').set('Authorization', `Bearer ${token}`).expect(200);
  }

  interface OccupancyRow {
    propertyId: string;
    total: number;
    rented: number;
    reserved: number;
    vacant: number;
    maintenance: number;
    /** ② نسبةٌ نصّاً بخانتين (`ق-١٢٣٥`) — تُقارَن حرفاً. */
    occupancyRate: string;
  }

  /** ② مبالغُ التحصيل ونِسَبُه نصٌّ — يُثبَت شكلُها ثم تُقرأ رقماً للفروق. */
  const MONEY_TEXT = /^-?\d+\.\d{2}$/;
  const collectionOf = (body: { collection: { dueAmount: string; paidAmount: string; onTimeAmount: string; collectedRate: string; onTimeRate: string; overdueCount: number } }) => {
    const c = body.collection;
    for (const v of [c.dueAmount, c.paidAmount, c.onTimeAmount, c.collectedRate, c.onTimeRate]) expect(v).toMatch(MONEY_TEXT);
    return {
      dueAmount: Number(c.dueAmount),
      paidAmount: Number(c.paidAmount),
      onTimeAmount: Number(c.onTimeAmount),
      collectedRate: Number(c.collectedRate),
      onTimeRate: Number(c.onTimeRate),
      overdueCount: c.overdueCount,
    };
  };

  /** This suite's own property, so other suites' leftovers can't move its numbers. */
  function mine(body: { occupancy: OccupancyRow[] }): OccupancyRow {
    return body.occupancy.find((o) => o.propertyId === propertyId)!;
  }

  async function addUnit(no: string, opts: { underMaintenance?: boolean } = {}) {
    return (
      await request(app.getHttpServer())
        .post('/units')
        .set('Authorization', `Bearer ${token}`)
        .send({ propertyId, unitNo: `${no}-${suffix}`, type: 'سكني', rentMonthly: 1000, ...opts })
        .expect(201)
    ).body;
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
      .send({ name: `عقار المؤشرات ${suffix}`, ownership: 'owned' })
      .expect(201);
    propertyId = property.body.id;
  }, 60000);

  afterAll(async () => {
    for (const id of createdContractIds) {
      await request(app.getHttpServer())
        .post(`/contracts/${id}/cancel`)
        .set('Authorization', `Bearer ${token}`)
        .send({ cancelDate: '2030-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
    }
    await app.close();
    // عقودٌ بعشر سنواتٍ مضى منها ستٌّ: الاستحقاقُ عند الإنشاء والاعترافُ عند الإلغاء قيدٌ لكلِّ شهر (ق-٩١٧).
  }, 180000);

  it('reports an empty property as 0% occupied without dividing by zero', async () => {
    const res = await kpis();
    const row = mine(res.body);

    expect(row.total).toBe(0);
    expect(row.occupancyRate).toBe('0.00');
  }, 30000);

  it('counts a live contract as occupied and leaves the rest vacant', async () => {
    const rented = await addUnit('OCC-A');
    await addUnit('OCC-B');

    // Spans today, so it is live by the same rule the units screen uses.
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: rented.id,
        customerId: await createTenantCustomer(app, token, `مستأجر المؤشرات ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: '2020-01-01',
        end: '2030-12-31',
      })
      .expect(201);
    createdContractIds.push(contract.body.id);

    const row = mine((await kpis()).body);
    expect(row.total).toBe(2);
    expect(row.rented).toBe(1);
    expect(row.vacant).toBe(1);
    expect(row.occupancyRate).toBe('50.00');
  }, 40000);

  it('keeps a unit under maintenance in the denominator', async () => {
    await addUnit('OCC-C', { underMaintenance: true });

    const row = mine((await kpis()).body);
    expect(row.maintenance).toBe(1);
    expect(row.total).toBe(3);
    // 1 of 3, not 1 of 2: a building half under maintenance is genuinely half
    // empty, and shrinking the denominator would flatter the number.
    expect(row.occupancyRate).toBe('33.30');
  }, 30000);

  it('ignores instalments that have not fallen due yet', async () => {
    const before = collectionOf((await kpis()).body);

    const unit = await addUnit('FUT');
    const future = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: unit.id,
        customerId: await createTenantCustomer(app, token, `مستأجر مستقبلي ${suffix}`),
        value: 120000,
        cycle: 'monthly',
        start: '2029-01-01',
        end: '2029-12-31',
      })
      .expect(201);
    createdContractIds.push(future.body.id);

    // A landlord who just issued next year's schedule is not suddenly at 8%
    // collection — nothing about the due figures may move.
    const after = collectionOf((await kpis()).body);
    expect(after.dueAmount).toBeCloseTo(before.dueAmount);
    expect(after.overdueCount).toBe(before.overdueCount);
  }, 40000);

  it('separates "collected" from "collected on time"', async () => {
    const unit = await addUnit('COL');
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: unit.id,
        customerId: await createTenantCustomer(app, token, `مستأجر التحصيل ${suffix}`),
        value: 24000,
        cycle: 'monthly',
        start: '2024-01-01',
        end: '2024-12-31',
      })
      .expect(201);
    createdContractIds.push(contract.body.id);

    const first = contract.body.installments[0];
    const second = contract.body.installments[1];
    const before = collectionOf((await kpis()).body);

    // Paid before its due date...
    await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ installmentId: first.id, date: '2024-01-01', amount: Number(first.amount), method: 'CASH' })
      .expect(201);

    // ...and this one months late.
    await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ installmentId: second.id, date: '2024-08-01', amount: Number(second.amount), method: 'CASH' })
      .expect(201);

    const after = collectionOf((await kpis()).body);
    const paidDelta = after.paidAmount - before.paidAmount;
    const onTimeDelta = after.onTimeAmount - before.onTimeAmount;

    // Both count as collected; only the first counts as on time.
    expect(paidDelta).toBeCloseTo(Number(first.amount) + Number(second.amount));
    expect(onTimeDelta).toBeCloseTo(Number(first.amount));
    expect(after.onTimeRate).toBeLessThanOrEqual(after.collectedRate);
  }, 40000);

  it('lists contracts expiring within 90 days in cumulative buckets', async () => {
    const unit = await addUnit('EXP');
    const end = new Date();
    end.setDate(end.getDate() + 20);

    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: unit.id,
        customerId: await createTenantCustomer(app, token, `مستأجر منتهٍ ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      })
      .expect(201);
    createdContractIds.push(contract.body.id);

    const expiring = (await kpis()).body.expiring;
    const row = expiring.contracts.find((c: { id: string }) => c.id === contract.body.id);

    expect(row).toBeTruthy();
    expect(row.daysLeft).toBeGreaterThanOrEqual(19);
    expect(row.daysLeft).toBeLessThanOrEqual(21);
    // Cumulative: a lease ending in 20 days is inside all three windows.
    expect(expiring.within30).toBeGreaterThanOrEqual(1);
    expect(expiring.within60).toBeGreaterThanOrEqual(expiring.within30);
    expect(expiring.within90).toBeGreaterThanOrEqual(expiring.within60);
  }, 40000);

  it('drops a contract from the pipeline once it has been renewed', async () => {
    const before = (await kpis()).body.expiring;
    const target = before.contracts.find((c: { tenant: string }) => c.tenant.includes(suffix));

    const end = new Date();
    end.setDate(end.getDate() + 20);
    const renewalStart = new Date(end);
    renewalStart.setDate(renewalStart.getDate() + 1);
    const renewalEnd = new Date(renewalStart);
    renewalEnd.setFullYear(renewalEnd.getFullYear() + 1);

    const renewal = await request(app.getHttpServer())
      .post(`/contracts/${target.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: renewalStart.toISOString().slice(0, 10), end: renewalEnd.toISOString().slice(0, 10) })
      .expect(201);
    createdContractIds.push(renewal.body.id);

    const after = (await kpis()).body.expiring;
    // Still expiring, but no longer *needing action* — which is the whole point
    // of the list.
    expect(after.contracts.find((c: { id: string }) => c.id === target.id)).toBeUndefined();
    expect(after.alreadyRenewed).toBeGreaterThanOrEqual(1);
  }, 40000);
});
