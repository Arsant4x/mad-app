import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, MSG, resolveMessage } from '../src/common/i18n/messages';
import { raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// A forced race that waits for both requests to stand behind a lock before release.
jest.setTimeout(240000);

type LeaveRow = { id: string; status: string; startDate: string; endDate: string };

/**
 * Filing two overlapping leave requests for one employee at once.
 *
 * A side transaction holds the employee row FOR UPDATE. Inserting a leave request takes a key share lock on that row
 * through its foreign key, so both requests stop behind the holder whether or not they lock the employee themselves.
 * Requests that check overlap without serialising on the employee both pass and both insert; requests that lock the
 * employee before the check see the first one's row and the second is refused.
 */
describe('Filing overlapping leave requests from two concurrent requests', () => {
  let app: INestApplication;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let company: IsolatedCompany;
  let race: ReturnType<typeof raceHarness>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const tag = () => `${suffix}-${++seq}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  const newEmployee = async (): Promise<string> =>
    ((await auth(http().post('/employees')).send({ fullName: `Employee ${tag()}`, hireDate: '2024-01-01' }).expect(201)).body as { id: string }).id;
  const newType = async (annualDays: number): Promise<string> =>
    ((await auth(http().post('/leaves/types')).send({ name: `Annual ${tag()}`, annualDays, paid: true }).expect(201)).body as { id: string }).id;
  const rowsOf = async (employeeId: string): Promise<LeaveRow[]> =>
    (await auth(http().get(`/leaves/requests?employeeId=${employeeId}`)).expect(200)).body as LeaveRow[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'leave-overlap-race');
    race = raceHarness(() => company.companyId, holdClient, probe);
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('two overlapping requests for one employee at once: one is filed, the other is refused as an overlap', async () => {
    const employeeId = await newEmployee();
    const leaveTypeId = await newType(30);
    let calls = 0;
    const fire = () => {
      const span = calls++ === 0 ? { startDate: '2025-05-01', endDate: '2025-05-05' } : { startDate: '2025-05-03', endDate: '2025-05-07' };
      return auth(http().post('/leaves/requests')).send({ employeeId, leaveTypeId, ...span });
    };

    const result = await race.raceBehindLock('employees', employeeId, fire);
    const refused = result.responses.find((r) => r.status === 409);

    expect({
      race: { locked: result.locked, held: result.heldWhenFired, blocked: result.blocked },
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: refused?.body?.message,
      filed: (await rowsOf(employeeId)).length,
    }).toEqual({
      race: { locked: 1, held: 'held', blocked: 2 },
      statuses: [201, 409],
      refusal: resolveMessage(MSG.leave_overlap, DEFAULT_LANGUAGE),
      filed: 1,
    });
  });
});
