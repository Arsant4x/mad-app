import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { RaceResult, raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Two forced races, each waiting for both requests to stand behind a lock before release.
jest.setTimeout(240000);

type LeaveRow = { id: string; status: string };
type BalanceRow = { leaveTypeId: string; used: number; remaining: number | null };

/**
 * Deciding leave from two requests at once.
 *
 * A side transaction holds the leave request rows FOR UPDATE, which every decision needs to write, so both requests
 * stop behind it after their own checks and are released together. A decision that only checks the status it read
 * earlier then decides a request twice, and approvals that check the balance without serialising on the employee
 * both pass and spend the same days twice.
 */
describe('Deciding leave from two concurrent requests', () => {
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
  const file = async (employeeId: string, leaveTypeId: string, startDate: string, endDate: string): Promise<string> =>
    ((await auth(http().post('/leaves/requests')).send({ employeeId, leaveTypeId, startDate, endDate }).expect(201)).body as LeaveRow).id;
  const decide = (id: string, verb: 'approve' | 'reject') => () => auth(http().post(`/leaves/requests/${id}/${verb}`)).send({});
  const rowsOf = async (employeeId: string): Promise<LeaveRow[]> =>
    (await auth(http().get(`/leaves/requests?employeeId=${employeeId}`)).expect(200)).body as LeaveRow[];
  const balanceOf = async (employeeId: string, leaveTypeId: string): Promise<BalanceRow | undefined> =>
    ((await auth(http().get(`/leaves/balance?employeeId=${employeeId}&year=2025`)).expect(200)).body.types as BalanceRow[]).find((t) => t.leaveTypeId === leaveTypeId);

  /** The harness fires twice; this sends the first request on the first call and the second on the next. */
  const alternate = (first: () => request.Test, second: () => request.Test) => {
    let calls = 0;
    return () => (calls++ === 0 ? first() : second());
  };

  /** The probe saw the race happen: the rows were locked when the first request was sent and both requests stood behind them. */
  const raceShape = (r: RaceResult) => ({ locked: r.locked, held: r.heldWhenFired, blocked: r.blocked });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'leave-race');
    race = raceHarness(() => company.companyId, holdClient, probe);
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('an approval and a rejection of the same request at once: one decides, the other is refused as already decided', async () => {
    const employeeId = await newEmployee();
    const typeId = await newType(30);
    const id = await file(employeeId, typeId, '2025-03-01', '2025-03-03');

    const result = await race.raceBehindLock('leave_requests', id, alternate(decide(id, 'approve'), decide(id, 'reject')));
    const winner = result.responses.find((r) => r.status === 201);

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      finalStatus: (await rowsOf(employeeId)).find((r) => r.id === id)?.status,
    }).toEqual({
      race: { locked: 1, held: 'held', blocked: 2 },
      statuses: [201, 409],
      finalStatus: (winner?.body as LeaveRow | undefined)?.status ?? 'no decision was made',
    });
  });

  it('two approvals that together exceed the entitlement: one is approved, the other is refused', async () => {
    const employeeId = await newEmployee();
    const typeId = await newType(8);
    const a = await file(employeeId, typeId, '2025-03-01', '2025-03-05');
    const b = await file(employeeId, typeId, '2025-04-01', '2025-04-05');

    const result = await race.raceBehindLock('leave_requests', [a, b], alternate(decide(a, 'approve'), decide(b, 'approve')));

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      balance: await balanceOf(employeeId, typeId),
    }).toEqual({
      race: { locked: 2, held: 'held', blocked: 2 },
      statuses: [201, 400],
      balance: expect.objectContaining({ used: 5, remaining: 3 }),
    });
  });
});
