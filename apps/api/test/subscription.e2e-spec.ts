import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

jest.setTimeout(150000);

/**
 * Nothing grants subscription time without payment: registration gives no trial, there is no
 * self renewal, and the platform admin cannot set a subscription when creating a company. A
 * company with no subscription can still read, export and ask to close its account.
 */
describe('Subscription lifecycle (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let templateId: string;
  const createdCompanyIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'SubPass1234!';
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  function iso(daysFromToday: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + daysFromToday);
    return d.toISOString().slice(0, 10);
  }

  async function registerOwner(): Promise<{ companyId: string; token: string; status: string }> {
    const username = `sub-reg-${suffix}-${seq++}`;
    const res = await http()
      .post('/auth/register')
      .send({ orgName: `منشأة اشتراك ${username}`, username, password: PASSWORD, email: `${username}@example.com` })
      .expect(201);
    createdCompanyIds.push(res.body.user.companyId);
    return { companyId: res.body.user.companyId, token: res.body.accessToken, status: res.body.user.status };
  }

  function adminCreate(fields: Record<string, unknown>) {
    const username = `sub-co-${suffix}-${seq++}`;
    return {
      username,
      send: () =>
        admin(http().post('/companies')).send({ username, password: PASSWORD, orgName: `منشأة اشتراك ${username}`, email: `${username}@example.com`, permissionTemplateId: templateId, ...fields }),
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const devUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
    const devPassword = process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;
    adminToken = (await http().post('/auth/login').send({ username: devUsername, password: devPassword })).body.accessToken;

    const templates = await admin(http().get('/templates')).expect(200);
    const tpl = (templates.body as { id: string; isAllScreens: boolean; isSystem: boolean; companyId: string | null }[]).find(
      (t) => t.isAllScreens && !t.isSystem && t.companyId === null,
    );
    if (!tpl) throw new Error('no public, comprehensive, non-system template in the admin list');
    templateId = tpl.id;
  }, 30000);

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    for (const id of createdCompanyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('registration grants no trial: the new company starts read only, and export and closing stay open', async () => {
    const owner = await registerOwner();
    expect(owner.status).toBe('FROZEN');
    const auth = bearer(owner.token);

    const sub = await auth(http().get('/subscription')).expect(200);
    expect(sub.body.status).toBe('FROZEN');
    expect(sub.body.subEnd).toBe(sub.body.subStart);
    expect(sub.body.neverSubscribed).toBe(true);
    expect(sub.body.inGrace).toBe(true);

    await auth(http().get('/customers')).expect(200);
    await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ${suffix}` }).expect(403);
    await auth(http().get('/export')).expect(200);
    await auth(http().get('/deletion-request/account')).expect(200);
  });

  it('has no renewal route: the owner cannot extend the subscription without payment', async () => {
    const owner = await registerOwner();
    const auth = bearer(owner.token);
    const before = await auth(http().get('/subscription')).expect(200);

    await auth(http().post('/subscription/renew')).send({ months: 36 }).expect(404);

    const after = await auth(http().get('/subscription')).expect(200);
    expect(after.body.subEnd).toBe(before.body.subEnd);
    expect(after.body.status).toBe('FROZEN');
  });

  it('admin create refuses a subscription end', async () => {
    const res = await adminCreate({ subEnd: iso(365 * 70) }).send();
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('subEnd');
  });

  it('admin create refuses a subscription start', async () => {
    const res = await adminCreate({ subStart: iso(400) }).send();
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('subStart');
  });

  it('a company the admin creates subscribes like any merchant: it starts read only', async () => {
    const co = adminCreate({});
    const created = await co.send();
    expect(created.status).toBe(201);
    createdCompanyIds.push(created.body.id);
    expect(created.body.status).toBe('FROZEN');
    expect(created.body.subEnd).toBe(created.body.subStart);

    const login = await http().post('/auth/login').send({ username: co.username, password: PASSWORD }).expect(200);
    expect(login.body.user.status).toBe('FROZEN');
    const sub = await bearer(login.body.accessToken)(http().get('/subscription')).expect(200);
    expect(sub.body.neverSubscribed).toBe(true);
  });

  it('a lapsed subscription that had a term is reported as ended, not as never subscribed', async () => {
    const owner = await registerOwner();
    const day = 86_400_000;
    await app.get(PrismaService).company.update({
      where: { id: owner.companyId },
      data: { subStart: new Date(Date.now() - 40 * day), subEnd: new Date(Date.now() - 10 * day), status: 'ACTIVE', frozenAt: null },
    });

    const sub = await bearer(owner.token)(http().get('/subscription')).expect(200);
    expect(sub.body.status).toBe('FROZEN');
    expect(sub.body.neverSubscribed).toBe(false);
  });
});
