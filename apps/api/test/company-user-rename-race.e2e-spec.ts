import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { PrismaClient } from '@mad-app/db';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: one company, two employees and one held lock; three times the measured run.
jest.setTimeout(90000);

/**
 * Two renames of two employees to the same new username at the same moment. Both pass the clash check before
 * either writes, so the second write meets the unique index. That request is refused with the same 409 as the
 * check gives, not with a 500.
 *
 * The overlap is forced: a side transaction locks both login rows, both requests are sent and stand on that lock
 * (read from pg_stat_activity), then the lock is released.
 */
describe('Concurrent employee renames to one username (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const owner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const employees: { id: string; identityId: string }[] = [];

  const waitingOnLocks = async (): Promise<number> => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'rename-race');
    const templates = await owner(http().get('/templates')).expect(200);
    const templateId = templates.body.find((t: { isSystem: boolean; isAllScreens: boolean }) => !t.isSystem && t.isAllScreens).id;
    for (const n of [1, 2]) {
      const created = await owner(http().post('/company-users'))
        .send({ name: `Rename race ${n}`, username: `rename-${n}-${stamp}`, password: 'RenamePass123!', permissionTemplateId: templateId })
        .expect(201);
      employees.push({ id: created.body.id, identityId: '' });
    }
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${company.companyId}, true)`;
      return tx.companyUser.findMany({ where: { id: { in: employees.map((e) => e.id) } }, select: { id: true, loginIdentityId: true } });
    });
    for (const e of employees) e.identityId = rows.find((r) => r.id === e.id)!.loginIdentityId;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await prisma.$disconnect();
    await app?.close();
  });

  it('answers one rename and refuses the other with 409, never 500', async () => {
    const target = `renamed-${stamp}`;
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    let held = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        held = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "login_identities" WHERE id IN (${employees[0].identityId}, ${employees[1].identityId}) FOR UPDATE`).length;
        locked();
        await released;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    await lockTaken;
    const baseline = await waitingOnLocks();
    const both = Promise.all(employees.map((e) => owner(http().patch(`/company-users/${e.id}`)).send({ username: target }).then((r) => r)));
    let waiting = 0;
    try {
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 100));
    } finally {
      release();
    }
    await holder;
    const replies = await both;

    // The probe saw what it claims: both login rows held and both requests standing on them.
    expect(held).toBe(2);
    expect(waiting).toBeGreaterThanOrEqual(baseline + 2);

    const statuses = replies.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const refused = replies.find((r) => r.status === 409)!;
    expect(String(refused.body.message)).toContain(target);

    const owners = await prisma.loginIdentity.count({ where: { username: target } });
    expect(owners).toBe(1);
  });
});
