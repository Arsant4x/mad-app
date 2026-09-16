import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Renewal creates a *new* contract rather than stretching the old one's dates.
 * That distinction is the point: the expiring lease keeps its own installments
 * and payment history, which is the record a dispute is settled against.
 */
describe('Contract renewal (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let unitId: string;
  let sourceId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdContractIds: string[] = [];

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
      .send({ name: `عقار التجديد ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `RN-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    unitId = unit.body.id;

    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId,
        tenant: `مستأجر التجديد ${suffix}`,
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
        deposit: 3000,
      })
      .expect(201);
    sourceId = contract.body.id;
    createdContractIds.push(sourceId);
  }, 60000);

  afterAll(async () => {
    for (const id of createdContractIds) {
      await request(app.getHttpServer()).post(`/contracts/${id}/cancel`).set('Authorization', `Bearer ${token}`).send({ cancelDate: '2028-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
    }
    await app.close();
  });

  it('[SPEC 16.2 16.10] creates a linked follow-on contract and leaves the original intact', async () => {
    const before = await request(app.getHttpServer()).get(`/contracts/${sourceId}`).set('Authorization', `Bearer ${token}`).expect(200);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${sourceId}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: '2027-01-01', end: '2027-12-31', value: 13200 })
      .expect(201);
    createdContractIds.push(res.body.id);

    expect(res.body.id).not.toBe(sourceId);
    expect(res.body.renewedFromId).toBe(sourceId);
    expect(Number(res.body.value)).toBe(13200);
    // Tenant details carry over — the renewal is the same tenancy.
    expect(res.body.tenant).toBe(before.body.tenant);
    expect(res.body.unitId).toBe(unitId);
    expect(res.body.installments).toHaveLength(12);

    // The expiring contract keeps its own dates, schedule and history.
    const after = await request(app.getHttpServer()).get(`/contracts/${sourceId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(after.body.end).toBe(before.body.end);
    expect(after.body.installments).toHaveLength(before.body.installments.length);
  }, 30000);

  it('[SPEC 16.10] marks a future renewal UPCOMING, not DUE', async () => {
    // The list is paginated now, so the renewal is located through the
    // server-side search (the suffix makes the tenant name unique to this run)
    // rather than assuming it lands on page 1.
    const list = await request(app.getHttpServer()).get('/contracts').query({ search: suffix }).set('Authorization', `Bearer ${token}`).expect(200);
    const renewal = list.body.items.find((c: { renewedFromId: string | null }) => c.renewedFromId === sourceId);

    // Signed and certain, but its term hasn't started — distinct from DRAFT,
    // which may never happen at all.
    expect(renewal.status).toBe('UPCOMING');
  }, 30000);

  it('refuses to renew the same contract twice', async () => {
    const res = await request(app.getHttpServer())
      .post(`/contracts/${sourceId}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: '2027-01-01', end: '2027-12-31' })
      .expect(409);

    // Names the existing renewal so the user can find it.
    expect(res.body.message).toContain('مجدَّد بالفعل');
  }, 30000);

  it('[SPEC 16.12] carries a held deposit onto the renewal without posting anything', async () => {
    // A separate lease, so the source above keeps its single-renewal state.
    const other = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: (
          await request(app.getHttpServer())
            .post('/units')
            .set('Authorization', `Bearer ${token}`)
            .send({
              propertyId: (
                await request(app.getHttpServer())
                  .post('/properties')
                  .set('Authorization', `Bearer ${token}`)
                  .send({ name: `عقار التجديد ب ${suffix}`, ownership: 'owned' })
                  .expect(201)
              ).body.id,
              unitNo: `RN2-${suffix}`,
              type: 'سكني',
              rentMonthly: 1000,
            })
            .expect(201)
        ).body.id,
        tenant: `مستأجر التجديد ب ${suffix}`,
        value: 12000,
        cycle: 'monthly',
        start: '2026-01-01',
        end: '2026-12-31',
      })
      .expect(201);
    createdContractIds.push(other.body.id);

    await request(app.getHttpServer())
      .post(`/contracts/${other.body.id}/deposits`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'RENT', amount: 2500, receivedAt: '2026-01-05' })
      .expect(201);

    const [cashBefore, depositsBefore] = await Promise.all([balance('1000'), balance('2300')]);

    const renewal = await request(app.getHttpServer())
      .post(`/contracts/${other.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: '2027-01-01', end: '2027-12-31' })
      .expect(201);
    createdContractIds.push(renewal.body.id);

    // The deposit now secures the new lease...
    expect(renewal.body.deposits).toHaveLength(1);
    expect(Number(renewal.body.deposits[0].amount)).toBeCloseTo(2500);
    expect(renewal.body.deposits[0].status).toBe('HELD');

    const source = await request(app.getHttpServer()).get(`/contracts/${other.body.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(source.body.deposits).toHaveLength(0);

    // ...and nothing moved. Refunding and re-collecting on paper would invent
    // two cash movements that never happened.
    expect(await balance('1000')).toBeCloseTo(cashBefore);
    expect(await balance('2300')).toBeCloseTo(depositsBefore);
  }, 40000);

  it('[SPEC 16.11] accepts a manually supplied contract number and rejects a duplicate', async () => {
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار الترقيم ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `RN3-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const base = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.body.id, tenant: `مستأجر الترقيم ${suffix}`, value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31' })
      .expect(201);
    createdContractIds.push(base.body.id);

    const manualNo = `MANUAL-${suffix}`;
    const renewed = await request(app.getHttpServer())
      .post(`/contracts/${base.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: '2027-01-01', end: '2027-12-31', no: manualNo })
      .expect(201);
    createdContractIds.push(renewed.body.id);
    expect(renewed.body.no).toBe(manualNo);

    // A second contract cannot take the same number.
    const dup = await request(app.getHttpServer())
      .post(`/contracts/${renewed.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: '2028-01-01', end: '2028-12-31', no: manualNo })
      .expect(409);
    expect(dup.body.message).toContain(manualNo);
  }, 40000);

  it('refuses to renew a cancelled contract', async () => {
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار الملغى ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `RN4-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.body.id, tenant: `مستأجر ملغى ${suffix}`, value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31' })
      .expect(201);
    createdContractIds.push(contract.body.id);

    await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2026-06-30', cancelReason: 'إخلاء مبكر', installmentDisposition: 'cancel' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/contracts/${contract.body.id}/renew`)
      .set('Authorization', `Bearer ${token}`)
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: '2027-01-01', end: '2027-12-31' })
      .expect(409);
    expect(res.body.message).toContain('ملغى');
  }, 40000);
});
