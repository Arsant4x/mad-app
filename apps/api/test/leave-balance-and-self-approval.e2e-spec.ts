import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: about three times the measured run, which registers a company and three logins.
jest.setTimeout(120000);

type LeaveRow = { id: string; status: string; days: number; decidedById: string | null; selfApproved?: boolean };
type BalanceRow = { leaveTypeId: string; entitlement: number; used: number; remaining: number | null };

/**
 * A leave request is checked against what is left of the entitlement, both when it is filed and when it is approved,
 * and an approver who is the employee on leave counts as approving their own leave even when a colleague filed it.
 */
describe('Leave entitlement and self approval', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const tag = () => `${suffix}-${++seq}`;
  const http = () => request(app.getHttpServer());
  const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asOwner = (r: request.Test) => as(company.token)(r);

  let templateId: string;

  const newEmployee = async (fullName: string): Promise<string> =>
    ((await asOwner(http().post('/employees')).send({ fullName, hireDate: '2024-01-01' }).expect(201)).body as { id: string }).id;
  const newType = async (name: string, annualDays: number): Promise<string> =>
    ((await asOwner(http().post('/leaves/types')).send({ name, annualDays, paid: true }).expect(201)).body as { id: string }).id;
  const newAccount = async (name: string): Promise<{ id: string; token: string }> => {
    const username = `leave-${tag()}`;
    const res = await asOwner(http().post('/company-users')).send({ name, username, password: 'LeavePass123!', permissionTemplateId: templateId, allBranches: true }).expect(201);
    const token = (await http().post('/auth/login').send({ username, password: 'LeavePass123!' }).expect(200)).body.accessToken as string;
    return { id: res.body.id as string, token };
  };
  const file = (token: string, employeeId: string, leaveTypeId: string, startDate: string, endDate: string) =>
    as(token)(http().post('/leaves/requests')).send({ employeeId, leaveTypeId, startDate, endDate });
  const approve = (token: string, id: string) => as(token)(http().post(`/leaves/requests/${id}/approve`)).send({});
  const balanceOf = async (employeeId: string, leaveTypeId: string, year: number): Promise<BalanceRow | undefined> =>
    ((await asOwner(http().get(`/leaves/balance?employeeId=${employeeId}&year=${year}`)).expect(200)).body.types as BalanceRow[]).find((t) => t.leaveTypeId === leaveTypeId);
  const rowOf = async (employeeId: string, id: string): Promise<LeaveRow | undefined> =>
    ((await asOwner(http().get(`/leaves/requests?employeeId=${employeeId}`)).expect(200)).body as LeaveRow[]).find((r) => r.id === id);
  const setTwoPersons = (on: boolean) => asOwner(http().patch('/company-profile')).send({ leaveApprovalRequiresTwoPersons: on }).expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'leave-balance');
    templateId = ((await asOwner(http().post('/templates')).send({ name: `HR ${suffix}`, allowedScreens: ['dashboard', 'employees'] }).expect(201)).body as { id: string }).id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a request longer than what is left of the entitlement, naming the leave type', async () => {
    const employeeId = await newEmployee(`Employee ${tag()}`);
    const typeName = `Annual ${tag()}`;
    const typeId = await newType(typeName, 10);
    const first = (await file(company.token, employeeId, typeId, '2025-03-01', '2025-03-06').expect(201)).body as LeaveRow;
    await approve(company.token, first.id).expect(201);

    const res = await file(company.token, employeeId, typeId, '2025-05-01', '2025-05-05');

    expect({ status: res.status, message: res.body.message }).toEqual({ status: 400, message: expect.stringContaining(typeName) });
    expect(await balanceOf(employeeId, typeId, 2025)).toMatchObject({ entitlement: 10, used: 6, remaining: 4 });
  });

  it('accepts a request that uses exactly what is left, and a type with no fixed entitlement is never refused', async () => {
    const employeeId = await newEmployee(`Employee ${tag()}`);
    const typeId = await newType(`Annual ${tag()}`, 10);
    const first = (await file(company.token, employeeId, typeId, '2025-03-01', '2025-03-06').expect(201)).body as LeaveRow;
    await approve(company.token, first.id).expect(201);
    await file(company.token, employeeId, typeId, '2025-05-01', '2025-05-04').expect(201);

    const unpaidId = await newType(`Unpaid ${tag()}`, 0);
    await file(company.token, employeeId, unpaidId, '2025-07-01', '2025-08-09').expect(201);
  });

  it('refuses an approval once earlier approvals have used the entitlement, and the balance never goes below zero', async () => {
    const employeeId = await newEmployee(`Employee ${tag()}`);
    const typeName = `Annual ${tag()}`;
    const typeId = await newType(typeName, 8);
    // Each request fits on its own when filed, since nothing is approved yet.
    const a = (await file(company.token, employeeId, typeId, '2025-03-01', '2025-03-05').expect(201)).body as LeaveRow;
    const b = (await file(company.token, employeeId, typeId, '2025-04-01', '2025-04-05').expect(201)).body as LeaveRow;
    await approve(company.token, a.id).expect(201);

    const res = await approve(company.token, b.id);

    expect({ status: res.status, message: res.body.message }).toEqual({ status: 400, message: expect.stringContaining(typeName) });
    expect(await rowOf(employeeId, b.id)).toMatchObject({ status: 'PENDING', decidedById: null });
    expect(await balanceOf(employeeId, typeId, 2025)).toMatchObject({ entitlement: 8, used: 5, remaining: 3 });
  });

  it('an approver whose own leave a colleague filed is refused under two person approval, and another approver passes', async () => {
    const employeeName = `Manager ${tag()}`;
    const managerEmployee = await newEmployee(employeeName);
    const manager = await newAccount(`Manager account ${tag()}`);
    const colleague = await newAccount(`Colleague account ${tag()}`);
    await asOwner(http().patch(`/employees/${managerEmployee}/login-account`)).send({ companyUserId: manager.id }).expect(200);
    const typeId = await newType(`Annual ${tag()}`, 30);
    const filed = (await file(colleague.token, managerEmployee, typeId, '2025-06-01', '2025-06-03').expect(201)).body as LeaveRow;

    await setTwoPersons(true);
    try {
      const own = await approve(manager.token, filed.id);
      expect({ status: own.status, message: own.body.message }).toEqual({ status: 403, message: expect.stringContaining(employeeName) });
      expect(await rowOf(managerEmployee, filed.id)).toMatchObject({ status: 'PENDING', decidedById: null });

      const byOwner = await approve(company.token, filed.id);
      expect(byOwner.status).toBe(201);
    } finally {
      await setTwoPersons(false);
    }
  });

  it('without two person approval, an approver deciding their own leave is marked and recorded as self approval', async () => {
    const managerEmployee = await newEmployee(`Manager ${tag()}`);
    const manager = await newAccount(`Manager account ${tag()}`);
    const colleague = await newAccount(`Colleague account ${tag()}`);
    await asOwner(http().patch(`/employees/${managerEmployee}/login-account`)).send({ companyUserId: manager.id }).expect(200);
    const typeId = await newType(`Annual ${tag()}`, 30);
    const filed = (await file(colleague.token, managerEmployee, typeId, '2025-06-01', '2025-06-03').expect(201)).body as LeaveRow;

    const decided = await approve(manager.token, filed.id).expect(201);
    expect((decided.body as LeaveRow).selfApproved).toBe(true);

    const trail = (await asOwner(http().get('/audit-log?action=self-review')).expect(200)).body as { entityId: string | null }[];
    expect(trail.map((e) => e.entityId)).toContain(filed.id);

    // A colleague approving someone else's leave they did not file is not a self approval.
    const otherEmployee = await newEmployee(`Employee ${tag()}`);
    const byOwner = (await file(company.token, otherEmployee, typeId, '2025-06-01', '2025-06-03').expect(201)).body as LeaveRow;
    const plain = await approve(colleague.token, byOwner.id).expect(201);
    expect((plain.body as LeaveRow).selfApproved).toBe(false);
  });
});
