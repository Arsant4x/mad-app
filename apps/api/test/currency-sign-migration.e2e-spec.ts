import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// Suite budget: one company registration and a rolled-back replay, like the other migration replays.
jest.setTimeout(120000);

const OFFICIAL_SIGN = String.fromCodePoint(0x20c1);
const OLD_DEFAULT = String.fromCodePoint(0x631, 0x2e, 0x633);

/**
 * The riyal's symbol is the central bank's official sign. A new company is born with it, and the
 * migration moves riyal rows that still hold the old default abbreviation to it, while a symbol the
 * merchant typed and other currencies stay as they are. The migration's own block is replayed on
 * known rows inside a transaction that is rolled back.
 */
describe('official riyal sign: new companies and the migration of existing rows (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'riyal-sign');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await app.close();
  });

  it('a new company is born with the official sign on its riyal row, and the list returns it', async () => {
    const res = await http().get('/currencies').set('Authorization', `Bearer ${a.token}`).expect(200);
    const riyal = (res.body as { code: string; symbol: string | null; isBase: boolean }[]).find((c) => c.isBase);
    expect(riyal).toMatchObject({ code: 'SAR', symbol: OFFICIAL_SIGN });
  });

  it('the migration moves the old default to the sign, and leaves typed symbols and other currencies alone', async () => {
    const sql = readFileSync(
      join(__dirname, '..', 'prisma', 'migrations', '20261013100000_currency_official_riyal_sign', 'migration.sql'),
      'utf8',
    );
    const block = sql.match(/DO \$\$[\s\S]*?END \$\$/)?.[0];
    // The probe read the block from the file itself.
    expect(block).toContain('RAISE WARNING');

    const ROLLBACK = new Error('rollback-by-design');
    const seen: Record<string, unknown> = {};

    await expect(
      tenantPrisma.runInTenantContext(
        a.companyId,
        async (tx) => {
          const symbolOf = async (code: string) =>
            (await tx.$queryRaw<{ symbol: string | null }[]>`SELECT "symbol" FROM "currencies" WHERE "companyId" = ${a.companyId} AND "code" = ${code}`)[0]?.symbol;
          await tx.$executeRaw`UPDATE "currencies" SET "symbol" = ${OLD_DEFAULT} WHERE "companyId" = ${a.companyId} AND "code" = 'SAR'`;
          await tx.$executeRaw`INSERT INTO "currencies" ("id", "companyId", "code", "name", "symbol", "isBase", "rate", "updatedAt")
            VALUES (gen_random_uuid()::text, ${a.companyId}, 'USD', 'US Dollar', ${OLD_DEFAULT}, false, 3.75, now())`;
          await tx.$executeRawUnsafe(block!);
          seen.riyal = await symbolOf('SAR');
          seen.dollar = await symbolOf('USD');

          await tx.$executeRaw`UPDATE "currencies" SET "symbol" = 'SR' WHERE "companyId" = ${a.companyId} AND "code" = 'SAR'`;
          await tx.$executeRawUnsafe(block!);
          seen.typed = await symbolOf('SAR');
          throw ROLLBACK;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(ROLLBACK);

    expect(seen).toEqual({ riyal: OFFICIAL_SIGN, dollar: OLD_DEFAULT, typed: 'SR' });
  });
});
