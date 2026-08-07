import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Subscription lifecycle — the owner's three rules:
 *  1. subStart is fixed to the activation day; a backdated start is refused.
 *  2. After expiry a grace period lets the tenant read + export but not
 *     add/edit/delete.
 *  3. The tenant renews from inside the platform, and that works even while
 *     frozen or stopped (no contacting the provider).
 */
describe('Subscription lifecycle (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let templateId: string;
  const createdCompanyIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  function iso(daysFromToday: number): string {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
  }

  let seq = 0;
  async function createCompany(fields: Record<string, unknown>): Promise<{ id: string; username: string; password: string }> {
    const username = `sub-co-${suffix}-${seq++}`;
    const password = 'SubPass123!';
    const res = await admin(request(app.getHttpServer()).post('/companies'))
      .send({ username, password, orgName: `منشأة اشتراك ${username}`, permissionTemplateId: templateId, ...fields });
    if (res.body?.id) createdCompanyIds.push(res.body.id);
    return { id: res.body?.id, username, password, ...({ status: res.status } as object) } as { id: string; username: string; password: string };
  }

  async function loginToken(username: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/auth/login').send({ username, password });
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const devUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
    const devPassword = process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;
    adminToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: devUsername, password: devPassword })).body.accessToken;

    // A full-access template so the throwaway companies aren't screen-blocked
    // (this suite tests subscription state, not per-screen permissions).
    const templates = await admin(request(app.getHttpServer()).get('/templates')).expect(200);
    const tpl = (templates.body as { id: string; isAllScreens: boolean }[]).find((t) => t.isAllScreens) ?? templates.body[0];
    templateId = tpl.id;
  }, 30000);

  afterAll(async () => {
    for (const id of createdCompanyIds) await admin(request(app.getHttpServer()).delete(`/companies/${id}`));
    await app.close();
  });

  it('#1 fixes subStart to the activation day and refuses a backdated start', async () => {
    // Backdated → rejected.
    await admin(request(app.getHttpServer()).post('/companies'))
      .send({ username: `sub-back-${suffix}`, password: 'SubPass123!', orgName: 'منشأة', permissionTemplateId: templateId, subStart: iso(-3), subEnd: iso(30) })
      .expect(400);

    // Omitted → server anchors it to today.
    const co = await createCompany({ subEnd: iso(30) });
    expect(co.id).toBeTruthy();
    const token = await loginToken(co.username, co.password);
    const sub = await request(app.getHttpServer()).get('/subscription').set('Authorization', `Bearer ${token}`).expect(200);
    // subStart is the UTC date of the activation moment. Accept today or
    // yesterday (UTC) so a run that straddles midnight UTC isn't flaky.
    const todayUtc = new Date().toISOString().slice(0, 10);
    const y = new Date();
    y.setUTCDate(y.getUTCDate() - 1);
    expect([y.toISOString().slice(0, 10), todayUtc]).toContain(sub.body.subStart);
    expect(sub.body.status).toBe('ACTIVE');
  }, 40000);

  it('#3 renews from inside the platform and extends the end date', async () => {
    const co = await createCompany({ subEnd: iso(10) });
    const token = await loginToken(co.username, co.password);

    const before = await request(app.getHttpServer()).get('/subscription').set('Authorization', `Bearer ${token}`).expect(200);
    expect(before.body.status).toBe('ACTIVE');

    const renewed = await request(app.getHttpServer()).post('/subscription/renew').set('Authorization', `Bearer ${token}`).send({ months: 12 }).expect(201);
    expect(renewed.body.status).toBe('ACTIVE');
    expect(new Date(renewed.body.subEnd).getTime()).toBeGreaterThan(new Date(before.body.subEnd).getTime());
  }, 40000);

  it('#2 grace period: expired tenant can read but not write, then renewal reactivates writes', async () => {
    // subEnd in the past → frozen on first evaluation (at login).
    const co = await createCompany({ subEnd: iso(-1) });
    const token = await loginToken(co.username, co.password);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    // Read is allowed during grace.
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);
    // Writing is not.
    await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميل ${suffix}` }).expect(403);

    const sub = await auth(request(app.getHttpServer()).get('/subscription')).expect(200);
    expect(sub.body.status).toBe('FROZEN');
    expect(sub.body.inGrace).toBe(true);

    // Renewal works from inside the freeze and restores writes.
    await auth(request(app.getHttpServer()).post('/subscription/renew')).send({ months: 1 }).expect(201);
    await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميل ${suffix}-2` }).expect(201);
  }, 40000);
});
