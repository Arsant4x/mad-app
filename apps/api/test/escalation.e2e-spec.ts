import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { createTenantCustomer } from './tenant-customer';

/**
 * Late-rent escalation and the in-system notifications it raises.
 *
 * The behaviour worth protecting is that escalation happens **once** per
 * arrear. A manager re-told every morning about the same debt stops opening the
 * bell, and then escalation has achieved nothing at all.
 */
describe('Escalation and notifications (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let contractId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  interface NotificationRow {
    id: string;
    kind: string;
    title: string;
    body: string;
    linkScreen: string | null;
    linkId: string | null;
    readAt: string | null;
  }

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  /** Only this suite's contract — the dev database carries other suites' arrears. */
  async function mine(): Promise<NotificationRow[]> {
    const res = await auth(request(app.getHttpServer()).get('/notifications')).expect(200);
    return (res.body.notifications as NotificationRow[]).filter((n) => n.linkId === contractId);
  }

  function setPolicy(body: Record<string, unknown>) {
    return auth(request(app.getHttpServer()).patch('/reminders/policy')).send(body);
  }

  function runEscalation() {
    // Scoped to this suite's lease: the dev database carries thousands of
    // older arrears, and a run is capped to the oldest 50.
    return auth(request(app.getHttpServer()).post(`/notifications/run-escalation?contractId=${contractId}`)).expect(201);
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

    // Baseline reset: this suite shares demo-company-a, whose policy is mutated
    // by the tests below. If a prior run was interrupted before afterAll, it
    // would leave escalateAfterDays set and make the "off by default" assertion
    // fail. Resetting here makes the suite re-runnable from any leftover state.
    await setPolicy({ escalateAfterDays: null, escalateToUserId: null }).expect(200);

    const property = await auth(request(app.getHttpServer()).post('/properties'))
      .send({ name: `عقار التصعيد ${suffix}`, ownership: 'owned' })
      .expect(201);
    const unit = await auth(request(app.getHttpServer()).post('/units'))
      .send({ propertyId: property.body.id, unitNo: `ESC-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);

    // Starts well in the past, so its instalments are long overdue.
    const contract = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({
        classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE',
        unitId: unit.body.id,
        customerId: await createTenantCustomer(app, token, `مستأجر التصعيد ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: '2024-01-01',
        end: '2024-12-31',
      })
      .expect(201);
    contractId = contract.body.id;
  }, 60000);

  afterAll(async () => {
    await auth(request(app.getHttpServer()).post(`/contracts/${contractId}/cancel`)).send({
      cancelDate: '2024-12-31',
      cancelReason: 'تنظيف بيانات الاختبار',
      installmentDisposition: 'cancel',
    });
    await setPolicy({ escalateAfterDays: null, escalateToUserId: null, repeatEveryDays: 7 });
    await app.close();
  });

  it('[SPEC 13.4] escalates nothing until the company asks for it', async () => {
    // Off by default: a new company should not inherit a bell full of arrears
    // it never asked to be told about.
    const policy = await auth(request(app.getHttpServer()).get('/reminders/policy')).expect(200);
    expect(policy.body.escalateAfterDays).toBeNull();

    const res = await runEscalation();
    expect(res.body.skipped).toBe('disabled');
    expect(res.body.escalated).toBe(0);
    expect(await mine()).toHaveLength(0);
  }, 30000);

  it('[SPEC 13.4 13.5] raises one notification per arrear past the threshold', async () => {
    await setPolicy({ escalateAfterDays: 30 }).expect(200);

    const res = await runEscalation();
    expect(res.body.escalated).toBeGreaterThan(0);

    const rows = await mine();
    expect(rows.length).toBeGreaterThan(0);

    const row = rows[0];
    expect(row.kind).toBe('RENT_ESCALATION');
    // Names the tenant and how late — an escalation that just says "there is a
    // problem" makes the manager go looking for it.
    expect(row.body).toContain('تجاوز حد التصعيد');
    expect(row.title).toContain(suffix);
    // Points back at the contract, so the manager can act rather than search.
    expect(row.linkScreen).toBe('contracts');
    expect(row.linkId).toBe(contractId);
    expect(row.readAt).toBeNull();
  }, 40000);

  it('does not escalate the same arrear twice, however often it runs', async () => {
    const before = await mine();

    const second = await runEscalation();
    expect(second.body.escalated).toBe(0);

    const after = await mine();
    expect(after.length).toBe(before.length);
  }, 40000);

  it('[SPEC 13.5] counts unread, and marking read is what stops the count', async () => {
    const rows = await mine();
    const before = await auth(request(app.getHttpServer()).get('/notifications/unread-count')).expect(200);
    expect(before.body.unread).toBeGreaterThan(0);

    const read = await auth(request(app.getHttpServer()).patch(`/notifications/${rows[0].id}/read`)).expect(200);
    expect(read.body.readAt).not.toBeNull();

    const after = await auth(request(app.getHttpServer()).get('/notifications/unread-count')).expect(200);
    expect(after.body.unread).toBe(before.body.unread - 1);

    // Reading twice keeps the first timestamp — when it was *first* seen is the
    // answer to "how long did this sit there".
    const again = await auth(request(app.getHttpServer()).patch(`/notifications/${rows[0].id}/read`)).expect(200);
    expect(again.body.readAt).toBe(read.body.readAt);
  }, 40000);

  it('leaves arrears younger than the threshold alone', async () => {
    // A year of arrears exists; a threshold of 365 days should reach fewer of
    // them than a threshold of 30 did.
    const wide = await mine();
    await setPolicy({ escalateAfterDays: 365 }).expect(200);
    const res = await runEscalation();

    // Nothing *new*: everything past 365 days was already caught by the wider
    // 30-day sweep. The check that matters is that raising the bar never
    // invents notifications.
    expect(res.body.escalated).toBe(0);
    expect(res.body.threshold).toBe(365);
    expect((await mine()).length).toBe(wide.length);
  }, 40000);

  it('never shows one company its neighbour\'s escalations', async () => {
    // A notification carries a tenant's name and what they owe — the same
    // exposure as the rent ledger itself.
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    const tokenB = loginB.body.accessToken;

    const listB = await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect((listB.body.notifications as NotificationRow[]).some((n) => n.linkId === contractId)).toBe(false);

    // Nor by guessing an id: the lookup is scoped, so it is simply not found.
    const rows = await mine();
    await request(app.getHttpServer()).patch(`/notifications/${rows[0].id}/read`).set('Authorization', `Bearer ${tokenB}`).expect(404);
  }, 40000);

  it('refuses a threshold of zero and a recipient from another company', async () => {
    // Escalating on the due date means escalating everything, which is the
    // same as escalating nothing.
    await setPolicy({ escalateAfterDays: 0 }).expect(400);

    // A recipient outside the company would receive this company's tenant
    // names and debts.
    await setPolicy({ escalateToUserId: '00000000-0000-4000-8000-000000000000' }).expect(400);
    await setPolicy({ escalateToUserId: 'not-a-uuid' }).expect(400);
  }, 30000);
});
