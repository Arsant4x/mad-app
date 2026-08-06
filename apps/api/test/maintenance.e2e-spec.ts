import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Maintenance, from the tenant's phone call to sign-off.
 *
 * Two things these pin down: the lifecycle can't be jumped (no reporting
 * straight to closed), and the cost hits the ledger when the work is *done* —
 * not when it's reported, and never at all if it's cancelled.
 */
describe('Maintenance requests (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let propertyId: string;
  let unitId: string;
  let otherPropertyId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  async function balance(code: string): Promise<number> {
    const accounts = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  async function report(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId, title: 'تسريب في سخان المياه', reportedAt: '2026-03-01', ...overrides })
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
      .send({ name: `عقار الصيانة ${suffix}`, ownership: 'owned' })
      .expect(201);
    propertyId = property.body.id;

    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId, unitNo: `MT-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    unitId = unit.body.id;

    const other = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار آخر ${suffix}`, ownership: 'owned' })
      .expect(201);
    otherPropertyId = other.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('opens as a new report at normal priority', async () => {
    const res = await report({ unitId, reportedBy: 'المستأجر أبو خالد' });

    expect(res.body.status).toBe('REPORTED');
    expect(res.body.priority).toBe('NORMAL');
    expect(res.body.unit.unitNo).toBe(`MT-${suffix}`);
    expect(res.body.property.name).toContain('عقار الصيانة');
    // Nothing is known about the cost yet, so nothing is posted.
    expect(res.body.journalEntryId).toBeNull();
  }, 30000);

  it('walks the full lifecycle and posts the cost only at completion', async () => {
    const created = await report({ unitId, priority: 'URGENT' });
    const id = created.body.id;

    const assigned = await request(app.getHttpServer())
      .post(`/maintenance/${id}/assign`)
      .set('Authorization', `Bearer ${token}`)
      .send({ assignedTo: 'مؤسسة الفني للسباكة' })
      .expect(201);
    expect(assigned.body.status).toBe('ASSIGNED');

    const started = await request(app.getHttpServer())
      .post(`/maintenance/${id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startedAt: '2026-03-02' })
      .expect(201);
    expect(started.body.status).toBe('IN_PROGRESS');

    // Still nothing in the ledger while the work is in progress.
    const [expenseBefore, cashBefore] = await Promise.all([balance('5700'), balance('1000')]);

    const done = await request(app.getHttpServer())
      .post(`/maintenance/${id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completedAt: '2026-03-03', cost: 450, notes: 'استُبدل صمام الأمان' })
      .expect(201);

    expect(done.body.status).toBe('DONE');
    expect(done.body.journalEntryId).toBeTruthy();
    expect((await balance('5700')) - expenseBefore).toBeCloseTo(450);
    expect((await balance('1000')) - cashBefore).toBeCloseTo(-450);

    const closed = await request(app.getHttpServer())
      .post(`/maintenance/${id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ closedAt: '2026-03-04' })
      .expect(201);
    expect(closed.body.status).toBe('CLOSED');
  }, 40000);

  it('posts nothing when the work cost the landlord nothing', async () => {
    const created = await report();
    const id = created.body.id;

    await request(app.getHttpServer()).post(`/maintenance/${id}/start`).set('Authorization', `Bearer ${token}`).send({ startedAt: '2026-03-02' }).expect(201);

    const [expenseBefore, cashBefore] = await Promise.all([balance('5700'), balance('1000')]);

    // In-house fix, or covered by the contractor's warranty.
    const done = await request(app.getHttpServer())
      .post(`/maintenance/${id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({ completedAt: '2026-03-03' })
      .expect(201);

    expect(done.body.cost).toBeNull();
    expect(done.body.journalEntryId).toBeNull();
    expect(await balance('5700')).toBeCloseTo(expenseBefore);
    expect(await balance('1000')).toBeCloseTo(cashBefore);
  }, 40000);

  it('refuses to skip the work and jump straight to closed', async () => {
    const created = await report();

    const res = await request(app.getHttpServer())
      .post(`/maintenance/${created.body.id}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ closedAt: '2026-03-04' })
      .expect(409);

    // Names both ends, so the user sees what they actually tried to do.
    expect(res.body.message).toContain('بلاغ جديد');
    expect(res.body.message).toContain('مغلق');
  }, 30000);

  it('cancels an open request with a reason, and posts nothing', async () => {
    const created = await report();
    const [expenseBefore] = await Promise.all([balance('5700')]);

    const res = await request(app.getHttpServer())
      .post(`/maintenance/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelReason: 'أصلحه المستأجر على حسابه' })
      .expect(201);

    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelReason).toBe('أصلحه المستأجر على حسابه');
    expect(await balance('5700')).toBeCloseTo(expenseBefore);
  }, 30000);

  it('refuses to edit or move a request once it is final', async () => {
    const created = await report();
    await request(app.getHttpServer())
      .post(`/maintenance/${created.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelReason: 'مكرر' })
      .expect(201);

    // Reopening a cancelled job is a new request, not a rewind.
    await request(app.getHttpServer())
      .post(`/maintenance/${created.body.id}/start`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startedAt: '2026-03-05' })
      .expect(409);

    const edit = await request(app.getHttpServer())
      .patch(`/maintenance/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'URGENT' })
      .expect(409);
    expect(edit.body.message).toContain('ملغى');
  }, 30000);

  it('sorts urgent work to the top of the queue', async () => {
    await report({ priority: 'URGENT', title: `عاجل ${suffix}` });

    const list = await request(app.getHttpServer()).get('/maintenance').set('Authorization', `Bearer ${token}`).expect(200);

    // The list is a work queue, not an archive.
    expect(list.body[0].priority).toBe('URGENT');
  }, 30000);

  it('rejects a unit that belongs to a different property', async () => {
    const res = await request(app.getHttpServer())
      .post('/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: otherPropertyId, unitId, title: 'بلاغ خاطئ', reportedAt: '2026-03-01' })
      .expect(400);

    // Otherwise the request lands on a building nobody is looking at.
    expect(res.body.message).toContain('لا تتبع العقار');
  }, 30000);

  it('rejects a blank title', async () => {
    await request(app.getHttpServer())
      .post('/maintenance')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId, title: '   ', reportedAt: '2026-03-01' })
      .expect(400);
  }, 30000);
});
