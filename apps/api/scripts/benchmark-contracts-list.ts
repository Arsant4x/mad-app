/**
 * Benchmark for GET /contracts at production-portfolio scale.
 *
 * Seeds 5,000 extra contracts (12 installments each — 60,000 installment rows)
 * into the largest existing dev company, then measures the *real* service path
 * — ContractsService.list() resolved out of the actual Nest application, so
 * the timing includes runInTenantContext and its default 5s transaction
 * timeout. If the endpoint were still too slow, this script would fail with
 * the same "Transaction already closed" the e2e suites hit.
 *
 * Everything seeded is marked (contract no `BM-…`, property «عقار بنشمارك»)
 * and deleted again at the end. Pass --keep to leave the data for manual
 * poking.
 *
 * Run from apps/api:  npx ts-node scripts/benchmark-contracts-list.ts
 */
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ContractsService } from '../src/contracts/contracts.service';

const TARGET_EXTRA = 5000;
const INSTALLMENTS_PER_CONTRACT = 12;
const CHUNK = 500;

const prisma = new PrismaClient();

async function inTenant<T>(companyId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return work(tx);
    },
    { timeout: 300_000 },
  );
}

async function pickCompany(): Promise<{ id: string; orgName: string; contracts: number }> {
  const companies = await prisma.company.findMany({ select: { id: true, orgName: true } });
  let best: { id: string; orgName: string; contracts: number } | null = null;
  for (const c of companies) {
    const n = await inTenant(c.id, (tx) => tx.contract.count({ where: { companyId: c.id } }));
    if (!best || n > best.contracts) best = { ...c, contracts: n };
  }
  if (!best) throw new Error('No companies in the dev DB — seed it first.');
  return best;
}

async function seed(companyId: string): Promise<void> {
  await inTenant(companyId, async (tx) => {
    const property = await tx.property.create({
      data: { companyId, name: 'عقار بنشمارك — بيانات مؤقتة', ownership: 'owned' },
    });
    await tx.unit.create({
      data: { companyId, propertyId: property.id, unitNo: 'BM-UNIT', type: 'مكتب', rentMonthly: 1000 },
    });
  });

  const unit = await inTenant(companyId, (tx) => tx.unit.findFirst({ where: { companyId, unitNo: 'BM-UNIT' } }));
  if (!unit) throw new Error('benchmark unit vanished');

  for (let offset = 0; offset < TARGET_EXTRA; offset += CHUNK) {
    const size = Math.min(CHUNK, TARGET_EXTRA - offset);
    const contracts = Array.from({ length: size }, (_, j) => {
      const i = offset + j;
      const startYear = 2024 + (i % 4);
      const startMonth = (i % 12) + 1;
      return {
        id: randomUUID(),
        companyId,
        unitId: unit.id,
        no: `BM-${String(i).padStart(5, '0')}`,
        tenant: `مستأجر بنشمارك ${i}`,
        value: 12000,
        cycle: 'monthly',
        start: new Date(Date.UTC(startYear, startMonth - 1, 1)),
        end: new Date(Date.UTC(startYear + 1, startMonth - 1, 1)),
        baseValue: 12000,
        status: 'DUE' as const,
      };
    });
    const installments = contracts.flatMap((c) =>
      Array.from({ length: INSTALLMENTS_PER_CONTRACT }, (_, m) => ({
        companyId,
        contractId: c.id,
        dueDate: new Date(Date.UTC(c.start.getUTCFullYear(), c.start.getUTCMonth() + m, 1)),
        amount: 1000,
        baseAmount: 1000,
      })),
    );
    await inTenant(companyId, async (tx) => {
      await tx.contract.createMany({ data: contracts });
      await tx.installment.createMany({ data: installments });
    });
    process.stdout.write(`\rseeded ${offset + size}/${TARGET_EXTRA} contracts`);
  }
  process.stdout.write('\n');
}

async function cleanup(companyId: string): Promise<void> {
  await inTenant(companyId, async (tx) => {
    // Installments go with their contracts (onDelete: Cascade).
    await tx.contract.deleteMany({ where: { companyId, no: { startsWith: 'BM-' } } });
    await tx.unit.deleteMany({ where: { companyId, unitNo: 'BM-UNIT' } });
    await tx.property.deleteMany({ where: { companyId, name: 'عقار بنشمارك — بيانات مؤقتة' } });
  });
}

async function main() {
  const keep = process.argv.includes('--keep');
  const company = await pickCompany();
  console.log(`Company: ${company.orgName} — ${company.contracts} contracts before seeding`);

  const already = await inTenant(company.id, (tx) => tx.contract.count({ where: { companyId: company.id, no: { startsWith: 'BM-' } } }));
  if (already > 0) {
    console.log(`(${already} leftover BM- contracts found — cleaning them first)`);
    await cleanup(company.id);
  }

  console.log(`Seeding ${TARGET_EXTRA} contracts × ${INSTALLMENTS_PER_CONTRACT} installments…`);
  await seed(company.id);

  const contracts = await inTenant(company.id, (tx) => tx.contract.count({ where: { companyId: company.id } }));
  const installments = await inTenant(company.id, (tx) => tx.installment.count({ where: { companyId: company.id } }));
  console.log(`Now: ${contracts} contracts, ${installments} installments\n`);

  // Boot the real application context so list() runs exactly the production
  // path, 5s tenant-transaction timeout included.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ContractsService);

    // One untimed call first: the seeded installments carry past due dates, so
    // the first read performs a one-off DUE→LATE flip across the whole seeded
    // backlog (tens of thousands of rows) — a seeding artifact that a real
    // portfolio, which accrues overdue installments a few at a time, never
    // sees in bulk. Prisma's engine warm-up rides along with it.
    const w = Date.now();
    await svc.list(company.id);
    console.log(`warm-up (one-off seeded-backlog DUE→LATE flip, untimed): ${Date.now() - w} ms`);

    const runs: [string, () => Promise<unknown>][] = [
      ['page 1 (default)      ', () => svc.list(company.id)],
      ['page 1 again          ', () => svc.list(company.id)],
      ['deep page (page 200)  ', () => svc.list(company.id, { page: 200, pageSize: 25 })],
      ['max page size (100)   ', () => svc.list(company.id, { pageSize: 100 })],
      ['search by tenant name ', () => svc.list(company.id, { search: 'بنشمارك 4321' })],
      ['search by contract no ', () => svc.list(company.id, { search: 'BM-04321' })],
    ];

    let worst = 0;
    for (const [label, run] of runs) {
      const t = Date.now();
      await run();
      const ms = Date.now() - t;
      worst = Math.max(worst, ms);
      console.log(`${label} ${ms} ms`);
    }
    console.log(`\nworst case: ${worst} ms — ${worst < 1000 ? 'PASS (< 1s)' : 'FAIL (>= 1s)'}`);
    if (worst >= 1000) process.exitCode = 1;
  } finally {
    await app.close();
  }

  if (keep) {
    console.log('\n--keep passed: benchmark data left in place (contracts BM-*, unit BM-UNIT).');
  } else {
    console.log('\nCleaning benchmark data…');
    await cleanup(company.id);
    const after = await inTenant(company.id, (tx) => tx.contract.count({ where: { companyId: company.id } }));
    console.log(`Done — back to ${after} contracts.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
