import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * تصدير البيانات — نسخة التاجر من بياناته (النصف الآخر من «النسخ الاحتياطي»
 * بصيغة SaaS: التصدير ذاتي، أما الحذف فطلب يراجعه الدعم).
 *
 * What must hold: the owner gets one JSON document carrying its real records,
 * an employee cannot walk out with the whole database, and the file never
 * contains another company's rows.
 */
describe('Data export (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let empToken: string;
  let empId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const markerName = `عميل التصدير ${suffix}`;
  let markerId: string;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    tokenA = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;

    markerId = (await authA(request(app.getHttpServer()).post('/customers')).send({ name: markerName }).expect(201)).body.id;

    // An employee with every screen — proving the export refusal is about
    // ownership, not a missing screen permission.
    const templates = await authA(request(app.getHttpServer()).get('/templates')).expect(200);
    const tpl = (templates.body as { id: string; isAllScreens: boolean; isSystem: boolean }[]).find((t) => t.isAllScreens && !t.isSystem);
    const username = `exp-emp-${suffix}`;
    const created = await authA(request(app.getHttpServer()).post('/company-users'))
      .send({ name: `موظف ${username}`, username, password: 'ExpPass123!', permissionTemplateId: tpl!.id })
      .expect(201);
    empId = created.body.id;
    empToken = (await request(app.getHttpServer()).post('/auth/login').send({ username, password: 'ExpPass123!' })).body.accessToken;
  }, 60000);

  afterAll(async () => {
    if (empId) await authA(request(app.getHttpServer()).delete(`/company-users/${empId}`));
    if (markerId) {
      await authA(request(app.getHttpServer()).delete(`/customers/${markerId}`));
      await authA(request(app.getHttpServer()).delete(`/trash/customers/${markerId}`));
    }
    await app.close();
  });

  it('hands the owner one document with its real records inside', async () => {
    const res = await authA(request(app.getHttpServer()).get('/export')).expect(200);
    expect(res.body.format).toBe('mad-app-export');
    expect(res.body.company.orgName).toBeTruthy();

    const customers = res.body.data.customers as { id: string; name: string }[];
    expect(customers.some((c) => c.id === markerId && c.name === markerName)).toBe(true);
    // The big ledgers are present as collections, even if empty.
    for (const key of ['accounts', 'invoices', 'journalEntries', 'contracts', 'products']) {
      expect(Array.isArray(res.body.data[key])).toBe(true);
    }
  }, 60000);

  it('refuses an employee — full screens or not', async () => {
    await request(app.getHttpServer()).get('/export').set('Authorization', `Bearer ${empToken}`).expect(403);
  }, 60000);

  it('never carries another company\'s rows', async () => {
    const tokenB = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' })).body.accessToken;
    const res = await request(app.getHttpServer()).get('/export').set('Authorization', `Bearer ${tokenB}`).expect(200);
    const customers = res.body.data.customers as { id: string }[];
    expect(customers.some((c) => c.id === markerId)).toBe(false);
  }, 60000);
});
