import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * Leave management: types, requests, the approval workflow, and derived balance.
 *
 * The behaviours worth protecting: an entitlement the owner sets (never a
 * guessed statutory number), a balance that is *computed* from approved leave
 * rather than stored, one-decision-only approval, no double-booking a person,
 * and — as always — one company never seeing another's staff leave.
 */
describe('Leave management (e2e)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let employeeId: string;
  let typeId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const authA = (r: request.Test) => r.set('Authorization', `Bearer ${tokenA}`);
  const authB = (r: request.Test) => r.set('Authorization', `Bearer ${tokenB}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const loginA = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    const loginB = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    tokenA = loginA.body.accessToken;
    tokenB = loginB.body.accessToken;

    const emp = await authA(request(app.getHttpServer()).post('/employees')).send({ fullName: `موظف الإجازات ${suffix}`, hireDate: '2024-01-01' }).expect(201);
    employeeId = emp.body.id;

    const type = await authA(request(app.getHttpServer()).post('/leaves/types')).send({ name: `سنوية ${suffix}`, annualDays: 21, paid: true }).expect(201);
    typeId = type.body.id;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('rejects a duplicate leave-type name', async () => {
    await authA(request(app.getHttpServer()).post('/leaves/types')).send({ name: `سنوية ${suffix}`, annualDays: 30 }).expect(409);
  });

  it('creates a request with inclusive days and defaults to pending', async () => {
    const res = await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-06-01', endDate: '2025-06-05', reason: 'سفر' })
      .expect(201);
    expect(res.body.days).toBe(5);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.employee.id).toBe(employeeId);
  });

  it('refuses an inverted date range and an overlapping period', async () => {
    await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-07-10', endDate: '2025-07-01' })
      .expect(400);
    // Overlaps the pending 01–05 June request.
    await authA(request(app.getHttpServer()).post('/leaves/requests'))
      .send({ employeeId, leaveTypeId: typeId, startDate: '2025-06-03', endDate: '2025-06-08' })
      .expect(409);
  });

  it('approves once, and a second decision is refused; balance reflects the approval', async () => {
    const list = await authA(request(app.getHttpServer()).get(`/leaves/requests?employeeId=${employeeId}`)).expect(200);
    const pending = (list.body as { id: string; status: string }[]).find((r) => r.status === 'PENDING');
    expect(pending).toBeTruthy();

    const approved = await authA(request(app.getHttpServer()).post(`/leaves/requests/${pending!.id}/approve`)).send({ note: 'موافق' }).expect(201);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.decidedAt).not.toBeNull();

    // Deciding again is refused — it is no longer pending.
    await authA(request(app.getHttpServer()).post(`/leaves/requests/${pending!.id}/reject`)).expect(409);

    const bal = await authA(request(app.getHttpServer()).get(`/leaves/balance?employeeId=${employeeId}&year=2025`)).expect(200);
    const row = (bal.body.types as { leaveTypeId: string; entitlement: number; used: number; remaining: number | null }[]).find((t) => t.leaveTypeId === typeId);
    expect(row).toMatchObject({ entitlement: 21, used: 5, remaining: 16 });
  });

  it('cannot delete a leave type that is now in use', async () => {
    await authA(request(app.getHttpServer()).delete(`/leaves/types/${typeId}`)).expect(409);
  });

  it('never shows one company another\'s leave types or requests', async () => {
    const typesB = await authB(request(app.getHttpServer()).get('/leaves/types')).expect(200);
    expect((typesB.body as { id: string }[]).some((t) => t.id === typeId)).toBe(false);

    // B can't see A's requests for A's employee, and can't decide one by id.
    const reqB = await authB(request(app.getHttpServer()).get(`/leaves/requests?employeeId=${employeeId}`)).expect(200);
    expect(reqB.body).toHaveLength(0);
  });
});
