import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// Suite budget: a first estimate, to be set to three times the first time measured in CI.
jest.setTimeout(120000);

/**
 * The tenant guard enforces the delegation chain, not only the template.
 *
 * /me/permissions, tasks and the credit override already narrow an employee to
 * what their delegation chains still grant; the guard must reach the same verdict
 * on every request, so a revoked delegation stops on the very next call.
 *
 * The company is isolated and kept: the delegation log is append only and its
 * foreign key restricts deleting the company, like the companies tasks.e2e leaves.
 */
describe('Delegation chain in the tenant guard (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let contractId: string;
  let editTemplateId: string;
  let viewTemplateId: string;
  let managerTemplateId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let userSeq = 0;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const owner = (r: request.Test) => as(company.token)(r);

  const isoDay = (d: Date) => d.toISOString().slice(0, 10);

  async function makeTemplate(name: string, allowedScreens: string[], screenActions: Record<string, string[]>): Promise<string> {
    const res = await owner(http().post('/templates')).send({ name: `${name} ${suffix}`, isAllScreens: false, allowedScreens, screenActions }).expect(201);
    return res.body.id as string;
  }

  async function makeEmployee(templateId: string): Promise<{ id: string; token: string }> {
    const username = `dg-${suffix}-${userSeq++}`;
    const password = 'DelegGuard123!';
    const res = await owner(http().post('/company-users')).send({ name: username, username, password, permissionTemplateId: templateId }).expect(201);
    const login = await http().post('/auth/login').send({ username, password }).expect(200);
    return { id: res.body.id as string, token: login.body.accessToken as string };
  }

  async function delegate(grantorToken: string, granteeId: string, nodeKey: string, grants: string[]): Promise<string> {
    const res = await as(grantorToken)(http().post('/delegations')).send({ granteeId, nodeKey, grants }).expect(201);
    expect(res.body.state).toBe('ACTIVE');
    return res.body.id as string;
  }

  async function revoke(rowId: string): Promise<void> {
    const res = await owner(http().patch(`/delegations/${rowId}/revoke`)).expect(200);
    expect(res.body.state).toBe('REVOKED');
  }

  const editContract = (token: string) =>
    as(token)(http().patch(`/contracts/${contractId}`)).send({ services: `service ${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });

  async function grantsOf(token: string): Promise<string[]> {
    const res = await as(token)(http().get('/me/permissions')).expect(200);
    return res.body.grants as string[];
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'deleg-guard');

    const property = await owner(http().post('/properties')).send({ name: `Delegation guard ${suffix}`, ownership: 'owned' }).expect(201);
    const unit = await owner(http().post('/units')).send({ propertyId: property.body.id, unitNo: `DG-${suffix}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 0));
    const contract = await owner(http().post('/contracts'))
      .send({
        unitId: unit.body.id,
        customerId: await createTenantCustomer(app, company.token, `Delegation guard tenant ${suffix}`),
        value: 12000,
        cycle: 'monthly',
        start: isoDay(start),
        end: isoDay(end),
        classification: 'RESIDENTIAL',
        vatInclusion: 'EXCLUSIVE',
      })
      .expect(201);
    contractId = contract.body.id;

    editTemplateId = await makeTemplate('contracts edit', ['contracts'], { contracts: ['view', 'edit'] });
    viewTemplateId = await makeTemplate('contracts view', ['contracts'], { contracts: ['view'] });
    managerTemplateId = await makeTemplate('contracts manager', ['contracts', 'employees'], { contracts: ['view', 'edit'], employees: ['view', 'edit'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('a revoked delegation stops the next contract edit, as /me/permissions shows', async () => {
    const emp = await makeEmployee(editTemplateId);
    const row = await delegate(company.token, emp.id, 'contracts', ['contracts:view', 'contracts:edit']);
    await editContract(emp.token).expect(200);

    await revoke(row);
    expect(await grantsOf(emp.token)).not.toContain('contracts:edit');
    const refused = await editContract(emp.token).expect(403);
    expect(refused.body.code).toBe('SCREEN_FORBIDDEN');
  });

  it('a delegation narrower than the template limits the employee to what was delegated', async () => {
    const emp = await makeEmployee(editTemplateId);
    await delegate(company.token, emp.id, 'contracts', ['contracts:view']);

    const grants = await grantsOf(emp.token);
    expect(grants).toContain('contracts:view');
    expect(grants).not.toContain('contracts:edit');
    await as(emp.token)(http().get(`/contracts/${contractId}`)).expect(200);
    const refused = await editContract(emp.token).expect(403);
    expect(refused.body.code).toBe('ACTION_FORBIDDEN');
  });

  it('revoking the delegation above a manager stops what the manager passed on, on the next request', async () => {
    const manager = await makeEmployee(managerTemplateId);
    const emp = await makeEmployee(editTemplateId);
    const contractsRow = await delegate(company.token, manager.id, 'contracts', ['contracts:view', 'contracts:edit']);
    await delegate(company.token, manager.id, 'employees', ['employees:view', 'employees:edit']);
    await delegate(manager.token, emp.id, 'contracts', ['contracts:view', 'contracts:edit']);
    await editContract(emp.token).expect(200);
    await editContract(manager.token).expect(200);

    await revoke(contractsRow);
    expect(await grantsOf(emp.token)).not.toContain('contracts:edit');
    await editContract(emp.token).expect(403);
    await editContract(manager.token).expect(403);
    // The manager keeps what the other, still active delegation grants.
    await as(manager.token)(http().get(`/delegations/${emp.id}`)).expect(200);
  });

  it('a still delegated employee keeps the delegated edit', async () => {
    const emp = await makeEmployee(editTemplateId);
    await delegate(company.token, emp.id, 'contracts', ['contracts:view', 'contracts:edit']);

    expect(await grantsOf(emp.token)).toContain('contracts:edit');
    await editContract(emp.token).expect(200);
    await editContract(emp.token).expect(200);
  });

  it('an employee with no delegation chain keeps exactly the template rights', async () => {
    const editor = await makeEmployee(editTemplateId);
    await editContract(editor.token).expect(200);

    const viewer = await makeEmployee(viewTemplateId);
    await as(viewer.token)(http().get(`/contracts/${contractId}`)).expect(200);
    const refused = await editContract(viewer.token).expect(403);
    expect(refused.body.code).toBe('ACTION_FORBIDDEN');
  });
});
