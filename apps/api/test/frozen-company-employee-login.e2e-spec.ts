import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { grantTestSubscription } from './test-subscription';

// Suite budget: five registrations, one employee each, and a few logins and refreshes.
jest.setTimeout(120000);

const DAY = 86_400_000;

/**
 * An employee refused at login or refresh is told the state the company is really in: frozen with
 * the frozen message (and no "subscription ended" when there never was one), stopped as stopped.
 * An employee who already holds a session of a frozen company keeps read only access.
 */
describe('Employee login of a frozen company (e2e)', () => {
  let app: INestApplication;
  const createdCompanyIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'FrozenLogin1234!';
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const prisma = () => app.get(PrismaService);

  const refreshCookieOf = (res: request.Response): string => {
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));
    if (!raw) throw new Error(`no refresh cookie in the login answer: ${JSON.stringify(res.headers['set-cookie'])}`);
    return raw.split(';')[0];
  };

  /** A company with a paid term, one employee, and that employee's live session. */
  async function companyWithEmployee(): Promise<{ companyId: string; employee: { username: string; password: string }; token: string; cookie: string }> {
    const n = seq++;
    const username = `frozen-login-${suffix}-${n}`;
    const reg = await http()
      .post('/auth/register')
      .send({ orgName: `Frozen login ${username}`, username, password: PASSWORD, email: `${username}@example.com` })
      .expect(201);
    const companyId: string = reg.body.user.companyId;
    createdCompanyIds.push(companyId);
    await grantTestSubscription(prisma(), companyId);
    const ownerAuth = (r: request.Test) => r.set('Authorization', `Bearer ${reg.body.accessToken}`);

    const templates = await ownerAuth(http().get('/templates')).expect(200);
    const templateId = templates.body.find((t: { isSystem: boolean; isAllScreens: boolean }) => !t.isSystem && t.isAllScreens).id;
    const employee = { username: `frozen-login-emp-${suffix}-${n}`, password: 'FrozenLoginEmp1234!' };
    await ownerAuth(http().post('/company-users'))
      .send({ name: 'Employee', username: employee.username, password: employee.password, permissionTemplateId: templateId })
      .expect(201);
    const login = await http().post('/auth/login').send(employee).expect(200);
    return { companyId, employee, token: login.body.accessToken, cookie: refreshCookieOf(login) };
  }

  /** As born: the term has no length and the company is frozen. */
  const neverSubscribed = (companyId: string) =>
    prisma().company.update({ where: { id: companyId }, data: { subStart: new Date(Date.now() - 2 * DAY), subEnd: new Date(Date.now() - 2 * DAY), status: 'FROZEN', frozenAt: new Date(Date.now() - 2 * DAY) } });

  /** A term that ran and ended ten days ago, inside the grace period. */
  const lapsed = (companyId: string) =>
    prisma().company.update({ where: { id: companyId }, data: { subStart: new Date(Date.now() - 40 * DAY), subEnd: new Date(Date.now() - 10 * DAY), status: 'FROZEN', frozenAt: new Date(Date.now() - 10 * DAY) } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    await app.get(PrismaService).$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    for (const id of createdCompanyIds) await hardDeleteCompanyForTest(prisma(), id);
    await app.close();
  });

  it('an employee of a company that never subscribed is told the account is frozen, not stopped', async () => {
    const c = await companyWithEmployee();
    await neverSubscribed(c.companyId);

    const en = await http().post('/auth/login').set('Accept-Language', 'en').send(c.employee).expect(403);
    expect(en.body.code).toBe('ACCOUNT_FROZEN');
    expect(en.body.message).toMatch(/frozen/i);
    expect(en.body.message).not.toMatch(/ended|stopped/i);

    const ar = await http().post('/auth/login').set('Accept-Language', 'ar').send(c.employee).expect(403);
    expect(ar.body.code).toBe('ACCOUNT_FROZEN');
    expect(ar.body.message).toContain('مجمّد');
    expect(ar.body.message).not.toContain('انتهاء');

    const refreshed = await http().post('/auth/refresh').set('Cookie', c.cookie).set('Accept-Language', 'en').expect(403);
    expect(refreshed.body.code).toBe('ACCOUNT_FROZEN');
    expect(refreshed.body.message).not.toMatch(/ended|stopped/i);
  });

  it('an employee of a company whose subscription lapsed is told the subscription ended', async () => {
    const c = await companyWithEmployee();
    await lapsed(c.companyId);

    const en = await http().post('/auth/login').set('Accept-Language', 'en').send(c.employee).expect(403);
    expect(en.body.code).toBe('ACCOUNT_FROZEN');
    expect(en.body.message).toMatch(/subscription has ended/i);

    const refreshed = await http().post('/auth/refresh').set('Cookie', c.cookie).set('Accept-Language', 'ar').expect(403);
    expect(refreshed.body.code).toBe('ACCOUNT_FROZEN');
    expect(refreshed.body.message).toContain('انتهاء الاشتراك');
  });

  it('an employee of a stopped company is still told the account is stopped', async () => {
    const c = await companyWithEmployee();
    await prisma().company.update({ where: { id: c.companyId }, data: { status: 'STOPPED' } });

    const en = await http().post('/auth/login').set('Accept-Language', 'en').send(c.employee).expect(403);
    expect(en.body.code).toBe('ACCOUNT_STOPPED');
    expect(en.body.message).toMatch(/stopped/i);
  });

  it('a company still marked frozen after its grace period is answered as stopped', async () => {
    const c = await companyWithEmployee();
    await prisma().company.update({
      where: { id: c.companyId },
      data: { subStart: new Date(Date.now() - 100 * DAY), subEnd: new Date(Date.now() - 60 * DAY), status: 'FROZEN', frozenAt: new Date(Date.now() - 60 * DAY) },
    });

    const en = await http().post('/auth/login').set('Accept-Language', 'en').send(c.employee).expect(403);
    expect(en.body.code).toBe('ACCOUNT_STOPPED');
  });

  it('an employee holding a session of a frozen company keeps read only access', async () => {
    const c = await companyWithEmployee();
    await lapsed(c.companyId);
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

    await auth(http().get('/customers')).expect(200);
    const write = await auth(http().post('/customers')).set('Accept-Language', 'en').send({ kind: 'NATURAL', name: `Customer ${suffix}` }).expect(403);
    expect(write.body.code).toBe('ACCOUNT_FROZEN');
  });
});
