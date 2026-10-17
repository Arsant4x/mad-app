import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { zoneOffsetMin } from '../src/common/wall-clock.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: about three times the measured run, which registers a company and records a handful of rows.
jest.setTimeout(120000);

type AttendanceRow = { id: string; checkIn: string | null; checkOut: string | null };

/**
 * Attendance records what happened: a check-out is not earlier than the check-in on the same row, and no time is
 * later than the company's clock now, beyond a few minutes for a device clock that runs a little fast.
 *
 * The company is moved to a fixed offset zone where it is around noon while the suite runs, so "now plus an hour"
 * and "now minus two hours" stay on the same day whatever time the suite is run at.
 */
describe('Attendance times', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let zone: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const tag = () => `${suffix}-${++seq}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  /** The company's wall clock, moved by some minutes from now. */
  const clockAt = (deltaMin: number) => {
    const now = new Date();
    const local = new Date(now.getTime() + (deltaMin + zoneOffsetMin(now, zone)) * 60_000).toISOString();
    return { date: local.slice(0, 10), time: local.slice(11, 16) };
  };
  const newEmployee = async (): Promise<string> =>
    ((await auth(http().post('/employees')).send({ fullName: `Employee ${tag()}`, hireDate: '2024-01-01' }).expect(201)).body as { id: string }).id;
  const record = (body: Record<string, unknown>) => auth(http().post('/attendance')).send(body);
  const edit = (id: string, body: Record<string, unknown>) => auth(http().patch(`/attendance/${id}`)).send(body);
  const refusal = (res: request.Response) => ({ status: res.status, message: res.body.message as unknown });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'attendance-times');
    // Etc/GMT-N is UTC+N: pick the whole hour offset that puts the company at noon now.
    const shift = 12 - new Date().getUTCHours();
    zone = shift === 0 ? 'Etc/UTC' : shift > 0 ? `Etc/GMT-${shift}` : `Etc/GMT+${-shift}`;
    await app.get(PrismaService).company.update({ where: { id: company.companyId }, data: { timeZone: zone } });
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a check-out earlier than the check-in, and a check-in moved after the check-out', async () => {
    const employeeId = await newEmployee();
    const row = (await record({ employeeId, date: '2025-03-10', checkIn: '09:00' }).expect(201)).body as AttendanceRow;

    expect(refusal(await edit(row.id, { checkOut: '08:30' }))).toEqual({ status: 400, message: expect.stringContaining('08:30') });

    await edit(row.id, { checkOut: '17:00' }).expect(200);
    expect(refusal(await edit(row.id, { checkIn: '18:00' }))).toEqual({ status: 400, message: expect.stringContaining('18:00') });

    const kept = ((await auth(http().get(`/attendance?employeeId=${employeeId}`)).expect(200)).body as AttendanceRow[]).find((r) => r.id === row.id);
    expect(kept).toMatchObject({ checkIn: '09:00', checkOut: '17:00' });
  });

  it('refuses a check-in later than now beyond a few minutes, and accepts one just ahead of the clock', async () => {
    const later = clockAt(60);
    expect(refusal(await record({ employeeId: await newEmployee(), date: later.date, checkIn: later.time }))).toEqual({
      status: 400,
      message: expect.stringContaining(later.time),
    });

    const justAhead = clockAt(2);
    await record({ employeeId: await newEmployee(), date: justAhead.date, checkIn: justAhead.time }).expect(201);
  });

  it('refuses a record dated after today, even without a time', async () => {
    const tomorrow = clockAt(24 * 60);
    expect(refusal(await record({ employeeId: await newEmployee(), date: tomorrow.date, status: 'ABSENT' }))).toEqual({
      status: 400,
      message: expect.stringContaining(tomorrow.date),
    });
  });

  it('refuses a check-out later than now, and accepts one at the current time', async () => {
    const earlier = clockAt(-120);
    const row = (await record({ employeeId: await newEmployee(), date: earlier.date, checkIn: earlier.time }).expect(201)).body as AttendanceRow;

    const later = clockAt(60);
    expect(refusal(await edit(row.id, { checkOut: later.time }))).toEqual({ status: 400, message: expect.stringContaining(later.time) });

    await edit(row.id, { checkOut: clockAt(0).time }).expect(200);
  });
});
