import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { KSA_UTC_OFFSET_MIN, localDateOf } from '../src/common/wall-clock.util';
import { WRITEOFF_REASONS } from '../src/common/writeoff-reasons';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// Suite budget: about three times the measured 16 s.
jest.setTimeout(60000);

/**
 * A stock movement dated in a closed period changes that period's balances even when it carries no cost, so it is
 * refused like an entry: transfers, zero cost receipts and issues, zero cost write-offs, zero cost opening lines, and
 * reversals or voids dated today while today's period is closed.
 */
describe('Inventory movements respect the period lock without a journal entry (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let moves: IsolatedCompany | undefined;
  let openings: IsolatedCompany | undefined;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const YEAR = 2093;
  const CLOSED = `03/${YEAR}`;
  const companyDay = () => localDateOf(new Date(), KSA_UTC_OFFSET_MIN);
  const NO_ADJUSTMENT = WRITEOFF_REASONS.find((r) => r.taxPath === 'NO_ADJUSTMENT')!;

  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany | undefined) => (r: request.Test) => r.set('Authorization', `Bearer ${c!.token}`);

  let warehouseA: string;
  let warehouseB: string;
  let costedProduct: string;
  let freeProduct: string;

  type Period = { id: string; month: number; year: number };
  async function periods(c: IsolatedCompany): Promise<Period[]> {
    const years = (await as(c)(http().get('/fiscal-years')).expect(200)).body as { periods: Period[] }[];
    return years.flatMap((y) => y.periods);
  }
  async function closePeriod(c: IsolatedCompany, day: string) {
    const [y, m] = day.split('-').map(Number);
    const period = (await periods(c)).find((p) => p.year === y && p.month === m);
    if (!period) throw new Error(`no fiscal period for ${day}`);
    await as(c)(http().patch(`/fiscal-years/periods/${period.id}/close`)).expect(200);
  }
  async function newProduct(c: IsolatedCompany, name: string) {
    return (await as(c)(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `${name} ${suffix}`, price: 10 }).expect(201)).body.id as string;
  }
  async function newWarehouse(c: IsolatedCompany, name: string) {
    return (await as(c)(http().post('/warehouses')).send({ name: `${name} ${suffix}` }).expect(201)).body.id as string;
  }
  const move = (body: Record<string, unknown>) => as(moves)(http().post('/inventory/movements')).send({ warehouseId: warehouseA, reason: 'period lock test', ...body });
  const movementsOn = (productId: string, day: string) =>
    tenantPrisma.runInTenantContext(moves!.companyId, (tx) => tx.stockMovement.count({ where: { productId, date: new Date(`${day}T00:00:00.000Z`) } }));
  const expectPeriodClosed = (res: request.Response, label: string) => {
    expect({ status: res.status, named: String(res.body.message).includes(label) }).toEqual({ status: 409, named: true });
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    moves = await registerIsolatedCompany(app, 'inv-period-moves');
    await as(moves)(http().post('/fiscal-years')).send({ name: `Year ${YEAR}`, start: `${YEAR}-01-01`, end: `${YEAR}-12-31` }).expect(201);
    await as(moves)(http().patch('/company-profile')).send({ writeOffRequiresTwoPersons: false }).expect(200);
    warehouseA = await newWarehouse(moves, 'Main');
    warehouseB = await newWarehouse(moves, 'Branch');
    costedProduct = await newProduct(moves, 'Costed');
    freeProduct = await newProduct(moves, 'Free');
    await move({ productId: costedProduct, type: 'IN', qty: 10, unitCost: 5, date: `${YEAR}-02-10` }).expect(201);
    await closePeriod(moves, `${YEAR}-03-01`);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, moves);
    await removeIsolatedCompany(app, openings);
    await app.close();
  });

  it('refuses a transfer dated in a closed period and accepts it in an open one', async () => {
    const closed = await move({ productId: costedProduct, type: 'TRANSFER', toWarehouseId: warehouseB, qty: 2, date: `${YEAR}-03-10` });
    expectPeriodClosed(closed, CLOSED);
    expect(await movementsOn(costedProduct, `${YEAR}-03-10`)).toBe(0);

    await move({ productId: costedProduct, type: 'TRANSFER', toWarehouseId: warehouseB, qty: 2, date: `${YEAR}-04-10` }).expect(201);
  });

  it('refuses a zero cost receipt and a zero cost issue dated in a closed period', async () => {
    expectPeriodClosed(await move({ productId: freeProduct, type: 'IN', qty: 3, unitCost: 0, date: `${YEAR}-03-12` }), CLOSED);
    expectPeriodClosed(await move({ productId: freeProduct, type: 'OUT', qty: 1, date: `${YEAR}-03-13` }), CLOSED);
    expect(await movementsOn(freeProduct, `${YEAR}-03-12`)).toBe(0);
    expect(await movementsOn(freeProduct, `${YEAR}-03-13`)).toBe(0);

    const open = await move({ productId: freeProduct, type: 'IN', qty: 3, unitCost: 0, date: `${YEAR}-04-12` }).expect(201);
    expect(open.body.journalEntryId).toBeNull();
  });

  it('refuses approving a zero cost write-off dated in a closed period, and approves it in an open one', async () => {
    const record = async (occurredAt: string) =>
      (
        await as(moves)(http().post('/inventory/write-offs'))
          .send({ productId: freeProduct, warehouseId: warehouseA, qty: 1, reasonCode: NO_ADJUSTMENT.code, occurredAt, note: `damage ${suffix}` })
          .expect(201)
      ).body as { id: string };

    const inClosed = await record(`${YEAR}-03-15`);
    expectPeriodClosed(await as(moves)(http().post(`/inventory/write-offs/${inClosed.id}/approve`)).send({}), CLOSED);
    const pending = await tenantPrisma.runInTenantContext(moves!.companyId, (tx) => tx.inventoryWriteOff.findUniqueOrThrow({ where: { id: inClosed.id } }));
    expect({ status: pending.status, movementId: pending.movementId }).toEqual({ status: 'PENDING_REVIEW', movementId: null });

    const inOpen = await record(`${YEAR}-04-15`);
    const approved = await as(moves)(http().post(`/inventory/write-offs/${inOpen.id}/approve`)).send({}).expect(201);
    expect({ baseCost: Number(approved.body.baseCost), entry: approved.body.journalEntryId }).toEqual({ baseCost: 0, entry: null });
  });

  it('refuses reversing a transfer while the current period is closed', async () => {
    const today = companyDay();
    await move({ productId: costedProduct, type: 'IN', qty: 5, unitCost: 5, date: today }).expect(201);
    const transfer = await move({ productId: costedProduct, type: 'TRANSFER', toWarehouseId: warehouseB, qty: 1, date: today }).expect(201);
    await closePeriod(moves!, today);

    const reversed = await as(moves)(http().post(`/inventory/movements/${transfer.body.id}/reverse`)).send({});
    expectPeriodClosed(reversed, `${today.slice(5, 7)}/${today.slice(0, 4)}`);
  });

  it('refuses a zero cost opening declaration dated in a closed period and voiding its line while today is closed', async () => {
    openings = await registerIsolatedCompany(app, 'inv-period-openings');
    await as(openings)(http().post('/fiscal-years')).send({ name: `Year ${YEAR}`, start: `${YEAR}-01-01`, end: `${YEAR}-12-31` }).expect(201);
    await closePeriod(openings, `${YEAR}-03-01`);
    const warehouse = await newWarehouse(openings, 'Opening');
    const product = await newProduct(openings, 'Opening');
    const declare = (openingDate: string) =>
      as(openings)(http().post('/inventory/opening')).send({ openingDate, lines: [{ productId: product, warehouseId: warehouse, qty: 4, unitCost: 0, acquiredAt: `${YEAR}-02-20` }] });

    expectPeriodClosed(await declare(`${YEAR}-03-01`), CLOSED);
    const left = await tenantPrisma.runInTenantContext(openings.companyId, (tx) => tx.stockOpening.count());
    expect(left).toBe(0);

    const declared = (await declare(`${YEAR}-04-01`).expect(201)).body as { id: string; lines: { id: string }[] };
    // A costed receipt today makes sure today's fiscal year exists before its period is closed.
    const scratch = await newProduct(openings, 'Scratch');
    const today = companyDay();
    await as(openings)(http().post('/inventory/movements')).send({ productId: scratch, warehouseId: warehouse, type: 'IN', qty: 1, unitCost: 1, date: today, reason: 'period lock test' }).expect(201);
    await closePeriod(openings, today);

    const voided = await as(openings)(http().post(`/inventory/opening/${declared.id}/lines/${declared.lines[0].id}/void`)).send({});
    expectPeriodClosed(voided, `${today.slice(5, 7)}/${today.slice(0, 4)}`);
  });
});
