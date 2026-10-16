import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { decryptField } from '../src/common/crypto/field-cipher.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed at five seconds.
jest.setTimeout(300000);

/**
 * The base salary is encrypted at rest, kept out of every general employee response and out of the
 * audit log, and read or written only through its own path by holders of the salaries action on the
 * employees screen. The company owner always holds it; support mode never does.
 *
 * Rows are read from the database itself, not from server responses, so the absence of a plain value is
 * proven where it would be stored. Every absence probe is first shown to see a value that must be there.
 */
describe('Employee salary: encrypted, out of general responses, gated by the salaries action (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  let c: IsolatedCompany;
  let adminToken = '';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const globalTemplateIds: string[] = [];
  const http = () => request(app.getHttpServer());
  const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  const SALARY = 5000;
  const SALARY_TEXT = '5000.00';
  const AUDITED_SALARY = 7777.25;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'salary-a');
    c = await registerIsolatedCompany(app, 'salary-c');
    adminToken = (await http().post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })).body.accessToken;
  });

  afterAll(async () => {
    const grants = await prisma.supportAccessGrant.findMany({ where: { reason: { contains: suffix } }, select: { id: true } });
    if (grants.length) {
      const keys = grants.flatMap((g) => [`support-requested:${g.id}`, `support-entered:${g.id}`]);
      await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.notification.deleteMany({ where: { dedupeKey: { in: keys } } }));
      await prisma.supportAccessLog.deleteMany({ where: { grantId: { in: grants.map((g) => g.id) } } });
      await prisma.supportAccessGrant.deleteMany({ where: { id: { in: grants.map((g) => g.id) } } });
    }
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, c);
    for (const id of globalTemplateIds) await admin(http().delete(`/templates/${id}`));
    await app.close();
  });

  const rawRow = (company: IsolatedCompany, id: string) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$queryRaw<Record<string, string | null>[]>`SELECT * FROM employees WHERE id = ${id}`.then((r) => r[0]),
    );
  const items = (body: unknown) => (Array.isArray(body) ? body : (body as { items: unknown[] }).items) as Record<string, unknown>[];

  async function employeeToken(owner: IsolatedCompany, screenActions: Record<string, string[]> | null): Promise<string> {
    const n = Math.random().toString(36).slice(2, 7);
    const tpl = await as(owner.token)(http().post('/templates'))
      .send({ name: `salary template ${suffix} ${n}`, allowedScreens: ['employees'], ...(screenActions ? { screenActions } : {}) })
      .expect(201);
    const username = `sal-${suffix}-${n}`;
    const password = 'SalaryPass1234!';
    await as(owner.token)(http().post('/company-users')).send({ name: `employee ${username}`, username, password, permissionTemplateId: tpl.body.id, allBranches: true }).expect(201);
    const login = await http().post('/auth/login').send({ username, password }).expect(200);
    return login.body.accessToken as string;
  }

  let employeeId = '';

  it('keeps the salary out of every general employee response, and serves it on its own path', async () => {
    const north = (await as(a.token)(http().post('/branches')).send({ name: `north ${suffix}`, type: 'فرع' }).expect(201)).body.id as string;
    const south = (await as(a.token)(http().post('/branches')).send({ name: `south ${suffix}`, type: 'فرع' }).expect(201)).body.id as string;
    const created = await as(a.token)(http().post('/employees')).send({ fullName: 'Salary Holder', hireDate: '2026-01-01', branchId: north, nationalId: '1029384756' }).expect(201);
    employeeId = created.body.id;
    // Probe check: the response is the employee itself.
    expect(created.body).toMatchObject({ id: employeeId, fullName: 'Salary Holder' });
    expect(created.body).not.toHaveProperty('baseSalary');

    const set = await as(a.token)(http().put(`/employees/${employeeId}/salary`)).send({ baseSalary: SALARY }).expect(200);
    expect(set.body).toEqual({ employeeId, baseSalary: SALARY_TEXT });
    expect((await as(a.token)(http().get(`/employees/${employeeId}/salary`)).expect(200)).body).toEqual({ employeeId, baseSalary: SALARY_TEXT });

    const responses: Record<string, unknown> = {
      list: items((await as(a.token)(http().get('/employees')).expect(200)).body).find((e) => e.id === employeeId),
      detail: (await as(a.token)(http().get(`/employees/${employeeId}`)).expect(200)).body,
      update: (await as(a.token)(http().patch(`/employees/${employeeId}`)).send({ jobTitle: 'Clerk' }).expect(200)).body,
      archive: (await as(a.token)(http().patch(`/employees/${employeeId}/archive`)).send({ archived: false }).expect(200)).body,
      lookup: (await as(a.token)(http().post('/employees/find-by-national-id')).send({ nationalId: '1029384756' }).expect(200)).body,
      transfer: (await as(a.token)(http().post(`/employees/${employeeId}/transfer`)).send({ fromBranchId: north, toBranchId: south }).expect(201)).body,
      link: (await as(a.token)(http().patch(`/employees/${employeeId}/login-account`)).send({ companyUserId: null }).expect(200)).body,
    };
    for (const [name, body] of Object.entries(responses)) {
      const text = JSON.stringify(body);
      // Probe check: each response carries the employee.
      expect({ name, carriesEmployee: text.includes(employeeId) }).toEqual({ name, carriesEmployee: true });
      expect({ name, salaryField: text.includes('baseSalary'), salaryValue: text.includes(SALARY_TEXT) }).toEqual({ name, salaryField: false, salaryValue: false });
    }
  });

  it('stores the salary encrypted and bound to its row, never as a plain column', async () => {
    const row = await rawRow(a, employeeId);
    // Probe check: the row was read.
    expect(row.fullName).toBe('Salary Holder');
    expect(row).not.toHaveProperty('baseSalary');
    expect(JSON.stringify(row)).not.toContain(SALARY_TEXT);
    expect(row.baseSalaryCipher).toMatch(/^f1:test1:/);
    expect(decryptField(row.baseSalaryCipher!, `${a.companyId}|employees.baseSalary|${employeeId}`)).toBe(SALARY_TEXT);

    // Copied to another employee, the value fails to decrypt instead of reading as that employee's salary.
    const other = await as(a.token)(http().post('/employees')).send({ fullName: 'Second Employee', hireDate: '2026-01-01' }).expect(201);
    await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.$executeRaw`UPDATE employees SET "baseSalaryCipher" = ${row.baseSalaryCipher} WHERE id = ${other.body.id}`);
    await as(a.token)(http().get(`/employees/${other.body.id}/salary`)).expect(500);
    // An employee with no salary entered reads as none.
    const fresh = await as(a.token)(http().post('/employees')).send({ fullName: 'No Salary Yet', hireDate: '2026-01-01' }).expect(201);
    expect((await as(a.token)(http().get(`/employees/${fresh.body.id}/salary`)).expect(200)).body).toEqual({ employeeId: fresh.body.id, baseSalary: null });
  });

  it('a general create or update cannot carry the salary', async () => {
    await as(a.token)(http().post('/employees')).send({ fullName: 'Smuggled Salary', hireDate: '2026-01-01', baseSalary: SALARY }).expect(400);
    await as(a.token)(http().patch(`/employees/${employeeId}`)).send({ baseSalary: 1 }).expect(400);
    expect((await as(a.token)(http().get(`/employees/${employeeId}/salary`)).expect(200)).body.baseSalary).toBe(SALARY_TEXT);
  });

  it('only holders of the salaries action read or write it; a screen granted with no action list includes it', async () => {
    const clerk = await employeeToken(a, { employees: ['view', 'add', 'edit', 'delete'] });
    const listed = items((await as(clerk)(http().get('/employees')).expect(200)).body).find((e) => e.id === employeeId);
    expect(listed).toMatchObject({ id: employeeId });
    expect(listed).not.toHaveProperty('baseSalary');
    const readDenied = await as(clerk)(http().get(`/employees/${employeeId}/salary`)).expect(403);
    expect(readDenied.body.code).toBe('ACTION_FORBIDDEN');
    const writeDenied = await as(clerk)(http().put(`/employees/${employeeId}/salary`)).send({ baseSalary: 1 }).expect(403);
    expect(writeDenied.body.code).toBe('ACTION_FORBIDDEN');

    const payroll = await employeeToken(a, { employees: ['view', 'salaries'] });
    expect((await as(payroll)(http().get(`/employees/${employeeId}/salary`)).expect(200)).body.baseSalary).toBe(SALARY_TEXT);
    await as(payroll)(http().put(`/employees/${employeeId}/salary`)).send({ baseSalary: 5200 }).expect(200);
    await as(payroll)(http().put(`/employees/${employeeId}/salary`)).send({ baseSalary: SALARY }).expect(200);

    const everything = await employeeToken(a, null);
    expect((await as(everything)(http().get(`/employees/${employeeId}/salary`)).expect(200)).body.baseSalary).toBe(SALARY_TEXT);
  });

  it('another company never reaches a salary', async () => {
    await as(c.token)(http().get(`/employees/${employeeId}/salary`)).expect(404);
    await as(c.token)(http().put(`/employees/${employeeId}/salary`)).send({ baseSalary: 1 }).expect(404);
    expect((await as(a.token)(http().get(`/employees/${employeeId}/salary`)).expect(200)).body.baseSalary).toBe(SALARY_TEXT);
  });

  it('the owner always holds the salaries action, even when the company template lists the screen without it', async () => {
    const narrow = await admin(http().post('/templates'))
      .send({ name: `salary company template ${suffix}`, allowedScreens: ['employees'], screenActions: { employees: ['view', 'add', 'edit', 'delete'] } })
      .expect(201);
    globalTemplateIds.push(narrow.body.id);
    await prisma.company.update({ where: { id: c.companyId }, data: { permissionTemplateId: narrow.body.id } });

    const emp = await as(c.token)(http().post('/employees')).send({ fullName: 'Owner Held', hireDate: '2026-01-01' }).expect(201);
    await as(c.token)(http().put(`/employees/${emp.body.id}/salary`)).send({ baseSalary: 3100 }).expect(200);
    expect((await as(c.token)(http().get(`/employees/${emp.body.id}/salary`)).expect(200)).body.baseSalary).toBe('3100.00');
    const perms = await as(c.token)(http().get('/me/permissions')).expect(200);
    expect(perms.body.grants).toEqual(expect.arrayContaining(['employees:view', 'employees:salaries']));

    // The owner may grant it on: an employee whose own template lists every action holds it within that company.
    const granted = await employeeToken(c, null);
    expect((await as(granted)(http().get(`/employees/${emp.body.id}/salary`)).expect(200)).body.baseSalary).toBe('3100.00');
  });

  it('support mode on the employees screen reads employees but never a salary', async () => {
    const requested = await admin(http().post('/support-access/admin'))
      .send({ companyId: a.companyId, reason: `salary support ${suffix}`, durationMinutes: 30, screens: ['employees'] })
      .expect(201);
    await as(a.token)(http().post(`/support-access/${requested.body.id}/approve`)).expect(201);
    const support = (r: request.Test) => admin(r).set('X-Support-Company', a.companyId);
    await support(http().get('/employees')).expect(200);
    await support(http().get(`/employees/${employeeId}/salary`)).expect(403);
  });

  it('the audit log names the salary change without its value', async () => {
    await as(a.token)(http().put(`/employees/${employeeId}/salary`)).send({ baseSalary: AUDITED_SALARY }).expect(200);
    let logs: { action: string; details: unknown }[] = [];
    for (let i = 0; i < 50; i++) {
      logs = await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.auditLog.findMany({ where: { entityId: employeeId }, select: { action: true, details: true } }));
      if (JSON.stringify(logs).includes('baseSalary')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const text = JSON.stringify(logs);
    // Probe check: the log was read and names the field.
    expect(text).toContain('baseSalary');
    expect(text).not.toContain('7777');
  });
});
