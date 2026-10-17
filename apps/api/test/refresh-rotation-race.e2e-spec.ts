import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as crypto from 'crypto';
import request from 'supertest';
import { PrismaClient } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { ISOLATED_PASSWORD, registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: one company and one held lock; three times the measured run.
jest.setTimeout(60000);

/**
 * A refresh token is single use. Two refresh calls carrying the same token at the same moment must not both
 * rotate it: exactly one gets a new session, the other is treated as reuse.
 *
 * The overlap is forced: a side transaction locks the token's row, both requests are sent and stand on that lock
 * (read from pg_stat_activity), so both have read the token as still valid before either can revoke it. Then the
 * lock is released.
 */
describe('Refresh token rotation under concurrent use (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  // A client of its own, so the held lock and the probe do not take connections from the application's pool.
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  const refreshCookieOf = (res: request.Response): string => {
    const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('refresh_token='));
    if (!raw) throw new Error(`no refresh cookie in the response: ${JSON.stringify(res.headers['set-cookie'])}`);
    return raw.split(';')[0];
  };
  const hashOf = (cookie: string) => crypto.createHash('sha256').update(cookie.slice('refresh_token='.length)).digest('hex');
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
    company = await registerIsolatedCompany(app, 'refresh-race');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await prisma.$disconnect();
    await app?.close();
  });

  async function freshLoginCookie(): Promise<string> {
    const login = await http().post('/auth/login').send({ username: company.username, password: ISOLATED_PASSWORD }).expect(200);
    return refreshCookieOf(login);
  }

  it('a single refresh rotates the token, and the rotated-out token is refused afterwards', async () => {
    const cookie = await freshLoginCookie();
    const rotated = refreshCookieOf(await http().post('/auth/refresh').set('Cookie', cookie).expect(200));
    expect(rotated).not.toBe(cookie);
    await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('two concurrent refresh calls with the same token: one rotates it, the other is refused as reuse', async () => {
    const cookie = await freshLoginCookie();
    const tokenHash = hashOf(cookie);

    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let locked!: () => void;
    const lockTaken = new Promise<void>((r) => (locked = r));
    let held = 0;
    const holder = prisma.$transaction(
      async (tx) => {
        held = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM refresh_tokens WHERE "tokenHash" = ${tokenHash} FOR UPDATE`).length;
        locked();
        await released;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );
    await lockTaken;
    const baseline = await waitingOnLocks();
    const both = Promise.all([0, 1].map(() => http().post('/auth/refresh').set('Cookie', cookie).then((r) => r.status)));
    let waiting = 0;
    try {
      for (let i = 0; i < 100 && (waiting = await waitingOnLocks()) < baseline + 2; i++) await new Promise((r) => setTimeout(r, 100));
    } finally {
      release();
    }
    await holder;
    const statuses = (await both).sort((a, b) => a - b);

    // The probe saw what it claims: the token row held and both requests standing on it.
    expect(held).toBe(1);
    expect(waiting).toBeGreaterThanOrEqual(baseline + 2);
    expect(statuses).toEqual([200, 401]);

    // The presented token is spent either way.
    await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
