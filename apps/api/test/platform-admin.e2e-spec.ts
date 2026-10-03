import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { grantPlatformDecision, releaseSecondHand } from './platform-decision';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (17.1 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(55000);

/** A run-unique suffix, same shape as the one already used for throwaway
 * usernames below. PermissionTemplate.name is @unique by design, so any
 * template this suite creates must carry it too — a fixed name succeeds on a
 * fresh DB and then 409s on every later run against the same dev database. */
const runSuffix = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

describe('Platform admin / permission templates / company users (e2e)', () => {
  let app: INestApplication;
  let platformAdminToken: string;
  let companyAToken: string;

  // Cleaned up in afterAll so repeated runs don't leave the dev DB's template
  // list growing. Company users must go first — a template still assigned to
  // one can't be deleted (409, see TemplatesService.remove).
  const createdTemplateIds: string[] = [];
  const createdCompanyUserIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const devUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
    const devPassword = process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;
    const loginAdmin = await request(app.getHttpServer()).post('/auth/login').send({ username: devUsername, password: devPassword });
    platformAdminToken = loginAdmin.body.accessToken;

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    companyAToken = loginA.body.accessToken;
  }, 30000);

  afterAll(async () => {
    for (const id of createdCompanyUserIds) {
      await request(app.getHttpServer()).delete(`/company-users/${id}`).set('Authorization', `Bearer ${companyAToken}`);
    }
    for (const id of createdTemplateIds) {
      await request(app.getHttpServer()).delete(`/templates/${id}`).set('Authorization', `Bearer ${platformAdminToken}`);
    }
    await releaseSecondHand(app);
    await app.close();
  });

  it('template scopes (actor rule §3.5): the admin owns global presets, a company owns its own — and neither crosses over', async () => {
    // Everyone authenticated may read the list (the employee-account form
    // needs it); a company sees global presets plus its own.
    await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${companyAToken}`).expect(200);

    // A company owner MAY create templates now — that is the whole point of
    // the actor rule: employee permissions are the owner's decision. The
    // created template is company-scoped, never global.
    const ownersOwn = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ name: `نموذج مالك ${runSuffix()}`, allowedScreens: ['dashboard'] })
      .expect(201);
    expect(ownersOwn.body.companyId).not.toBeNull();

    const created = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ name: `قالب اختبار ${runSuffix()}`, allowedScreens: ['dashboard', 'invoice'] })
      .expect(201);
    expect(created.body.allowedScreens).toEqual(['dashboard', 'invoice']);
    expect(created.body.companyId).toBeNull();

    // A company touching a GLOBAL preset reads as not-found — it is outside
    // its writable scope, and 404 doesn't confirm the id exists.
    await request(app.getHttpServer())
      .patch(`/templates/${created.body.id}`)
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ name: 'محاولة تعديل من شركة' })
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/templates/${created.body.id}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ allowedScreens: ['dashboard', 'invoice', 'customers'] })
      .expect(200);

    await request(app.getHttpServer()).delete(`/templates/${created.body.id}`).set('Authorization', `Bearer ${companyAToken}`).expect(404);
    await request(app.getHttpServer()).delete(`/templates/${created.body.id}`).set('Authorization', `Bearer ${platformAdminToken}`).expect(204);
    // Clean up the owner's template through its own scope.
    await request(app.getHttpServer()).delete(`/templates/${ownersOwn.body.id}`).set('Authorization', `Bearer ${companyAToken}`).expect(204);
  });

  it('the system (developer) template cannot be edited or deleted by anyone', async () => {
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${platformAdminToken}`).expect(200);
    const devTemplate = templates.body.find((t: { isSystem: boolean }) => t.isSystem);
    expect(devTemplate).toBeDefined();

    await request(app.getHttpServer())
      .patch(`/templates/${devTemplate.id}`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ name: 'محاولة تعديل' })
      .expect(403);

    await request(app.getHttpServer()).delete(`/templates/${devTemplate.id}`).set('Authorization', `Bearer ${platformAdminToken}`).expect(403);
  });

  it('rejects deleting a template that is still assigned to a company', async () => {
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${platformAdminToken}`).expect(200);
    const inUse = templates.body.find((t: { name: string }) => t.name === 'المستخدم الأول (شامل)');
    expect(inUse).toBeDefined();

    // ⚖️ توجيه ٢٧٦ (ق-١٦٠١): القالبُ العامّ الشامل يُحمى قبل عدِّ ما يركبه — فالرفضُ 403 لا 409، ولا يُحذف وإن خلا.
    await request(app.getHttpServer()).delete(`/templates/${inUse.id}`).set('Authorization', `Bearer ${platformAdminToken}`).expect(403);
  });

  it('creates a company, rejects a duplicate username, and lets the new company log in', async () => {
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${platformAdminToken}`).expect(200);
    const fullAccess = templates.body.find((t: { isAllScreens: boolean; isSystem: boolean }) => t.isAllScreens && !t.isSystem);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const username = `plat-admin-test-${suffix}`;
    const created = await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ orgName: `شركة اختبار ${suffix}`, username, password: 'TestPass123!', permissionTemplateId: fullAccess.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ orgName: 'تكرار', username, password: 'AnotherPass123!', permissionTemplateId: fullAccess.id })
      .expect(409);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'TestPass123!' }).expect(200);
    expect(login.body.user.companyId).toBe(created.body.id);
    expect(login.body.user.actorType).toBe('COMPANY');
  });

  it('shows a lapsed subscription as FROZEN in the company list without waiting for that company to log in first, and reactivates it by pushing subEnd forward', async () => {
    const templates = await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${platformAdminToken}`).expect(200);
    const fullAccess = templates.body.find((t: { isAllScreens: boolean; isSystem: boolean }) => t.isAllScreens && !t.isSystem);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const created = await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ orgName: `شركة تجميد ${suffix}`, username: `freeze-test-${suffix}`, password: 'TestPass123!', permissionTemplateId: fullAccess.id })
      .expect(201);
    expect(created.body.status).toBe('ACTIVE');

    // ⑪A2 (`ق-١٣١٧`): الاشتراكُ انتقل إلى مسارِه — **للمالية وحدَها**، والحسابُ في مساره.
    // ⑪A1 (`ق-١٣١٨`): **وتعديلُه بيدين** — فيُطلب القرارُ ويُقرّه ثانٍ قبل كلِّ تعديل.
    await grantPlatformDecision(app, 'SUBSCRIPTION_CHANGE', created.body.id, platformAdminToken);
    await request(app.getHttpServer())
      .patch(`/companies/${created.body.id}/subscription`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ subEnd: '2020-01-01' })
      .expect(200);

    // CompaniesService.list() must evaluate lapsed subscriptions itself
    // (mirrors the mockup's renderDeveloperPanel calling
    // checkSubscriptionStatus on every render) rather than only updating
    // status the next time that company happens to log in.
    const listAfterLapse = await request(app.getHttpServer()).get('/companies').set('Authorization', `Bearer ${platformAdminToken}`).expect(200);
    const foundFrozen = listAfterLapse.body.find((c: { id: string }) => c.id === created.body.id);
    expect(foundFrozen.status).toBe('FROZEN');

    await grantPlatformDecision(app, 'SUBSCRIPTION_CHANGE', created.body.id, platformAdminToken);
    const reactivated = await request(app.getHttpServer())
      .patch(`/companies/${created.body.id}/subscription`)
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ subEnd: '2030-01-01' })
      .expect(200);
    expect(reactivated.body.status).toBe('ACTIVE');
    expect(reactivated.body.frozenAt).toBeNull();
  });

  it("keeps a company token from managing platform-level companies, and a platform-admin token from hitting a company-scoped route", async () => {
    await request(app.getHttpServer()).get('/companies').set('Authorization', `Bearer ${companyAToken}`).expect(403);
    await request(app.getHttpServer()).get('/company-users').set('Authorization', `Bearer ${platformAdminToken}`).expect(401);
  });

  it('a company owner can create a limited-permission employee sub-account, but the sub-account cannot manage other sub-accounts', async () => {
    const suffix = runSuffix();
    const limitedTemplate = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ name: `كاشير ${suffix}`, allowedScreens: ['dashboard', 'invoice', 'customers'] })
      .expect(201);
    createdTemplateIds.push(limitedTemplate.body.id);

    const username = `cashier-${suffix}`;
    const cashier = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ name: 'موظف كاشير', username, password: 'CashierPass123!', permissionTemplateId: limitedTemplate.body.id })
      .expect(201);
    createdCompanyUserIds.push(cashier.body.id);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'CashierPass123!' }).expect(200);
    expect(login.body.user.allowedScreens).toEqual(['dashboard', 'invoice', 'customers']);
    const cashierToken = login.body.accessToken;

    await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'محاولة', username: `nested-${suffix}`, password: 'NestedPass123!', permissionTemplateId: limitedTemplate.body.id })
      .expect(403);

    // قالبٌ عامٌّ يركبه موظّفٌ لا يُحذف (409) — والشاملُ محميٌّ قبل هذا العدّ (توجيه ٢٧٦)، فالعدُّ يُثبَت هنا على قالبٍ ضيّق.
    await request(app.getHttpServer()).delete(`/templates/${limitedTemplate.body.id}`).set('Authorization', `Bearer ${platformAdminToken}`).expect(409);
  });

  it("REGRESSION — a limited-permission-template company user can reach a screen it's allowed but not one it isn't (locks in the @RequiresScreen class-vs-handler reflector fix)", async () => {
    const suffix = runSuffix();
    const limitedTemplate = await request(app.getHttpServer())
      .post('/templates')
      .set('Authorization', `Bearer ${platformAdminToken}`)
      .send({ name: `محاسب فقط ${suffix}`, allowedScreens: ['invoice', 'customers'] })
      .expect(201);
    createdTemplateIds.push(limitedTemplate.body.id);

    const username = `accountant-${suffix}`;
    const accountant = await request(app.getHttpServer())
      .post('/company-users')
      .set('Authorization', `Bearer ${companyAToken}`)
      .send({ name: 'محاسب', username, password: 'AccPass123!', permissionTemplateId: limitedTemplate.body.id })
      .expect(201);
    createdCompanyUserIds.push(accountant.body.id);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'AccPass123!' }).expect(200);
    const token = login.body.accessToken;

    // 'invoice' IS in the template -> must be reachable.
    await request(app.getHttpServer()).get('/invoices').set('Authorization', `Bearer ${token}`).expect(200);
    // 'properties' is NOT in the template -> must be rejected, not silently
    // allowed (this is exactly what the class-level @RequiresScreen bug let
    // through before the getAllAndOverride fix).
    await request(app.getHttpServer()).get('/properties').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get('/warehouses').set('Authorization', `Bearer ${token}`).expect(403);
  });
});
