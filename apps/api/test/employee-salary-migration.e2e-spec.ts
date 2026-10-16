import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { decryptField } from '../src/common/crypto/field-cipher.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { encryptPlaintextSalaries, plaintextSalaryColumnExists } from '../src/employees/salary-backfill.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: three times the measured run, declared here rather than assumed at five seconds.
jest.setTimeout(120000);

/**
 * A plain salary left from before encryption: the second migration's guard refuses it, the backfill encrypts
 * and clears it (soft deleted rows too), a rerun finds nothing, and the guard then passes.
 *
 * The test database has already dropped the plain column, so the state between the two migrations is rebuilt
 * inside a transaction that is rolled back, from the first migration's own text.
 */
describe('Employee salary encryption migration and backfill (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const as = (token: string) => (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'salary-mig');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await app.close();
  });

  it('a plain salary left over: the drop guard refuses it, the backfill encrypts it, a rerun finds nothing, the guard passes', async () => {
    const live = await as(a.token)(http().post('/employees')).send({ fullName: 'Legacy Live', hireDate: '2026-01-01' }).expect(201);
    const trashed = await as(a.token)(http().post('/employees')).send({ fullName: 'Legacy Trashed', hireDate: '2026-01-01' }).expect(201);
    await as(a.token)(http().delete(`/employees/${trashed.body.id}`)).expect(204);

    const migrations = join(__dirname, '..', 'prisma', 'migrations');
    const guard = readFileSync(join(migrations, '20261017100000_employee_salary_plaintext_dropped', 'migration.sql'), 'utf8').match(/DO \$\$[\s\S]*?END \$\$/)?.[0];
    const transition = readFileSync(join(migrations, '20261017090000_employee_salary_encrypted', 'migration.sql'), 'utf8').match(
      /ALTER TABLE "employees" ADD CONSTRAINT "employees_base_salary_transition"[\s\S]*?\);/,
    )?.[0];
    // Probe check: both blocks were read from their files.
    expect(guard).toContain('RAISE EXCEPTION');
    expect(transition).toContain('baseSalaryCipher');

    const ROLLBACK = new Error('rollback-by-design');
    const seen: Record<string, unknown> = {};
    await expect(
      tenantPrisma.runInTenantContext(
        a.companyId,
        async (tx) => {
          expect(await plaintextSalaryColumnExists(tx)).toBe(false);
          await tx.$executeRawUnsafe('ALTER TABLE "employees" ADD COLUMN "baseSalary" DECIMAL(18,2)');
          await tx.$executeRawUnsafe(transition!.replace(/;$/, ''));
          expect(await plaintextSalaryColumnExists(tx)).toBe(true);
          await tx.$executeRaw`UPDATE "employees" SET "baseSalary" = 4321.50 WHERE "id" = ${live.body.id}`;
          await tx.$executeRaw`UPDATE "employees" SET "baseSalary" = 0 WHERE "id" = ${trashed.body.id}`;

          // The guard refuses while a plain value remains, and the error is its own.
          await tx.$executeRawUnsafe('SAVEPOINT guard_refuses');
          seen.refused = await tx.$executeRawUnsafe(guard!).then(
            () => 'passed',
            (e: Error) => String(e.message),
          );
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT guard_refuses');

          seen.first = await encryptPlaintextSalaries(tx, a.companyId);
          seen.second = await encryptPlaintextSalaries(tx, a.companyId);
          seen.rows = await tx.$queryRaw<Record<string, string | null>[]>`
            SELECT "id", "baseSalary"::text AS "baseSalary", "baseSalaryCipher" FROM "employees" WHERE "id" IN (${live.body.id}, ${trashed.body.id})`;
          seen.passed = await tx.$executeRawUnsafe(guard!).then(
            () => 'passed',
            (e: Error) => String(e.message),
          );
          throw ROLLBACK;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(ROLLBACK);

    expect(String(seen.refused)).toContain('plain base salary');
    expect(seen.first).toEqual({ found: 2, encrypted: 2 });
    expect(seen.second).toEqual({ found: 0, encrypted: 0 });
    const rows = seen.rows as { id: string; baseSalary: string | null; baseSalaryCipher: string | null }[];
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const [id, plain] of [
      [live.body.id as string, '4321.50'],
      [trashed.body.id as string, '0.00'],
    ] as const) {
      const r = byId.get(id)!;
      expect(r.baseSalary).toBeNull();
      expect(r.baseSalaryCipher).toMatch(/^f1:test1:/);
      expect(decryptField(r.baseSalaryCipher!, `${a.companyId}|employees.baseSalary|${id}`)).toBe(plain);
    }
    expect(seen.passed).toBe('passed');

    // What was rolled back stays rolled back: no plain column, no salary on the live row.
    expect(await plaintextSalaryColumnExists(app.get(PrismaService))).toBe(false);
    const after = await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$queryRaw<{ baseSalaryCipher: string | null }[]>`SELECT "baseSalaryCipher" FROM employees WHERE id = ${live.body.id}`,
    );
    expect(after[0].baseSalaryCipher).toBeNull();
  });
});
