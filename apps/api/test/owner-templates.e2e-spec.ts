import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * قاعدة الفاعل (CLAUDE.md §3.5) مطبَّقة على نماذج الصلاحيات: تحديد ما يفعله
 * الموظف قرارُ مالك المنشأة في واجهته — لا مدير المنصة.
 *
 * What must hold: an owner creates its own template (screens + actions) and it
 * works on its employee; a neighbour company never sees it and can never
 * assign it; the owner cannot touch global presets; global presets remain
 * visible to everyone as starting points.
 */
describe('Owner-scoped permission templates (e2e)', () => {
  let app: INestApplication;
  let ownerA: string;
  let ownerB: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let tplId: string;
  let empId: string;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${ownerA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${ownerB}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    ownerA = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    ownerB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;
  }, 30000);

  afterAll(async () => {
    if (empId) await authA(request(app.getHttpServer()).delete(`/company-users/${empId}`));
    if (tplId) await authA(request(app.getHttpServer()).delete(`/templates/${tplId}`));
    await app.close();
  });

  it('the owner creates its own template with a screens×actions matrix', async () => {
    const res = await authA(request(app.getHttpServer()).post('/templates'))
      .send({
        name: `كاتب عقود ${suffix}`,
        allowedScreens: ['contracts'],
        // «كتابة العقود»: يرى ويضيف — لا يعدّل ولا يحذف.
        screenActions: { contracts: ['view', 'add'] },
      })
      .expect(201);
    tplId = res.body.id;
    expect(res.body.companyId).not.toBeNull();
    expect(res.body.screenActions).toEqual({ contracts: ['view', 'add'] });
  }, 40000);

  it('that template governs the employee it is assigned to', async () => {
    const username = `tpl-emp-${suffix}`;
    const created = await authA(request(app.getHttpServer()).post('/company-users'))
      .send({ name: `موظف ${username}`, username, password: 'TplPass123!', permissionTemplateId: tplId })
      .expect(201);
    empId = created.body.id;
    const empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'TplPass123!' })).body.accessToken;
    const emp = (r: request.Test) => r.set('Authorization', `Bearer ${empToken}`);

    // كتابة العقود: read passes, create passes the guard (400 = validation,
    // not permission), editing is refused, and an unrelated screen is closed.
    await emp(request(app.getHttpServer()).get('/contracts')).expect(200);
    await emp(request(app.getHttpServer()).post('/contracts')).send({}).expect(400);
    const denied = await emp(request(app.getHttpServer()).patch('/contracts/00000000-0000-4000-8000-000000000000')).send({}).expect(403);
    expect(denied.body.code).toBe('ACTION_FORBIDDEN');
    await emp(request(app.getHttpServer()).get('/customers')).expect(403);
  }, 40000);

  it('a neighbour company never sees the template, and cannot assign it', async () => {
    const listB = await authB(request(app.getHttpServer()).get('/templates')).expect(200);
    expect((listB.body as { id: string }[]).some((t) => t.id === tplId)).toBe(false);

    await authB(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'موظف متسلل', username: `steal-${suffix}`, password: 'StealPass123!', permissionTemplateId: tplId })
      .expect(404);
  }, 40000);

  it('the owner cannot edit or delete a global preset', async () => {
    const list = await authA(request(app.getHttpServer()).get('/templates')).expect(200);
    const globalPreset = (list.body as { id: string; companyId: string | null }[]).find((t) => t.companyId === null);
    expect(globalPreset).toBeTruthy();

    await authA(request(app.getHttpServer()).patch(`/templates/${globalPreset!.id}`)).send({ name: 'محاولة' }).expect(404);
    await authA(request(app.getHttpServer()).delete(`/templates/${globalPreset!.id}`)).expect(404);
  }, 40000);

  it('an employee can read the list but never write it', async () => {
    const username = `tpl-emp2-${suffix}`;
    const created = await authA(request(app.getHttpServer()).post('/company-users'))
      .send({ name: `موظف ${username}`, username, password: 'TplPass123!', permissionTemplateId: tplId })
      .expect(201);
    const empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'TplPass123!' })).body.accessToken;

    await request(app.getHttpServer()).get('/templates').set('Authorization', `Bearer ${empToken}`).expect(200);
    await request(app.getHttpServer()).post('/templates').set('Authorization', `Bearer ${empToken}`).send({ name: 'محاولة موظف', allowedScreens: ['contracts'] }).expect(403);

    await authA(request(app.getHttpServer()).delete(`/company-users/${created.body.id}`));
  }, 40000);
});
