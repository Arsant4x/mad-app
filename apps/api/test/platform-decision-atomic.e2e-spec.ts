import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole, PrismaClient } from '@mad-app/db';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { raceHarness, RaceResult } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget, about three times the measured run (argon2 hashes, the app boot and four forced races).
jest.setTimeout(240000);

/**
 * A platform decision is spent in the same transaction as the change it allows, and each state change of a
 * decision is a conditional write: a failed company update leaves the decision approved, and two applies or two
 * decisions sent at once act on the decision once.
 */
describe('platform decisions are spent atomically and once (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let target: IsolatedCompany;
  let race: ReturnType<typeof raceHarness>;
  const suffix = `${Date.now()}`.slice(-9);
  const PASSWORD = 'AtomicPass123!';
  const admins: Record<'a' | 'b', { token: string; adminId: string }> = { a: { token: '', adminId: '' }, b: { token: '', adminId: '' } };
  const identities: string[] = [];
  const day = 24 * 60 * 60 * 1000;
  const inDays = (n: number) => new Date(Date.now() + n * day).toISOString().slice(0, 10);

  const http = () => request(app.getHttpServer());
  const as = (who: 'a' | 'b') => `Bearer ${admins[who].token}`;
  const applyEnd = (subEnd: string) => () =>
    http().patch(`/companies/${target.companyId}/subscription`).set('Authorization', as('a')).set('Accept-Language', 'en').send({ subEnd });
  const decide = (id: string, verb: 'approve' | 'reject') => () =>
    http().post(`/admin/decisions/${id}/${verb}`).set('Authorization', as('b')).set('Accept-Language', 'en').send({});
  const alternate = (first: () => request.Test, second: () => request.Test) => {
    let calls = 0;
    return () => (calls++ === 0 ? first() : second());
  };
  const raceShape = (r: RaceResult) => ({ locked: r.locked, held: r.heldWhenFired, blocked: r.blocked });

  async function makeAdmin(key: 'a' | 'b'): Promise<void> {
    const username = `decatom-${key}-${suffix}`;
    const identity = await prisma.loginIdentity.create({
      data: { username, passwordHash: await argon2.hash(PASSWORD), actorType: 'PLATFORM_ADMIN' },
      select: { id: true },
    });
    identities.push(identity.id);
    const admin = await prisma.platformAdmin.create({ data: { loginIdentityId: identity.id, displayName: `decatom ${key}`, role: PlatformRole.OWNER }, select: { id: true } });
    const login = await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200);
    admins[key] = { token: login.body.accessToken as string, adminId: admin.id };
  }

  /** Each case starts with no open decision on the target, so a new request is accepted. */
  async function closeOpenDecisions(): Promise<void> {
    await prisma.platformDecision.updateMany({ where: { targetId: target.companyId, status: { in: ['PENDING', 'APPROVED'] } }, data: { status: 'REJECTED' } });
  }

  async function requestChange(subEnd: string): Promise<string> {
    const asked = await http()
      .post('/admin/decisions')
      .set('Authorization', as('a'))
      .send({ action: 'SUBSCRIPTION_CHANGE', targetId: target.companyId, summary: `extend the subscription to ${subEnd} ${suffix}`, subEnd })
      .expect(201);
    return asked.body.id as string;
  }

  async function approvedChange(subEnd: string): Promise<string> {
    const id = await requestChange(subEnd);
    await decide(id, 'approve')().expect(201);
    return id;
  }

  const decisionOf = (id: string) =>
    prisma.platformDecision.findUniqueOrThrow({ where: { id }, select: { status: true, executedById: true, executedAt: true, decidedAt: true } });
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
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    await makeAdmin('a');
    await makeAdmin('b');
    target = await registerIsolatedCompany(app, 'decatom');
    race = raceHarness(() => target.companyId, holdClient, probe);
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await prisma.platformDecision.deleteMany({ where: { OR: [{ summary: { contains: suffix } }, { targetId: target.companyId }] } });
    await removeIsolatedCompany(app, target);
    for (const id of identities) await prisma.loginIdentity.delete({ where: { id } }).catch(() => undefined);
    await app.close();
  });

  it('leaves the decision approved and the subscription unchanged when the company update fails', async () => {
    await closeOpenDecisions();
    const approved = inDays(45);
    const before = await companyEnd();
    const decisionId = await approvedChange(approved);

    // A trigger that refuses an update of this company only stands for a write that fails after the decision is read.
    const name = `test_fail_company_update_${suffix}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."id" = '${target.companyId}' THEN RAISE EXCEPTION 'forced company update failure'; END IF; RETURN NEW; END $$`,
    );
    await prisma.$executeRawUnsafe(`CREATE TRIGGER ${name} BEFORE UPDATE ON "companies" FOR EACH ROW EXECUTE FUNCTION ${name}()`);
    let status: number;
    try {
      status = (await applyEnd(approved)()).status;
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${name} ON "companies"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${name}()`);
    }

    const decision = await decisionOf(decisionId);
    expect({ status, decision: decision.status, executedById: decision.executedById, end: await companyEnd() }).toEqual({
      status: 500,
      decision: 'APPROVED',
      executedById: null,
      end: before,
    });

    // The same decision still applies once the update can succeed.
    await applyEnd(approved)().expect(200);
    expect((await decisionOf(decisionId)).status).toBe('EXECUTED');
    expect(await companyEnd()).toBe(approved);
  });

  for (const round of [1, 2]) {
    it(`spends one approved subscription decision once when two applies race (round ${round})`, async () => {
      await closeOpenDecisions();
      const approved = inDays(60 + round);
      const decisionId = await approvedChange(approved);

      const result = await race.raceBehindLock('platform_decisions', decisionId, applyEnd(approved));
      const refused = result.responses.find((r) => r.status === 409);

      expect({
        race: raceShape(result),
        statuses: result.responses.map((r) => r.status).sort(),
        decision: (await decisionOf(decisionId)).status,
        end: await companyEnd(),
      }).toEqual({
        race: { locked: 1, held: 'held', blocked: 2 },
        statuses: [200, 409],
        decision: 'EXECUTED',
        end: approved,
      });
      expect(String(refused?.body.message)).toContain('EXECUTED');
    });
  }

  for (const round of [1, 2]) {
    it(`decides a pending decision once when an approval and a rejection race (round ${round})`, async () => {
      await closeOpenDecisions();
      const decisionId = await requestChange(inDays(80 + round));

      const result = await race.raceBehindLock('platform_decisions', decisionId, alternate(decide(decisionId, 'approve'), decide(decisionId, 'reject')));
      const winner = result.responses.find((r) => r.status === 201);
      const refused = result.responses.find((r) => r.status === 409);

      expect({
        race: raceShape(result),
        statuses: result.responses.map((r) => r.status).sort(),
        decision: (await decisionOf(decisionId)).status,
      }).toEqual({
        race: { locked: 1, held: 'held', blocked: 2 },
        statuses: [201, 409],
        decision: (winner?.body as { status?: string } | undefined)?.status ?? 'no decision was made',
      });
      expect(String(refused?.body.message)).toContain('no longer pending');
    });
  }
});
