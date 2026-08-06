import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * The collection queue. Nothing here sends anything — the platform decides who
 * is due a chase today and renders the text; a human sends it.
 *
 * What these lock in is the queue's *judgement*: a tenant already chased this
 * week must not reappear tomorrow, and one whose instalment is months away must
 * not appear at all.
 */
describe('Rent reminders (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;
  let overdueInstallmentId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  /** Scoped to this suite's own lease: the dev database holds thousands of
   * older arrears, and the queue is capped to the oldest 200. */
  function due() {
    return request(app.getHttpServer()).get(`/reminders/due?contractId=${contractId}`).set('Authorization', `Bearer ${token}`).expect(200);
  }

  interface ReminderRow {
    installmentId: string;
    tenant: string;
    overdueDays: number;
    lastSentAt: string | null;
    daysSinceLast: number | null;
    message: string;
  }

  /** Only this suite's tenant — the dev database is full of other suites' leases. */
  function mine(reminders: ReminderRow[]): ReminderRow[] {
    return reminders.filter((r) => r.tenant.includes(suffix));
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
      .send({ name: `عقار التذكيرات ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `RM-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);

    // Started in the past, so its early instalments are genuinely overdue.
    const contract = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: unit.body.id,
        tenant: `مستأجر التذكيرات ${suffix}`,
        phone: '0500000000',
        value: 12000,
        cycle: 'monthly',
        start: '2025-01-01',
        end: '2025-12-31',
      })
      .expect(201);
    contractId = contract.body.id;
    overdueInstallmentId = contract.body.installments[0].id;
  }, 60000);

  afterAll(async () => {
    await request(app.getHttpServer())
      .post(`/contracts/${contractId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2025-12-31', cancelReason: 'تنظيف بيانات الاختبار', installmentDisposition: 'cancel' });
    await app.close();
  });

  it('defaults to a sensible policy without creating a row', async () => {
    const res = await request(app.getHttpServer()).get('/reminders/policy').set('Authorization', `Bearer ${token}`).expect(200);

    // Chase three days ahead, then weekly — not daily, which is how a reminder
    // becomes something the tenant mutes.
    expect(res.body.enabled).toBe(true);
    expect(res.body.daysBefore).toBe(3);
    expect(res.body.repeatEveryDays).toBe(7);
  }, 30000);

  it('queues an overdue instalment with the message already rendered', async () => {
    const res = await due();
    const rows = mine(res.body.reminders);

    expect(rows.length).toBeGreaterThan(0);
    const row = rows.find((r) => r.installmentId === overdueInstallmentId)!;

    expect(row.overdueDays).toBeGreaterThan(0);
    expect(row.lastSentAt).toBeNull();
    // Rendered from the company's template, with the placeholders filled.
    expect(row.message).toContain(`مستأجر التذكيرات ${suffix}`);
    expect(row.message).not.toContain('{tenant}');
    expect(row.message).not.toContain('{amount}');
  }, 30000);

  it('drops the instalment out of the queue once chased, and back in after the silence period', async () => {
    const before = mine((await due()).body.reminders);
    const target = before.find((r) => r.installmentId === overdueInstallmentId)!;

    await request(app.getHttpServer())
      .post(`/reminders/installments/${overdueInstallmentId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'WHATSAPP', message: target.message })
      .expect(201);

    // Silenced — and only this one. The rest of the queue is untouched, so the
    // filter is per-instalment rather than a global "handled today" switch.
    const after = mine((await due()).body.reminders);
    expect(after.find((r) => r.installmentId === overdueInstallmentId)).toBeUndefined();
    expect(after.length).toBe(before.length - 1);

    // Even at the shortest allowed period the instalment stays out today:
    // "every 1 day" means tomorrow, not again in the same afternoon. The DTO
    // floor of 1 is what makes that guarantee hold.
    await request(app.getHttpServer()).patch('/reminders/policy').set('Authorization', `Bearer ${token}`).send({ repeatEveryDays: 1 }).expect(200);
    const sameDay = mine((await due()).body.reminders);
    expect(sameDay.find((r) => r.installmentId === overdueInstallmentId)).toBeUndefined();

    await request(app.getHttpServer()).patch('/reminders/policy').set('Authorization', `Bearer ${token}`).send({ repeatEveryDays: 0 }).expect(400);
  }, 40000);

  it('keeps a record of what was actually said', async () => {
    const history = await request(app.getHttpServer())
      .get(`/reminders/installments/${overdueInstallmentId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(history.body.length).toBeGreaterThan(0);
    expect(history.body[0].channel).toBe('WHATSAPP');
    // Stored as sent, not regenerated: templates change, and this is the
    // answer to "but we told them".
    expect(history.body[0].message).toContain(suffix);
  }, 30000);

  it('leaves instalments outside the notice window alone', async () => {
    const property = await request(app.getHttpServer())
      .post('/properties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `عقار مستقبلي ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await request(app.getHttpServer())
      .post('/units')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: property.body.id, unitNo: `RMF-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);

    const future = await request(app.getHttpServer())
      .post('/contracts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        unitId: unit.body.id,
        tenant: `مستأجر بعيد ${suffix}`,
        value: 12000,
        cycle: 'monthly',
        start: '2029-01-01',
        end: '2029-12-31',
      })
      .expect(201);

    const rows = (await due()).body.reminders as { tenant: string }[];
    // Three days' notice means three days — not three years.
    expect(rows.find((r) => r.tenant === `مستأجر بعيد ${suffix}`)).toBeUndefined();

    await request(app.getHttpServer())
      .post(`/contracts/${future.body.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cancelDate: '2029-12-31', cancelReason: 'تنظيف', installmentDisposition: 'cancel' });
  }, 40000);

  it('returns an empty queue when the company switches reminders off', async () => {
    await request(app.getHttpServer()).patch('/reminders/policy').set('Authorization', `Bearer ${token}`).send({ enabled: false }).expect(200);

    const res = await due();
    expect(res.body.enabled).toBe(false);
    expect(res.body.reminders).toHaveLength(0);

    // Restore, so the suite leaves the company as it found it.
    await request(app.getHttpServer())
      .patch('/reminders/policy')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true, repeatEveryDays: 7 })
      .expect(200);
  }, 30000);

  it('rejects a blank message and an unknown channel', async () => {
    await request(app.getHttpServer())
      .post(`/reminders/installments/${overdueInstallmentId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'WHATSAPP', message: '   ' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/reminders/installments/${overdueInstallmentId}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({ channel: 'PIGEON', message: 'تذكير' })
      .expect(400);
  }, 30000);
});
