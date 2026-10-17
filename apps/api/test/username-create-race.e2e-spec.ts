import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@mad-app/db';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: one isolated company, three races of two creates and up to three company births; three times the measured run.
jest.setTimeout(120000);

/**
 * Two creates of one new username at the same moment, on the three paths that create a login: an employee from the
 * owner's screen, self signup and the platform admin. Both pass the username check before either writes, so the
 * second write meets the unique index. That request is refused with the same 409 as the check gives, not with a 500.
 *
 * The overlap is forced: a side transaction inserts the username without committing, both requests are sent and
 * stand on that row (read from pg_stat_activity), then the side transaction rolls back. One request then wins the
 * index and the other waits for it and meets the violation.
 */
describe('Concurrent creates of one username (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let adminToken: string;
  let employeeTemplateId: string;
  let companyTemplateId: string;
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const born: string[] = [];
  const http = () => request(app.getHttpServer());
  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  const waitingOnLocks = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    return Number(rows[0].n);
  };

  /** Sends `send` twice while an uncommitted row holds `username`, releases it once both stand on it, returns both replies. */
  const raceTwo = async (username: string, send: () => Promise<request.Response>) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let held!: () => void;
    const rowHeld = new Promise<void>((r) => (held = r));
    const rollback = new Error('side transaction rolled back on purpose');
    const holder = prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`INSERT INTO "login_identities" ("id", "username", "passwordHash", "actorType", "updatedAt") VALUES (${randomUUID()}, ${username}, 'held', 'PLATFORM_ADMIN', now())`;
          held();
          await released;
          throw rollback;
        },
        { timeout: 60_000, maxWait: 10_000 },
      )
      .catch((e: unknown) => {
        if (e !== rollback) throw e;
      });
    await rowHeld;
    const baseline = await waitingOnLocks();
    const both = Promise.all([send(), send()]);
    let waiting = 0;
    try {
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 50));
    } finally {
      release();
    }
    await holder;
    const replies = await both;
    // The probe saw what it claims: both requests stood on the held row.
    expect(waiting).toBeGreaterThanOrEqual(baseline + 2);
    return replies;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'create-race');
    const templates = await owner(http().get('/templates')).expect(200);
    employeeTemplateId = templates.body.find((t: { isSystem: boolean; isAllScreens: boolean }) => !t.isSystem && t.isAllScreens).id;

    adminToken = (
      await http().post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD }).expect(200)
    ).body.accessToken;
    const all = (await admin(http().get('/templates')).expect(200)).body as { id: string; isSystem: boolean; isAllScreens: boolean; companyId: string | null }[];
    companyTemplateId = all.find((t) => !t.isSystem && t.isAllScreens && t.companyId === null)!.id;
  });

  afterAll(async () => {
    const service = app.get(PrismaService);
    for (const id of born) await hardDeleteCompanyForTest(service, id);
    await removeIsolatedCompany(app, company);
    await prisma.$disconnect();
    await app?.close();
  });

  const expectOneCreatedOneRefused = async (replies: request.Response[], username: string, sequential: () => Promise<request.Response>) => {
    const statuses = replies.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    // The race answers exactly what the username check answers for the same name.
    const checked = await sequential();
    expect(checked.status).toBe(409);
    const refused = replies.find((r) => r.status === 409)!;
    expect(refused.body.message).toEqual(checked.body.message);
    expect(await prisma.loginIdentity.count({ where: { username } })).toBe(1);
  };

  it('employee creates: one is created and the other refused with 409, never 500', async () => {
    const username = `race-emp-${stamp}`;
    const send = () =>
      owner(http().post('/company-users'))
        .send({ name: 'Create race', username, password: 'RacePass123!', permissionTemplateId: employeeTemplateId })
        .then((r) => r);
    const replies = await raceTwo(username, send);
    await expectOneCreatedOneRefused(replies, username, send);
  });

  it('self signups: one is created and the other refused with 409, never 500', async () => {
    const username = `race-reg-${stamp}`;
    const send = () =>
      http()
        .post('/auth/register')
        .send({ orgName: `Create race signup ${stamp}`, username, password: 'RacePass123!', email: `${username}@example.com` })
        .then((r) => {
          if (r.status === 201 && r.body.user?.companyId) born.push(r.body.user.companyId);
          return r;
        });
    const replies = await raceTwo(username, send);
    await expectOneCreatedOneRefused(replies, username, send);
  });

  it('admin creates: one is created and the other refused with 409, never 500', async () => {
    const username = `race-adm-${stamp}`;
    const send = () =>
      admin(http().post('/companies'))
        .send({ username, password: 'RacePass123!', orgName: `Create race admin ${stamp}`, email: `${username}@example.com`, permissionTemplateId: companyTemplateId })
        .then((r) => {
          if (r.status === 201 && r.body.id) born.push(r.body.id);
          return r;
        });
    const replies = await raceTwo(username, send);
    await expectOneCreatedOneRefused(replies, username, send);
  });
});
