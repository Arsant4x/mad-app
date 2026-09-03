import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Granular, per-screen action permissions (owner's requirement #4).
 *
 * The owner grants an employee specific actions on a screen — "view contracts",
 * "add contracts" — via their permission template's `screenActions`. The guard
 * enforces @RequiresAction on top of the screen check. Verified through the
 * contracts screen (view/add wired):
 *  - a view-only employee reads contracts but is refused creation (403);
 *  - a view+add employee gets past the guard (creation reaches validation, 400,
 *    not 403);
 *  - a template with a screen but no action detail keeps full access
 *    (backward-compat — pre-existing templates never regress).
 *
 * A guard 403 fires before body validation, so an empty POST cleanly separates
 * "blocked by permission" (403) from "allowed through" (400).
 */
describe('Granular action permissions (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let ownerToken: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const templateIds: string[] = [];
  const userIds: string[] = [];

  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${ownerToken}`);

  async function makeTemplate(name: string, body: Record<string, unknown>): Promise<string> {
    const res = await admin(request(app.getHttpServer()).post('/templates')).send({ name, ...body }).expect(201);
    templateIds.push(res.body.id);
    return res.body.id;
  }

  async function makeEmployeeToken(templateId: string): Promise<string> {
    const username = `emp-${suffix}-${userIds.length}`;
    const password = 'EmpPass123!';
    const res = await owner(request(app.getHttpServer()).post('/company-users')).send({ name: `موظف ${username}`, username, password, permissionTemplateId: templateId }).expect(201);
    userIds.push(res.body.id);
    return (await request(app.getHttpServer()).post('/auth/login').send({ username, password })).body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    adminToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })).body.accessToken;
    ownerToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
  }, 30000);

  afterAll(async () => {
    for (const id of userIds) await owner(request(app.getHttpServer()).delete(`/company-users/${id}`));
    for (const id of templateIds) await admin(request(app.getHttpServer()).delete(`/templates/${id}`));
    await app.close();
  });

  it('[SPEC 1.4] a view-only employee reads contracts but cannot create one', async () => {
    const tpl = await makeTemplate(`عرض العقود ${suffix}`, { allowedScreens: ['contracts'], screenActions: { contracts: ['view'] } });
    const token = await makeEmployeeToken(tpl);
    const emp = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    await emp(request(app.getHttpServer()).get('/contracts')).expect(200);
    const denied = await emp(request(app.getHttpServer()).post('/contracts')).send({}).expect(403);
    expect(denied.body.code).toBe('ACTION_FORBIDDEN');
  }, 40000);

  it('[SPEC 1.4] a view+add employee gets past the guard on create (reaches validation, not 403)', async () => {
    const tpl = await makeTemplate(`إضافة العقود ${suffix}`, { allowedScreens: ['contracts'], screenActions: { contracts: ['view', 'add'] } });
    const token = await makeEmployeeToken(tpl);
    const emp = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    await emp(request(app.getHttpServer()).get('/contracts')).expect(200);
    // Empty body → 400 from validation means the action guard let it through.
    await emp(request(app.getHttpServer()).post('/contracts')).send({}).expect(400);
  }, 40000);

  it('a screen with no action detail keeps full access (backward compat)', async () => {
    const tpl = await makeTemplate(`عقود بلا تفصيل ${suffix}`, { allowedScreens: ['contracts'] });
    const token = await makeEmployeeToken(tpl);
    const emp = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

    await emp(request(app.getHttpServer()).get('/contracts')).expect(200);
    // No screenActions ⇒ all actions ⇒ create passes the guard (400 validation).
    await emp(request(app.getHttpServer()).post('/contracts')).send({}).expect(400);
  }, 40000);
});
