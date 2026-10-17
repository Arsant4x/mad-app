import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared rather than left at five seconds.
jest.setTimeout(60000);

/**
 * The company audit trail's date filters: a value that is not a readable date is refused with 400, never
 * turned into a server error, and the valid shapes keep filtering as documented.
 */
describe('Audit log date filters (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let entryCreatedAt: string;
  let entryId: string;

  interface Entry {
    id: string;
    entityId: string | null;
    action: string;
    createdAt: string;
  }

  const list = (query: string) => request(app.getHttpServer()).get(`/audit-log?${query}`).set('Authorization', `Bearer ${company.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'audit-dates');

    const created = await request(app.getHttpServer())
      .post('/customers')
      .set('Authorization', `Bearer ${company.token}`)
      .send({ kind: 'NATURAL', name: `audit date filter ${Date.now()}` })
      .expect(201);
    // The trail write does not block the response, so wait for the entry to land.
    const isCreation = (e: Entry) => e.entityId === created.body.id && e.action === 'add';
    const deadline = Date.now() + 5000;
    let entry: Entry | undefined;
    while (!entry && Date.now() < deadline) {
      entry = ((await list('limit=50').expect(200)).body as Entry[]).find(isCreation);
      if (!entry) await new Promise((r) => setTimeout(r, 100));
    }
    if (!entry) throw new Error('the creation entry never reached the trail');
    entryId = entry.id;
    entryCreatedAt = new Date(entry.createdAt).toISOString();
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
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
    const day = entryCreatedAt.slice(0, 10);
    const ids = async (query: string) => ((await list(query).expect(200)).body as Entry[]).map((e) => e.id);
    const before = new Date(new Date(entryCreatedAt).getTime() - 60000).toISOString();
    const after = new Date(new Date(entryCreatedAt).getTime() + 60000).toISOString();
    const previousDay = new Date(Date.parse(`${day}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

    expect(await ids(`from=${day}&to=${day}`)).toContain(entryId);
    expect(await ids(`to=${previousDay}`)).not.toContain(entryId);
    expect(await ids(`from=${before}&to=${after}`)).toContain(entryId);
    expect(await ids(`to=${before}`)).not.toContain(entryId);
    expect(await ids(`from=${after}`)).not.toContain(entryId);
  });
});
