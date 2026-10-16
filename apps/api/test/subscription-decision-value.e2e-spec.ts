import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget, about three times the measured run (two argon2 hashes and the app boot dominate).
jest.setTimeout(150000);

/**
 * A subscription change approved by a second administrator applies only the end date that was
 * requested and approved, records who applied it, and the route refuses the start date it never
 * applied. The database holds the same rules for rows written after the migration.
 */
describe('subscription decision binds the approved value (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let target: IsolatedCompany;
  const suffix = `${Date.now()}`.slice(-9);
  const PASSWORD = 'DecidePass123!';
  const admins: Record<'a' | 'b', { token: string; adminId: string }> = { a: { token: '', adminId: '' }, b: { token: '', adminId: '' } };
  const identities: string[] = [];
  const day = 24 * 60 * 60 * 1000;
  const inDays = (n: number) => new Date(Date.now() + n * day).toISOString().slice(0, 10);

  const http = () => request(app.getHttpServer());
  const as = (who: 'a' | 'b') => `Bearer ${admins[who].token}`;
  const applyEnd = (body: Record<string, string>) =>
    http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).set('Accept-Language', 'en').send(body);

  async function makeAdmin(key: 'a' | 'b'): Promise<void> {
    const username = `subdec-${key}-${suffix}`;
    const identity = await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash(PASSWORD), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    identities.push(identity.id);
    const admin = await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: `subdec ${key}`, role: PlatformRole.OWNER }, select: { id: true } });
    const login = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    admins[key] = { token: login.body.accessToken as string, adminId: admin.id };
  }

  /** Each case starts with no open decision on the target, so a new request is accepted. */
  async function closeOpenDecisions(): Promise<void> {
    await prisma.platformDecision.updateMany({ where: { targetId: target.companyId, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'REJECTED' } });
  }

  /** a requests a change to the given end date and b approves it. */
  async function approvedChange(subEnd: string): Promise<string> {
    const asked = await http()
      .post('/admin/decisions')
      .set('Authorization', as('a'))
      .send({ action: 'SUBSCRIPTION_CHANGE', targetId: target.companyId, summary: `extend the subscription to ${subEnd} ${suffix}`, subEnd })
      .expect(201);
    await http().post(`/admin/decisions/${asked.body.id}/approve`).set('Authorization', as('b')).expect(201);
    return asked.body.id as string;
  }

  const companyEnd = async () =>
    (await prisma.company.findUniqueOrThrow({ where: { id: target.companyId }, select: { subEnd: true } })).subEnd?.toISOString().slice(0, 10);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await makeAdmin('a');
    await makeAdmin('b');
    target = await registerIsolatedCompany(app, 'subdec');
  });

  afterAll(async () => {
    await prisma.platformDecision.deleteMany({ where: { OR: [{ summary: { contains: suffix } }, { targetId: target.companyId }] } });
    await removeIsolatedCompany(app, target);
    for (const id of identities) await prisma.loginIdentity.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('refuses an end date other than the approved one, naming the approved date', async () => {
    await closeOpenDecisions();
    const approved = inDays(30);
    const other = inDays(3650);
    const before = await companyEnd();
    const decisionId = await approvedChange(approved);

    const res = await applyEnd({ subEnd: other }).expect(409);
    expect(String(res.body.message)).toContain(approved);

    expect(await companyEnd()).toBe(before);
    const decision = await prisma.platformDecision.findUniqueOrThrow({ where: { id: decisionId }, select: { status: true } });
    expect(decision.status).toBe('APPROVED');
  });

  it('refuses an empty change while a decision approves an end date', async () => {
    await closeOpenDecisions();
    const approved = inDays(35);
    await approvedChange(approved);
    const res = await applyEnd({}).expect(409);
    expect(String(res.body.message)).toContain(approved);
  });

  it('applies the approved end date and records who applied it', async () => {
    await closeOpenDecisions();
    const approved = inDays(50);
    const decisionId = await approvedChange(approved);

    await applyEnd({ subEnd: approved }).expect(200);

    expect(await companyEnd()).toBe(approved);
    const decision = await prisma.platformDecision.findUniqueOrThrow({ where: { id: decisionId }, select: { status: true, executedById: true, subEnd: true } });
    expect(decision.status).toBe('EXECUTED');
    expect(decision.executedById).toBe(admins.a.adminId);
    expect(decision.subEnd?.toISOString().slice(0, 10)).toBe(approved);
  });

  it('refuses the start date by name instead of ignoring it, and leaves the decision unspent', async () => {
    await closeOpenDecisions();
    const approved = inDays(40);
    const decisionId = await approvedChange(approved);
    const res = await applyEnd({ subStart: inDays(-400), subEnd: approved }).expect(400);
    expect(JSON.stringify(res.body)).toContain('subStart');
    const decision = await prisma.platformDecision.findUniqueOrThrow({ where: { id: decisionId }, select: { status: true } });
    expect(decision.status).toBe('APPROVED');
  });

  it('requires the end date on a subscription change request and refuses it on other actions', async () => {
    await closeOpenDecisions();
    const bare = await http()
      .post('/admin/decisions')
      .set('Authorization', as('a'))
      .set('Accept-Language', 'en')
      .send({ action: 'SUBSCRIPTION_CHANGE', targetId: target.companyId, summary: `a change with no end date ${suffix}` })
      .expect(400);
    expect(String(bare.body.message)).toContain('subEnd');

    const misplaced = await http()
      .post('/admin/decisions')
      .set('Authorization', as('a'))
      .set('Accept-Language', 'en')
      .send({ action: 'REFUND', targetId: `refund-${suffix}`, summary: `a refund with an end date ${suffix}`, subEnd: inDays(10) })
      .expect(400);
    expect(String(misplaced.body.message)).toContain('subEnd');
  });

  it('does not apply a decision approved before decisions carried a value, and lets a new one be requested', async () => {
    await closeOpenDecisions();
    // A row as the table held it before the migration: approved by the other hand, no end date.
    await prisma.platformDecision.create({
      data: {
        action: 'SUBSCRIPTION_CHANGE',
        targetId: target.companyId,
        summary: `legacy approval ${suffix}`,
        requestedById: admins.a.adminId,
        decidedById: admins.b.adminId,
        decidedAt: new Date('2026-01-02T00:00:00.000Z'),
        status: 'APPROVED',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    const res = await applyEnd({ subEnd: inDays(60) }).expect(409);
    expect(String(res.body.message)).toContain('before decisions carried the approved end date');

    const approved = inDays(60);
    const decisionId = await approvedChange(approved);
    await applyEnd({ subEnd: approved }).expect(200);
    const decision = await prisma.platformDecision.findUniqueOrThrow({ where: { id: decisionId }, select: { status: true } });
    expect(decision.status).toBe('EXECUTED');
  });

  it('holds the same rules in the database for rows written now', async () => {
    const base = { targetId: target.companyId, summary: `raw row ${suffix}`, requestedById: admins.a.adminId };
    await expect(prisma.platformDecision.create({ data: { ...base, action: 'SUBSCRIPTION_CHANGE' } })).rejects.toThrow(/platform_decisions_subscription_carries_end/);
    await expect(prisma.platformDecision.create({ data: { ...base, action: 'REFUND', subEnd: new Date() } })).rejects.toThrow(/platform_decisions_sub_end_only_on_subscription/);
    await expect(
      prisma.platformDecision.create({ data: { ...base, action: 'REFUND', status: 'EXECUTED', decidedById: admins.b.adminId, executedAt: new Date() } }),
    ).rejects.toThrow(/platform_decisions_executed_names_executor/);
    await expect(prisma.platformDecision.create({ data: { ...base, action: 'REFUND', executedById: admins.a.adminId } })).rejects.toThrow(
      /platform_decisions_executor_only_when_executed/,
    );
  });
});
