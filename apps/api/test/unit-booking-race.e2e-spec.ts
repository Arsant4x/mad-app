import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, PrismaClient } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { RaceResult, raceHarness } from './forced-race';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Four forced races, each waiting for both requests to stand behind a lock before release.
jest.setTimeout(240000);

/**
 * Booking the same unit from two requests at once.
 *
 * Every booking path (contract create, renewal, reservation create) checks the unit for an overlapping
 * booking and then inserts. The interleaving is forced: a side transaction holds the unit row FOR UPDATE,
 * which the insert's foreign key check needs, so both requests stop behind it. Without a lock taken before
 * the check, both have already passed their check when they stop and both insert once released. With it,
 * the second request waits before its check and then sees the first booking.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(d.getTime() - 86400000);
const dayAfter = (d: Date) => new Date(d.getTime() + 86400000);
const monthStart = (offset: number) => addMonths(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), offset);

type ContractBody = { id: string; no: string };
type ReservationBody = { id: string; name: string; expiryDate: string };

describe('Booking the same unit from two concurrent requests', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let holdClient: PrismaClient;
  let probe: PrismaClient;
  let company: IsolatedCompany;
  let race: ReturnType<typeof raceHarness>;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  const tag = () => `${suffix}-${++seq}`;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const ar = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);

  const makeUnit = async (): Promise<string> => {
    const t = tag();
    const property = (await auth(http().post('/properties')).send({ name: `Property ${t}`, ownership: 'owned' }).expect(201)).body as { id: string };
    return ((await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `U-${t}`, type: 'commercial', rentMonthly: 1000 }).expect(201)).body as { id: string }).id;
  };
  const makeCustomer = async (name: string): Promise<string> =>
    ((await auth(http().post('/customers')).send({ kind: 'NATURAL', name, allowSameName: true }).expect(201)).body as { id: string }).id;

  const contractBody = (unitId: string, customerId: string, start: Date, end: Date) => ({
    classification: 'RESIDENTIAL',
    vatInclusion: 'EXCLUSIVE',
    unitId,
    customerId,
    value: 12000,
    cycle: 'monthly',
    start: iso(start),
    end: iso(end),
  });
  const postContract = (body: Record<string, unknown>) => auth(http().post('/contracts')).send(body);
  const postReservation = (unitId: string, name: string, expiryDate: string) => auth(http().post('/reservations')).send({ unitId, name, expiryDate });

  /** The harness fires twice; this sends the first request on the first call and the second on the next. */
  const alternate = (first: () => request.Test, second: () => request.Test) => {
    let calls = 0;
    return () => (calls++ === 0 ? first() : second());
  };

  /**
   * Rows the requests wrote on the unit, as the database holds them after the race. Reservations are counted
   * whatever their status: a contract raced against another person's reservation can mark it converted instead of being refused.
   */
  const bookings = (unitId: string) =>
    tenantPrisma.runInTenantContext(company.companyId, async (tx: Prisma.TransactionClient) => ({
      contracts: await tx.contract.count({ where: { unitId, status: { not: 'CANCELLED' } } }),
      reservations: await tx.reservation.count({ where: { unitId } }),
    }));

  /** The probe saw the race happen: the unit row was locked when the first request was sent and both requests stood behind it. */
  const raceShape = (r: RaceResult) => ({ locked: r.locked, held: r.heldWhenFired, blocked: r.blocked });
  const forced = { locked: 1, held: 'held', blocked: 2 };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    holdClient = new PrismaClient();
    probe = new PrismaClient();
    company = await registerIsolatedCompany(app, 'unit-booking');
    race = raceHarness(() => company.companyId, holdClient, probe);
  });

  afterAll(async () => {
    await holdClient?.$disconnect();
    await probe?.$disconnect();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('two contracts for the same unit and term: one is created, the other is refused as overlapping', async () => {
    const unitId = await makeUnit();
    const first = await makeCustomer(`Tenant A ${tag()}`);
    const second = await makeCustomer(`Tenant B ${tag()}`);
    const start = monthStart(2);
    const end = dayBefore(addMonths(start, 12));

    const result = await race.raceBehindLock(
      'units',
      unitId,
      alternate(
        () => postContract(contractBody(unitId, first, start, end)),
        () => postContract(contractBody(unitId, second, start, end)),
      ),
    );
    const winner = result.responses.find((r) => r.status === 201);
    const loser = result.responses.find((r) => r.status !== 201);

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: loser?.body?.message,
      bookings: await bookings(unitId),
    }).toEqual({
      race: forced,
      statuses: [201, 409],
      refusal: winner ? ar(formatMessage(MSG.contract_dates_overlap, { contractNo: (winner.body as ContractBody).no })) : 'no contract was created',
      bookings: { contracts: 1, reservations: 0 },
    });
  });

  it('a renewal and a new contract for the same following term: one is created, the other is refused as overlapping', async () => {
    const unitId = await makeUnit();
    const tenant = await makeCustomer(`Renewing tenant ${tag()}`);
    const other = await makeCustomer(`New tenant ${tag()}`);
    const start = monthStart(2);
    const end = dayBefore(addMonths(start, 12));
    const source = (await postContract(contractBody(unitId, tenant, start, end)).expect(201)).body as ContractBody;
    const nextStart = dayAfter(end);
    const nextEnd = dayBefore(addMonths(nextStart, 12));

    const result = await race.raceBehindLock(
      'units',
      unitId,
      alternate(
        () => auth(http().post(`/contracts/${source.id}/renew`)).send({ start: iso(nextStart), end: iso(nextEnd), classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' }),
        () => postContract(contractBody(unitId, other, nextStart, nextEnd)),
      ),
    );
    const winner = result.responses.find((r) => r.status === 201);
    const loser = result.responses.find((r) => r.status !== 201);

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: loser?.body?.message,
      bookings: await bookings(unitId),
    }).toEqual({
      race: forced,
      statuses: [201, 409],
      refusal: winner ? ar(formatMessage(MSG.contract_dates_overlap, { contractNo: (winner.body as ContractBody).no })) : 'no contract was created',
      // the source contract and exactly one of the two contracts for the following term
      bookings: { contracts: 2, reservations: 0 },
    });
  });

  it('two reservations for the same unit: one is kept, the other is refused as already reserved', async () => {
    const unitId = await makeUnit();
    const expiry = iso(addMonths(new Date(), 1));

    const result = await race.raceBehindLock(
      'units',
      unitId,
      alternate(
        () => postReservation(unitId, `Holder A ${tag()}`, expiry),
        () => postReservation(unitId, `Holder B ${tag()}`, expiry),
      ),
    );
    const winner = result.responses.find((r) => r.status === 201);
    const loser = result.responses.find((r) => r.status !== 201);

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: loser?.body?.message,
      bookings: await bookings(unitId),
    }).toEqual({
      race: forced,
      statuses: [201, 409],
      refusal: winner ? ar(formatMessage(MSG.reservation_already_active, { expiryDate: (winner.body as ReservationBody).expiryDate.slice(0, 10) })) : 'no reservation was created',
      bookings: { contracts: 0, reservations: 1 },
    });
  });

  it('a contract running today and a reservation for someone else on the same unit: only one of them is booked', async () => {
    const unitId = await makeUnit();
    const tenantName = `Leasing tenant ${tag()}`;
    const tenant = await makeCustomer(tenantName);
    const holderName = `Reserving holder ${tag()}`;
    const start = monthStart(0);
    const end = dayBefore(addMonths(start, 12));
    const expiry = iso(addMonths(new Date(), 1));

    const result = await race.raceBehindLock(
      'units',
      unitId,
      alternate(
        () => postContract(contractBody(unitId, tenant, start, end)),
        () => postReservation(unitId, holderName, expiry),
      ),
    );
    const [contract, reservation] = result.responses;
    // Whichever booked first, the other is refused for that booking.
    const expectedRefusal =
      contract.status === 201
        ? { by: 'reservation', message: ar(MSG.reservation_unit_rented) }
        : reservation.status === 201
          ? { by: 'contract', message: ar(formatMessage(MSG.reservation_name_mismatch, { name: holderName, expiryDate: expiry })) }
          : { by: 'none', message: 'neither booking was created' };
    const after = await bookings(unitId);

    expect({
      race: raceShape(result),
      statuses: result.responses.map((r) => r.status).sort(),
      refusal: contract.status === 201 ? { by: 'reservation', message: reservation.body?.message } : { by: 'contract', message: contract.body?.message },
      booked: after.contracts + after.reservations,
    }).toEqual({
      race: forced,
      statuses: [201, 409],
      refusal: expectedRefusal,
      booked: 1,
    });
  });
});
