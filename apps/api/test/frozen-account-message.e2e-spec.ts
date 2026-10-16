import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { grantTestSubscription } from './test-subscription';

// Suite budget: three registrations, one employee and a few refused requests.
jest.setTimeout(90000);

/**
 * A refused write on a frozen account names only a cause the server knows. A company born without a
 * subscription is not told that its subscription ended, a company whose subscription had a term and
 * lapsed still is, and an employee whose own account was turned off is told nothing about the
 * subscription.
 */
describe('Frozen account message (e2e)', () => {
  let app: INestApplication;
  const createdCompanyIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'FrozenPass1234!';
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const writeCustomer = (token: string, language: 'ar' | 'en') =>
    http().post('/customers').set('Authorization', `Bearer ${token}`).set('Accept-Language', language).send({ kind: 'NATURAL', name: `Customer ${suffix}` });

  async function registerOwner(): Promise<{ companyId: string; token: string }> {
    const username = `frozen-msg-${suffix}-${seq++}`;
    const res = await http()
      .post('/auth/register')
      .send({ orgName: `Frozen message ${username}`, username, password: PASSWORD, email: `${username}@example.com` })
      .expect(201);
    createdCompanyIds.push(res.body.user.companyId);
    return { companyId: res.body.user.companyId, token: res.body.accessToken };
  }

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
    const prisma = app.get(PrismaService);
    for (const id of createdCompanyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('a newly registered company is refused writing without being told its subscription ended', async () => {
    const owner = await registerOwner();

    const en = await writeCustomer(owner.token, 'en').expect(403);
    expect(en.body.code).toBe('ACCOUNT_FROZEN');
    expect(en.body.message).toMatch(/frozen/i);
    expect(en.body.message).not.toMatch(/ended/i);

    const ar = await writeCustomer(owner.token, 'ar').expect(403);
    expect(ar.body.code).toBe('ACCOUNT_FROZEN');
    expect(ar.body.message).toContain('مجمّد');
    expect(ar.body.message).not.toContain('انتهاء');
  });

  it('a company whose subscription had a term and lapsed is told its subscription ended', async () => {
    const owner = await registerOwner();
    const day = 86_400_000;
    await app.get(PrismaService).company.update({
      where: { id: owner.companyId },
      data: { subStart: new Date(Date.now() - 40 * day), subEnd: new Date(Date.now() - 10 * day), status: 'ACTIVE', frozenAt: null },
    });

    const en = await writeCustomer(owner.token, 'en').expect(403);
    expect(en.body.code).toBe('ACCOUNT_FROZEN');
    expect(en.body.message).toMatch(/subscription has ended/i);

    const ar = await writeCustomer(owner.token, 'ar').expect(403);
    expect(ar.body.message).toContain('انتهاء الاشتراك');
  });

  it('an employee whose own account is turned off is refused without a subscription cause', async () => {
    const owner = await registerOwner();
    await grantTestSubscription(app.get(PrismaService), owner.companyId);
    const ownerAuth = (r: request.Test) => r.set('Authorization', `Bearer ${owner.token}`);

    const templates = await ownerAuth(http().get('/templates')).expect(200);
    const templateId = templates.body.find((t: { isSystem: boolean; isAllScreens: boolean }) => !t.isSystem && t.isAllScreens).id;
    const employee = { username: `frozen-emp-${suffix}`, password: 'FrozenEmp1234!' };
    const created = await ownerAuth(http().post('/company-users'))
      .send({ name: 'Employee turned off', username: employee.username, password: employee.password, permissionTemplateId: templateId })
      .expect(201);
    const login = await http().post('/auth/login').send(employee).expect(200);
    const employeeToken: string = login.body.accessToken;

    await ownerAuth(http().patch(`/company-users/${created.body.id}`)).send({ status: 'FROZEN' }).expect(200);

    const en = await http().get('/customers').set('Authorization', `Bearer ${employeeToken}`).set('Accept-Language', 'en').expect(403);
    expect(en.body.code).toBe('ACCOUNT_FROZEN');
    expect(en.body.message).not.toMatch(/subscription/i);

    const ar = await http().get('/customers').set('Authorization', `Bearer ${employeeToken}`).set('Accept-Language', 'ar').expect(403);
    expect(ar.body.code).toBe('ACCOUNT_FROZEN');
    expect(ar.body.message).not.toContain('اشتراك');
  });
});
