import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget, about three times the measured run.
jest.setTimeout(120000);

const MIGRATION = '20261016120000_purchase_supplier_ref_unique';
const DUPLICATE = 'purchases.supplier_ref_taken';

/**
 * A supplier invoice is recorded once: the same supplier invoice number on a second active
 * purchase of the same supplier is refused (in the service with a named 409, and by a partial
 * unique index in the database), while another supplier, a voided purchase and the purchase's
 * own number stay free.
 */
describe('purchase supplier invoice number is unique per supplier (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany | undefined;
  let token: string;
  let companyId: string;
  let supplierA: string;
  let supplierB: string;
  const suffix = Date.now();
  const today = () => new Date().toISOString().slice(0, 10);

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const post = (path: string) => auth(request(app.getHttpServer()).post(path));
  const patch = (path: string) => auth(request(app.getHttpServer()).patch(path));
  const del = (path: string) => auth(request(app.getHttpServer()).delete(path));

  const purchase = (supplierId: string, supplierRef?: string) =>
    post('/purchases').send({ supplierId, date: today(), category: `بند ${suffix}`, subtotal: 100, exempt: true, ...(supplierRef !== undefined ? { supplierRef } : {}) });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'supplier-ref');
    token = company.token;
    companyId = company.companyId;
    supplierA = (await post('/suppliers').send({ name: `Supplier A ${suffix}` }).expect(201)).body.id;
    supplierB = (await post('/suppliers').send({ name: `Supplier B ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('refuses a second purchase with the same supplier invoice number from the same supplier', async () => {
    await purchase(supplierA, 'INV-100').expect(201);
    const second = await purchase(supplierA, 'INV-100');
    expect(second.status).toBe(409);
    expect(String(second.body.message)).toContain(DUPLICATE);
  });

  it('compares the number without case or surrounding spaces', async () => {
    await purchase(supplierA, 'INV-200').expect(201);
    const variant = await purchase(supplierA, '  inv-200 ');
    expect(variant.status).toBe(409);
    expect(String(variant.body.message)).toContain(DUPLICATE);
  });

  it('accepts the same number from a different supplier, and purchases without a number', async () => {
    await purchase(supplierA, 'INV-300').expect(201);
    await purchase(supplierB, 'INV-300').expect(201);
    await purchase(supplierA).expect(201);
    await purchase(supplierA).expect(201);
    await purchase(supplierA, '   ').expect(201);
  });

  it('a voided purchase does not block its number, and the new active one does', async () => {
    const first = await purchase(supplierA, 'INV-400').expect(201);
    await del(`/purchases/${first.body.id}`).expect(204);
    await purchase(supplierA, 'INV-400').expect(201);
    const third = await purchase(supplierA, 'INV-400');
    expect(third.status).toBe(409);
  });

  it('refuses an edit that would give a purchase another active purchase number of the same supplier', async () => {
    await purchase(supplierA, 'INV-500').expect(201);
    const other = await purchase(supplierA, 'INV-501').expect(201);
    const byRef = await patch(`/purchases/${other.body.id}`).send({ supplierRef: 'inv-500' });
    expect(byRef.status).toBe(409);
    expect(String(byRef.body.message)).toContain(DUPLICATE);

    const fromB = await purchase(supplierB, 'INV-500').expect(201);
    const bySupplier = await patch(`/purchases/${fromB.body.id}`).send({ supplierId: supplierA });
    expect(bySupplier.status).toBe(409);
    expect(String(bySupplier.body.message)).toContain(DUPLICATE);
  });

  it('accepts an edit that keeps the purchase on its own number', async () => {
    const own = await purchase(supplierA, 'INV-600').expect(201);
    const same = await patch(`/purchases/${own.body.id}`).send({ supplierRef: 'INV-600', dueDate: today() });
    expect(same.status).toBe(200);
    expect(same.body.supplierRef).toBe('INV-600');
  });

  it('two simultaneous purchases with the same number: one is recorded, the other refused', async () => {
    const results = await Promise.all([purchase(supplierA, 'INV-700'), purchase(supplierA, 'INV-700')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  /** Copies an existing purchase row in SQL with a new number and the given reference: the write the service never sees. */
  async function insertCopy(sourceId: string, supplierRef: string): Promise<string> {
    const ROLLBACK = new Error('rollback-by-design');
    let outcome = 'not run';
    await expect(
      tenantPrisma.runInTenantContext(companyId, async (tx) => {
        outcome = await tx
          .$executeRaw`INSERT INTO "purchases" ("id", "companyId", "no", "supplierId", "date", "subtotal", "taxAmount", "total", "baseSubtotal", "baseTaxAmount", "baseTotal", "supplierRef", "inputVatUse", "updatedAt")
            SELECT gen_random_uuid()::text, "companyId", "no" || '-COPY', "supplierId", "date", "subtotal", "taxAmount", "total", "baseSubtotal", "baseTaxAmount", "baseTotal", ${supplierRef}, "inputVatUse", now()
            FROM "purchases" WHERE "id" = ${sourceId}`
          .then(
            (n) => `inserted ${n}`,
            (e: Error) => String(e.message),
          );
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    return outcome;
  }

  it('the database refuses a second active row with the same number written past the service', async () => {
    const source = await purchase(supplierA, 'INV-800').expect(201);
    // The probe is checked both ways: the same copy with a fresh number is inserted, so the unique
    // violation on the taken number can only come from the supplier invoice number index.
    expect(await insertCopy(source.body.id, `INV-801-${suffix}`)).toBe('inserted 1');
    expect(await insertCopy(source.body.id, ' Inv-800 ')).toContain('Code: `23505`');
  });

  /**
   * Holds an uncommitted copy of a purchase with the given number, so a request started meanwhile passes
   * the service check and waits on the index until the copy commits: the race, made certain.
   */
  async function holdUncommittedCopy(sourceId: string, supplierRef: string) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let inserted!: () => void;
    const ready = new Promise<void>((resolve) => (inserted = resolve));
    const done = tenantPrisma.runInTenantContext(
      companyId,
      async (tx) => {
        await tx.$executeRaw`INSERT INTO "purchases" ("id", "companyId", "no", "supplierId", "date", "subtotal", "taxAmount", "total", "baseSubtotal", "baseTaxAmount", "baseTotal", "supplierRef", "inputVatUse", "updatedAt")
          SELECT gen_random_uuid()::text, "companyId", 'RACE-' || gen_random_uuid()::text, "supplierId", "date", "subtotal", "taxAmount", "total", "baseSubtotal", "baseTaxAmount", "baseTotal", ${supplierRef}, "inputVatUse", now()
          FROM "purchases" WHERE "id" = ${sourceId}`;
        inserted();
        await gate;
      },
      { timeout: 30000 },
    );
    await ready;
    return async () => {
      release();
      await done;
    };
  }
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('a create racing an uncommitted purchase with the same number is refused with the named 409', async () => {
    const source = await purchase(supplierA, `INV-1000-${suffix}`).expect(201);
    const commit = await holdUncommittedCopy(source.body.id, 'INV-1001');
    const pending = purchase(supplierA, 'INV-1001').then((r) => r);
    await pause(700);
    await commit();
    const res = await pending;
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toContain(DUPLICATE);
  });

  it('an edit racing an uncommitted purchase with the same number is refused with the named 409', async () => {
    const target = await purchase(supplierA, 'INV-1003').expect(201);
    const commit = await holdUncommittedCopy(target.body.id, 'INV-1002');
    const pending = patch(`/purchases/${target.body.id}`).send({ supplierRef: 'INV-1002' }).then((r) => r);
    await pause(700);
    await commit();
    const res = await pending;
    expect(res.status).toBe(409);
    expect(String(res.body.message)).toContain(DUPLICATE);
  });

  it('the migration counts existing duplicates and stops with their count instead of building the index', async () => {
    const source = await purchase(supplierA, 'INV-900').expect(201);
    const guard = readFileSync(join(__dirname, '..', 'prisma', 'migrations', MIGRATION, 'migration.sql'), 'utf8').match(/DO \$\$[\s\S]*?END \$\$/)?.[0];
    expect(guard).toContain('RAISE EXCEPTION');

    // Run as a migration runs: the application role with no company context, in a transaction rolled back at the end.
    const ROLLBACK = new Error('rollback-by-design');
    const seen: Record<string, string | number> = {};
    const run = (tx: Prisma.TransactionClient) =>
      tx.$executeRawUnsafe(guard!).then(
        () => 'passed',
        (e: Error) => String(e.message),
      );
    const setCompany = (tx: Prisma.TransactionClient, id: string) => tx.$queryRaw`SELECT set_config('app.company_id', ${id}, true)`;
    await expect(
      app.get(PrismaService).$transaction(
        async (tx) => {
          seen.visibleWithoutContext = Number((await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "purchases" WHERE "id" = ${source.body.id}`)[0].n);
          seen.clean = await run(tx);
          await setCompany(tx, companyId);
          await tx.$executeRawUnsafe('DROP INDEX "purchases_supplier_ref_key"');
          await tx.$executeRaw`INSERT INTO "purchases" ("id", "companyId", "no", "supplierId", "date", "subtotal", "taxAmount", "total", "baseSubtotal", "baseTaxAmount", "baseTotal", "supplierRef", "inputVatUse", "updatedAt")
            SELECT gen_random_uuid()::text, "companyId", "no" || '-COPY', "supplierId", "date", "subtotal", "taxAmount", "total", "baseSubtotal", "baseTaxAmount", "baseTotal", 'inv-900', "inputVatUse", now()
            FROM "purchases" WHERE "id" = ${source.body.id}`;
          await setCompany(tx, '');
          await tx.$executeRawUnsafe('SAVEPOINT guard_refuses');
          seen.duplicated = await run(tx);
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT guard_refuses');
          throw ROLLBACK;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(ROLLBACK);

    // Without a company context the rows are hidden, so the count only sees them because the guard lifts FORCE.
    expect(seen.visibleWithoutContext).toBe(0);
    expect(seen.clean).toBe('passed');
    expect(seen.duplicated).toContain('1 supplier invoice number');
    expect(seen.duplicated).toContain('2 purchases');
  });
});
