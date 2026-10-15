import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { MailService } from '../src/common/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';

// Three times the measured run, most of it in the registrations (each one argon2 hash and a default chart).
jest.setTimeout(120000);

/**
 * The owner's e-mail is where a password reset link goes, so every owner has one: registration and the
 * platform's create path ask for it. Changing it from the company profile takes the current password,
 * and the previous address is told.
 */
describe('The owner recovery e-mail (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sendMail: jest.SpyInstance;
  let adminToken: string;
  let templateId: string;
  const companyIds: string[] = [];
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'RecoveryMail123!';

  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const storedEmail = async (companyId: string) => (await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { email: true } })).email;

  async function registerOwner(tag: string) {
    const username = `rmail-${tag}-${stamp}`;
    const email = `${username}@example.com`;
    const res = await http().post('/auth/register').send({ orgName: `منشأة ${username}`, username, password: PASSWORD, email }).expect(201);
    companyIds.push(res.body.user.companyId);
    return { username, email, companyId: res.body.user.companyId as string, token: res.body.accessToken as string };
  }

  /** The notice is sent after the change commits, so it is awaited by polling the spy. */
  async function mailTo(address: string): Promise<unknown[] | undefined> {
    for (let i = 0; i < 30; i += 1) {
      const call = sendMail.mock.calls.find((c) => c[0] === address);
      if (call) return call;
      await new Promise((r) => setTimeout(r, 100));
    }
    return undefined;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    sendMail = jest.spyOn(app.get(MailService), 'send').mockResolvedValue(undefined);
    adminToken = (
      await http()
        .post('/auth/login')
        .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
        .expect(200)
    ).body.accessToken;
    templateId = (await prisma.permissionTemplate.findFirstOrThrow({ where: { companyId: null, isAllScreens: true, isSystem: false }, orderBy: { createdAt: 'asc' }, select: { id: true } })).id;
  });

  afterAll(async () => {
    for (const id of companyIds) await hardDeleteCompanyForTest(prisma, id);
    await app.close();
  });

  it('refuses a self registration without an e-mail and creates nothing', async () => {
    const username = `rmail-noreg-${stamp}`;
    const res = await http().post('/auth/register').send({ orgName: `منشأة ${username}`, username, password: PASSWORD });
    if (res.status === 201) companyIds.push(res.body.user.companyId);
    expect(res.status).toBe(400);
    expect(await prisma.loginIdentity.count({ where: { username } })).toBe(0);
  });

  it('refuses a company created by the platform without an owner e-mail, and keeps the e-mail it is given', async () => {
    const username = `rmail-noadm-${stamp}`;
    const refused = await bearer(adminToken)(http().post('/companies')).send({ username, password: PASSWORD, orgName: `منشأة ${username}`, permissionTemplateId: templateId });
    if (refused.status === 201) companyIds.push(refused.body.id);
    expect(refused.status).toBe(400);
    expect(await prisma.loginIdentity.count({ where: { username } })).toBe(0);

    const created = await bearer(adminToken)(http().post('/companies')).send({ username, password: PASSWORD, orgName: `منشأة ${username}`, permissionTemplateId: templateId, email: `${username}@example.com` }).expect(201);
    companyIds.push(created.body.id);
    expect(await storedEmail(created.body.id)).toBe(`${username}@example.com`);
  });

  it('refuses a change of the profile e-mail without the current password, or with a wrong one', async () => {
    const owner = await registerOwner('nopw');
    const missing = await bearer(owner.token)(http().patch('/company-profile')).send({ email: `other-${owner.email}` });
    expect(missing.status).toBe(400);
    const wrong = await bearer(owner.token)(http().patch('/company-profile')).send({ email: `other-${owner.email}`, currentPassword: 'NotThePassword123!' });
    expect(wrong.status).toBe(401);
    expect(await storedEmail(owner.companyId)).toBe(owner.email);
  });

  it('refuses clearing the profile e-mail, even with the current password', async () => {
    const owner = await registerOwner('clear');
    const bare = await bearer(owner.token)(http().patch('/company-profile')).send({ email: '' });
    expect(bare.status).toBe(400);
    expect(await storedEmail(owner.companyId)).toBe(owner.email);
    const withPassword = await bearer(owner.token)(http().patch('/company-profile')).send({ email: '', currentPassword: PASSWORD });
    expect(withPassword.status).toBe(400);
    expect(await storedEmail(owner.companyId)).toBe(owner.email);
  });

  it('changes the e-mail with the current password and tells the previous address', async () => {
    const owner = await registerOwner('change');
    const next = `next-${owner.email}`;
    const res = await bearer(owner.token)(http().patch('/company-profile')).send({ email: next, currentPassword: PASSWORD }).expect(200);
    expect(res.body.email).toBe(next);
    expect(await storedEmail(owner.companyId)).toBe(next);
    const notice = (await mailTo(owner.email)) as [string, string, string] | undefined;
    expect(notice).toBeDefined();
    expect(notice![2]).toContain('البريد');
    expect(notice![2]).not.toContain(next);
  });

  it('saves the rest of the profile with the same e-mail and no password', async () => {
    const owner = await registerOwner('same');
    await bearer(owner.token)(http().patch('/company-profile')).send({ email: owner.email, phone: '0500000001' }).expect(200);
    await bearer(owner.token)(http().patch('/company-profile')).send({ city: 'الرياض' }).expect(200);
    expect(await storedEmail(owner.companyId)).toBe(owner.email);
  });

  it('keeps a company with no e-mail on file working, and lets its owner add one with the current password', async () => {
    const owner = await registerOwner('legacy');
    await prisma.company.update({ where: { id: owner.companyId }, data: { email: null } });
    const session = await http().post('/auth/login').send({ username: owner.username, password: PASSWORD }).expect(200);
    const token = session.body.accessToken as string;
    await bearer(token)(http().patch('/company-profile')).send({ phone: '0500000002' }).expect(200);
    await bearer(token)(http().patch('/company-profile')).send({ email: owner.email }).expect(400);
    await bearer(token)(http().patch('/company-profile')).send({ email: owner.email, currentPassword: PASSWORD }).expect(200);
    expect(await storedEmail(owner.companyId)).toBe(owner.email);
  });
});
