import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * قفل البيانات الرئيسية (gap-analysis §1).
 *
 * A company can freeze the records the whole ledger hangs off — properties and
 * contracts — so a busy clerk cannot quietly reshape the asset register. What
 * must hold: reads keep working for everyone, writes are refused for ordinary
 * employees, the owner is never locked out of their own data, and a nominated
 * employee can be exempted.
 */
describe('Master-data lock (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let empToken: string;
  let empId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${ownerToken}`);
  const emp = (r: request.Test) => r.set('Authorization', `Bearer ${empToken}`);

  const setLock = (on: boolean) =>
    owner(request(app.getHttpServer()).patch('/company-profile'))
      .send({ legalName: `شركة الاختبار ${suffix}`, masterDataLocked: on })
      .expect(200);

  const tryCreateProperty = (auth: (r: request.Test) => request.Test) =>
    auth(request(app.getHttpServer()).post('/properties')).send({ name: `عقار قفل ${suffix}-${Math.random()}`, ownership: 'owned' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    ownerToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;

    // An employee on a full-access template — so anything refused below is the
    // lock talking, not a missing screen permission.
    const templates = await owner(request(app.getHttpServer()).get('/templates')).expect(200);
    const tpl = (templates.body as { id: string; isAllScreens: boolean; isSystem: boolean }[]).find((t) => t.isAllScreens && !t.isSystem);
    const username = `lock-emp-${suffix}`;
    const created = await owner(request(app.getHttpServer()).post('/company-users'))
      .send({ name: `موظف ${username}`, username, password: 'LockPass123!', permissionTemplateId: tpl!.id })
      .expect(201);
    empId = created.body.id;
    empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'LockPass123!' })).body.accessToken;
  }, 60000);

  afterAll(async () => {
    await setLock(false).catch(() => undefined);
    if (empId) await owner(request(app.getHttpServer()).delete(`/company-users/${empId}`));
    await app.close();
  });

  it('with the lock off, an employee can create a property', async () => {
    await setLock(false);
    const res = await tryCreateProperty(emp).expect(201);
    await owner(request(app.getHttpServer()).delete(`/properties/${res.body.id}`));
  }, 40000);

  it('with the lock on, the employee is refused — but can still read', async () => {
    await setLock(true);

    const denied = await tryCreateProperty(emp).expect(403);
    expect(denied.body.code).toBe('MASTER_DATA_LOCKED');

    // Reading is untouched: the lock protects the register, not the day's work.
    await emp(request(app.getHttpServer()).get('/properties')).expect(200);
    // And an unrelated screen keeps working.
    await emp(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل ${suffix}` }).expect(201);
  }, 40000);

  it('never locks the owner out of their own data', async () => {
    const res = await tryCreateProperty(owner).expect(201);
    await owner(request(app.getHttpServer()).delete(`/properties/${res.body.id}`));
  }, 40000);

  it('an exempted employee may still maintain the register', async () => {
    await owner(request(app.getHttpServer()).patch(`/company-users/${empId}`)).send({ canEditMasterData: true }).expect(200);
    // The guard re-reads the exemption per request, so the existing token works.
    const res = await tryCreateProperty(emp).expect(201);
    await owner(request(app.getHttpServer()).delete(`/properties/${res.body.id}`));

    await owner(request(app.getHttpServer()).patch(`/company-users/${empId}`)).send({ canEditMasterData: false }).expect(200);
    await tryCreateProperty(emp).expect(403);
  }, 40000);
});
