import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { bootstrapPlatform } from '../src/platform/platform-bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

jest.setTimeout(120000);

/**
 * New passwords: 12 to 128 characters, not containing the username or the e-mail local part, and not one
 * repeated character. Every place that sets a password is checked; signing in with a stored password is not.
 */
describe('New password rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: IsolatedCompany;
  let adminToken: string;
  let companyTemplateId: string;
  let employeeTemplateId: string;
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdCompanies: string[] = [];
  const createdIdentities: string[] = [];
  const good = 'Quiet-River-2026';

  const http = () => request(app.getHttpServer());
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${owner.token}`);

  async function register(username: string, password: string, email = `${username}@example.com`) {
    const res = await http().post('/auth/register').send({ orgName: `pw ${username}`, username, password, email });
    if (res.status === 201 && res.body.user?.companyId) createdCompanies.push(res.body.user.companyId);
    return res;
  }

  async function resetToken(identityId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await prisma.passwordResetToken.create({
      data: { loginIdentityId: identityId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 10 * 60_000) },
    });
    return token;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    owner = await registerIsolatedCompany(app, 'pw');
    adminToken = (
      await http().post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD }).expect(200)
    ).body.accessToken;
    const templates = (await admin(http().get('/templates')).expect(200)).body as { id: string; isAllScreens: boolean; isSystem: boolean; companyId: string | null }[];
    companyTemplateId = templates.find((t) => t.isAllScreens && !t.isSystem && t.companyId === null)!.id;
    employeeTemplateId = (await asOwner(http().post('/templates')).send({ name: `pw template ${stamp}`, isAllScreens: true }).expect(201)).body.id;
  });

  afterAll(async () => {
    for (const id of createdCompanies) await hardDeleteCompanyForTest(prisma, id);
    for (const id of createdIdentities) await prisma.loginIdentity.deleteMany({ where: { id } });
    await removeIsolatedCompany(app, owner);
    await app.close();
  });

  it('registration refuses eleven characters', async () => {
    const res = await register(`pw-short-${stamp}`, 'Abcdefgh12!');
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toContain('12');
  });

  it('registration refuses more than 128 characters', async () => {
    const res = await register(`pw-long-${stamp}`, `Ab1!${'x'.repeat(125)}`);
    expect(res.status).toBe(400);
  });

  it('registration refuses a password that contains the username', async () => {
    const username = `pwuser${stamp.replace(/\D/g, '').slice(-6)}`;
    const res = await register(username, `My-${username.toUpperCase()}-pass`);
    expect(res.status).toBe(400);
  });

  it('registration refuses a password that contains the e-mail local part', async () => {
    const res = await register(`pw-mail-${stamp}`, 'salem.store-2026!', `salem.store@example.com`);
    expect(res.status).toBe(400);
  });

  it('registration refuses one repeated character', async () => {
    const res = await register(`pw-same-${stamp}`, 'z'.repeat(16));
    expect(res.status).toBe(400);
  });

  it('registration accepts twelve characters that break no rule', async () => {
    const res = await register(`pw-ok-${stamp}`, 'Abcdefgh123!');
    expect(res.status).toBe(201);
  });

  it('password reset refuses a short password and one that contains the username', async () => {
    const identity = await prisma.loginIdentity.findUniqueOrThrow({ where: { username: owner.username }, select: { id: true } });
    const short = await http().post('/auth/reset-password').send({ token: await resetToken(identity.id), newPassword: 'Abcdefgh12!' });
    expect(short.status).toBe(400);
    const named = await http().post('/auth/reset-password').send({ token: await resetToken(identity.id), newPassword: `x-${owner.username}-y` });
    expect(named.status).toBe(400);
  });

  // The platform admin no longer sets an owner password on update at all (owner-reset-link.e2e-spec.ts).
  it('the platform admin cannot create a company with a short password', async () => {
    const username = `pw-admin-co-${stamp}`;
    const created = await admin(http().post('/companies')).send({ username, password: 'Abcdefgh12!', orgName: `pw ${username}`, email: `${username}@example.com`, permissionTemplateId: companyTemplateId });
    if (created.status === 201) createdCompanies.push(created.body.id);
    expect(created.status).toBe(400);
  });

  it('the owner cannot create or update an employee with a short password', async () => {
    const username = `pw-emp-${stamp}`;
    const created = await asOwner(http().post('/company-users')).send({ name: 'pw employee', username, password: 'Abcdefgh12!', permissionTemplateId: employeeTemplateId });
    expect(created.status).toBe(400);
    const ok = await asOwner(http().post('/company-users')).send({ name: 'pw employee', username, password: good, permissionTemplateId: employeeTemplateId }).expect(201);
    const updated = await asOwner(http().patch(`/company-users/${ok.body.id}`)).send({ password: `${username}-2026` });
    expect(updated.status).toBe(400);
  });

  it('platform bootstrap refuses a short password for a new administrator', async () => {
    const username = `pw-root-${stamp}`;
    let failed = false;
    try {
      await bootstrapPlatform(prisma, { username, password: 'short-pass' });
    } catch {
      failed = true;
    }
    const made = await prisma.loginIdentity.findUnique({ where: { username }, select: { id: true } });
    if (made) createdIdentities.push(made.id);
    expect(failed).toBe(true);
    expect(made).toBeNull();
  });

  it('signing in with a stored password shorter than the new rule still works', async () => {
    const username = `pw-legacy-${stamp}`;
    const res = await register(username, good).then((r) => r.body);
    await prisma.loginIdentity.update({ where: { username }, data: { passwordHash: await argon2.hash('old-8chr') } });
    await http().post('/auth/login').send({ username, password: 'old-8chr' }).expect(200);
    expect(res.accessToken).toBeTruthy();
  });
});
