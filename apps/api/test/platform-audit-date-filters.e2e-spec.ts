import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';

// Suite budget: three times the measured run, declared rather than left at five seconds.
jest.setTimeout(60000);

interface PlatformRow {
  id: string;
  method: string;
  route: string;
  createdAt: string;
}

interface PlatformPage {
  items: PlatformRow[];
  total: number;
}

/**
 * The platform audit log's date filters: a value that is not a readable date is refused with 400, never
 * turned into a server error or a rolled over date, and the valid shapes keep filtering as documented.
 */
describe('Platform audit log date filters (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let rowId: string;
  let rowCreatedAt: string;

  const list = (query: string) => request(app.getHttpServer()).get(`/admin/platform-audit-log?${query}`).set('Authorization', `Bearer ${ownerToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const ownerUsername = process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan';
    ownerToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: ownerUsername, password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD }).expect(200)).body.accessToken;

    // A platform read leaves a row; the write lands after the response, so poll for it.
    const startedAt = new Date(Date.now() - 1000).toISOString();
    await request(app.getHttpServer()).get('/companies').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const deadline = Date.now() + 5000;
    let row: PlatformRow | undefined;
    while (!row && Date.now() < deadline) {
      const page = (await list('page=1&pageSize=100').expect(200)).body as PlatformPage;
      row = page.items.find((r) => r.method === 'GET' && r.route === '/companies' && r.createdAt >= startedAt);
      if (!row) await new Promise((r) => setTimeout(r, 100));
    }
    if (!row) throw new Error('the platform read never reached the platform audit log');
    rowId = row.id;
    rowCreatedAt = new Date(row.createdAt).toISOString();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a from or to that is not a readable date with 400', async () => {
    const malformed = [
      'from=not-a-date',
      'to=not-a-date',
      'from=2026-13-01',
      'to=2026-02-30',
      'from=2026-W01',
      'to=20260101',
      'to=2026001',
    ];
    const statuses: string[] = [];
    for (const q of malformed) statuses.push(`${q} ${(await list(q)).status}`);
    expect(statuses).toEqual(malformed.map((q) => `${q} 400`));
  });

  it('a date-only to includes the whole day, and a date and time is an exact moment', async () => {
    const day = rowCreatedAt.slice(0, 10);
    const ids = async (query: string) => ((await list(`${query}&page=1&pageSize=100`).expect(200)).body as PlatformPage).items.map((r) => r.id);
    const before = new Date(new Date(rowCreatedAt).getTime() - 60000).toISOString();
    const after = new Date(new Date(rowCreatedAt).getTime() + 60000).toISOString();
    const previousDay = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

    expect(await ids(`from=${encodeURIComponent(before)}&to=${day}`)).toContain(rowId);
    expect(await ids(`to=${previousDay}`)).not.toContain(rowId);
    expect(await ids(`from=${encodeURIComponent(before)}&to=${encodeURIComponent(after)}`)).toContain(rowId);
    expect(await ids(`from=${encodeURIComponent(before)}&to=${encodeURIComponent(before)}`)).not.toContain(rowId);
    expect(await ids(`from=${encodeURIComponent(after)}`)).not.toContain(rowId);
  });
});
