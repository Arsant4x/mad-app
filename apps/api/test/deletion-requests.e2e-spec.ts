import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * حذف الحساب بصيغة SaaS (قاعدة المالك 2026-08-07): التاجر لا يمسح بياناته
 * بنفسه أبداً — يقدّم طلباً، والدعم يراجعه وينفّذه.
 *
 * What must hold: only the owner files it, one open request at a time, the
 * merchant can withdraw before a decision, support sees every tenant's
 * requests, rejection keeps the account alive — and approval actually deletes
 * the company, login and all.
 */
describe('Account deletion requests (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let templateId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const cleanupCompanyIds: string[] = [];

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  let seq = 0;
  async function makeCompany(): Promise<{ id: string; token: string; username: string }> {
    const username = `del-co-${suffix}-${seq++}`;
    const res = await admin(request(app.getHttpServer()).post('/companies'))
      .send({ username, password: 'DelPass123!', orgName: `منشأة حذف ${username}`, permissionTemplateId: templateId, subEnd: '2030-01-01' })
      .expect(201);
    cleanupCompanyIds.push(res.body.id);
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'DelPass123!' });
    return { id: res.body.id, token: login.body.accessToken, username };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    adminToken = (
      await request(app.getHttpServer()).post('/auth/login').send({
        username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan',
        password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD,
      })
    ).body.accessToken;

    const templates = await admin(request(app.getHttpServer()).get('/templates')).expect(200);
    templateId = (templates.body as { id: string; isAllScreens: boolean }[]).find((t) => t.isAllScreens)!.id;
  }, 30000);

  afterAll(async () => {
    for (const id of cleanupCompanyIds) await admin(request(app.getHttpServer()).delete(`/companies/${id}`));
    await app.close();
  });

  it('files, follows, and withdraws — one open request at a time', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);

    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'انتقال لنظام آخر' }).expect(201);
    expect(filed.body.status).toBe('PENDING');

    // A second open request is refused.
    await auth(request(app.getHttpServer()).post('/deletion-request')).send({}).expect(409);

    const mine = await auth(request(app.getHttpServer()).get('/deletion-request')).expect(200);
    expect(mine.body.id).toBe(filed.body.id);

    const cancelled = await auth(request(app.getHttpServer()).post(`/deletion-request/${filed.body.id}/cancel`)).expect(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    // After withdrawing, a fresh request is allowed again.
    await auth(request(app.getHttpServer()).post('/deletion-request')).send({}).expect(201);
  }, 60000);

  it('rejection keeps the account alive and records the note', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'تجربة' }).expect(201);

    const list = await admin(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(200);
    expect((list.body as { id: string }[]).some((r) => r.id === filed.body.id)).toBe(true);

    const rejected = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/reject`)).send({ note: 'تواصلنا معك هاتفياً' }).expect(201);
    expect(rejected.body.status).toBe('REJECTED');
    expect(rejected.body.decidedNote).toBe('تواصلنا معك هاتفياً');

    // The account still works.
    await auth(request(app.getHttpServer()).get('/customers')).expect(200);
  }, 60000);

  it('approval executes: the company is gone, login and all', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const filed = await auth(request(app.getHttpServer()).post('/deletion-request')).send({ reason: 'إغلاق النشاط' }).expect(201);

    const executed = await admin(request(app.getHttpServer()).post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'نُفِّذ بعد التأكد' }).expect(201);
    expect(executed.body.executed).toBe(true);
    expect(executed.body.companyId).toBe(co.id);

    // Login is dead — the account really is gone.
    await request(app.getHttpServer()).post('/auth/login').send({ username: co.username, password: 'DelPass123!' }).expect(401);
    // And it no longer appears in the companies list.
    const companies = await admin(request(app.getHttpServer()).get('/companies')).expect(200);
    expect((companies.body as { id: string }[]).some((c) => c.id === co.id)).toBe(false);
    // Drop from cleanup — already deleted.
    cleanupCompanyIds.splice(cleanupCompanyIds.indexOf(co.id), 1);
  }, 60000);

  it('an ordinary tenant can never reach the support endpoints', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    await auth(request(app.getHttpServer()).get('/admin/deletion-requests')).expect(403);
    await auth(request(app.getHttpServer()).post('/admin/deletion-requests/whatever/approve')).expect(403);
  }, 60000);
});
