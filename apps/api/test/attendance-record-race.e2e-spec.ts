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

type AttendanceRow = { id: string; date: string };

/**
 * Recording attendance for one employee and day from two concurrent requests.
 *
 * A side transaction holds the employee row FOR UPDATE. Inserting an attendance row takes a key share lock on that
 * row through its foreign key, so the first insert stops behind the holder and the second stops behind the first on
 * the one row per employee and day index. Both have already checked that no row exists, so the second one meets the
 * unique index when the holder lets go, and it must be answered as the day already recorded, not as a server error.
 */
describe('Recording attendance for one employee and day from two concurrent requests', () => {
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
  const rowsOn = async (date: string, employeeId: string): Promise<AttendanceRow[]> =>
    (await auth(http().get(`/attendance?date=${date}&employeeId=${employeeId}`)).expect(200)).body as AttendanceRow[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'attendance-race');
    race = raceHarness(() => company.companyId, holdClient, probe);
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('two records for one employee and day at once: one is recorded, the other is refused as already recorded', async () => {
    const employeeId = await newEmployee();
    const date = '2025-03-02';
    const fire = () => auth(http().post('/attendance')).send({ employeeId, date, status: 'PRESENT', checkIn: '08:00' });

    const result = await race.raceBehindLock('employees', employeeId, fire);
    const refused = result.responses.find((r) => r.status !== 201);

    expect({
      race: { locked: result.locked, held: result.heldWhenFired, blocked: result.blocked },
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: refused?.body?.message,
      recorded: (await rowsOn(date, employeeId)).length,
    }).toEqual({
      race: { locked: 1, held: 'held', blocked: 2 },
      statuses: [201, 409],
      refusal: resolveMessage(MSG.attendance_already_recorded, DEFAULT_LANGUAGE),
      recorded: 1,
    });
  });
});
