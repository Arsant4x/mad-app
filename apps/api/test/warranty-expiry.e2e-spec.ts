import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Warranty-expiry warnings.
 *
 * A warranty is worth money only while it is live; the warning is what turns a
 * filed document into a final-inspection decision before every future fault
 * becomes the company's. The behaviour worth protecting: warn about cover
 * lapsing *soon*, never about cover that lapsed long ago or one still years
 * out — and warn **once** per warranty, never a daily repeat.
 */
describe('Warranty expiry notifications (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let propertyId: string;
  let soonId: string;
  let farId: string;
  let expiredId: string;

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

  /** Only this suite's warranties — the dev DB carries other suites' rows. */
  async function mine(): Promise<NotificationRow[]> {
    const ids = new Set([soonId, farId, expiredId]);
    const res = await auth(request(app.getHttpServer()).get('/notifications')).expect(200);
    return (res.body.notifications as NotificationRow[]).filter((n) => n.linkId && ids.has(n.linkId));
  }

  function runWarrantyCheck() {
    return auth(request(app.getHttpServer()).post('/notifications/run-warranty-check')).expect(201);
  }

  /** يومُ UTC ± أيام — كما يقيسه الفحصُ نفسُه (`startOfToday = dayStartOf(new Date())` · `ق-١١٩٠`)، لا يومُ منطقة العملية. */
  function isoDaysFromToday(days: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function createWarranty(subject: string, endDate: string): Promise<string> {
    const res = await auth(request(app.getHttpServer()).post('/warranties'))
      .send({ subject, propertyId, provider: `مورد ${suffix}`, startDate: '2024-01-01', endDate })
      .expect(201);
    return res.body.id;
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

    const property = await auth(request(app.getHttpServer()).post('/properties'))
      .send({ name: `عقار الضمان ${suffix}`, ownership: 'owned' })
      .expect(201);
    propertyId = property.body.id;

    // Three warranties spanning the decision boundary: one lapsing inside the
    // 30-day notice window, one still far out, one that lapsed already.
    soonId = await createWarranty(`مصعد ${suffix}`, isoDaysFromToday(10));
    farId = await createWarranty(`مكيّفات ${suffix}`, isoDaysFromToday(100));
    expiredId = await createWarranty(`سخان ${suffix}`, isoDaysFromToday(-5));
  }, 60000);

  afterAll(async () => {
    for (const id of [soonId, farId, expiredId]) {
      if (id) await auth(request(app.getHttpServer()).delete(`/warranties/${id}`));
    }
    await app.close();
  });

  it('[SPEC 13.5] warns only about cover lapsing soon — not far-off, not already-expired', async () => {
    const res = await runWarrantyCheck();
    expect(res.body.raised).toBeGreaterThan(0);
    expect(res.body.noticeDays).toBe(30);

    const rows = await mine();
    // Exactly the soon-expiring warranty produced a notification.
    expect(rows.map((r) => r.linkId).sort()).toEqual([soonId].sort());

    const row = rows[0];
    expect(row.kind).toBe('WARRANTY_EXPIRING');
    expect(row.linkScreen).toBe('warranties');
    expect(row.title).toContain(suffix);
    // Names why it matters, so the manager acts rather than files it again.
    expect(row.body).toContain('تتحمل الشركة كل عطل');
    expect(row.readAt).toBeNull();
  }, 40000);

  it('warns once per warranty, however often the check runs', async () => {
    const before = await mine();
    const second = await runWarrantyCheck();
    expect(second.body.raised).toBe(0);

    const after = await mine();
    expect(after.length).toBe(before.length);
  }, 40000);

  it('never shows one company its neighbour\'s warranty warnings', async () => {
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    const tokenB = loginB.body.accessToken;

    const listB = await request(app.getHttpServer()).get('/notifications').set('Authorization', `Bearer ${tokenB}`).expect(200);
    expect((listB.body.notifications as NotificationRow[]).some((n) => n.linkId === soonId)).toBe(false);
  }, 40000);
});
