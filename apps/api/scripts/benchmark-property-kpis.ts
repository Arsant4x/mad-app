/**
 * Benchmark for GET /reports/property-kpis at production-portfolio scale.
 *
 * Seeds 5,000 extra contracts (12 installments each — 60,000 installment rows,
 * plus 10,000 rent payments: per contract one paid on time, one paid 40 days
 * late) into the largest existing dev company, then measures the *real*
 * service path — ReportsService.propertyKpis() resolved out of the actual
 * Nest application, so the timing includes runInTenantContext and its default
 * 5s transaction timeout. If the report were still too slow, this script
 * would fail with the same "Transaction already closed" the e2e suite hits.
 *
 * Everything seeded is marked (contract no `BM-…`, property «عقار بنشمارك»)
 * and deleted again at the end. Pass --keep to leave the data for manual
 * poking, and --skip-seed to measure against data a previous --keep run left
 * behind — that is how before/after variants (index dropped vs present, old
 * code vs new) get compared on *literally the same rows* instead of on two
 * separately-seeded portfolios.
 *
 * Run from apps/api:  npx ts-node -r dotenv/config scripts/benchmark-property-kpis.ts
 */
import { randomUUID } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';

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
        id: randomUUID(),
        companyId,
        contractId: c.id,
        dueDate: new Date(Date.UTC(c.start.getUTCFullYear(), c.start.getUTCMonth() + m, 1)),
        amount: 1000,
        baseAmount: 1000,
        // The first two installments of every contract are paid (see below) —
        // that gives the collection KPI a realistic paid/on-time mix.
        status: (m < 2 ? 'PAID' : 'DUE') as 'PAID' | 'DUE',
      })),
    );
    // One on-time payment (on the due date) and one 40 days late, per
    // contract — so "collected" and "collected on time" genuinely differ.
    const payments = installments
      .filter((i2) => i2.status === 'PAID')
      .map((i2, k) => ({
        companyId,
        contractId: i2.contractId,
        installmentId: i2.id,
        date: k % 2 === 0 ? i2.dueDate : new Date(i2.dueDate.getTime() + 40 * 86400000),
        amount: 1000,
        netAmount: 1000,
        baseAmount: 1000,
        baseNetAmount: 1000,
        method: 'CASH' as const,
        notes: 'BM-PAYMENT',
      }));
    await inTenant(companyId, async (tx) => {
      await tx.contract.createMany({ data: contracts });
      await tx.installment.createMany({ data: installments });
      await tx.rentPayment.createMany({ data: payments });
    });
    process.stdout.write(`\rseeded ${offset + size}/${TARGET_EXTRA} contracts`);
  }
  process.stdout.write('\n');
}

async function cleanup(companyId: string): Promise<void> {
  await inTenant(companyId, async (tx) => {
    // Payments first: deleting an installment fires ON DELETE SET NULL against
    // rent_payments, so clearing the 10k seeded payments up front keeps the
    // 60k cascading installment deletions from re-touching them one by one.
    await tx.rentPayment.deleteMany({ where: { companyId, notes: 'BM-PAYMENT' } });
    // Installments go with their contracts (onDelete: Cascade).
    await tx.contract.deleteMany({ where: { companyId, no: { startsWith: 'BM-' } } });
    await tx.unit.deleteMany({ where: { companyId, unitNo: 'BM-UNIT' } });
    await tx.property.deleteMany({ where: { companyId, name: 'عقار بنشمارك — بيانات مؤقتة' } });
  });
}

async function main() {
  const keep = process.argv.includes('--keep');
  const skipSeed = process.argv.includes('--skip-seed');
  const company = await pickCompany();
  console.log(`Company: ${company.orgName} — ${company.contracts} contracts before seeding`);

  const already = await inTenant(company.id, (tx) => tx.contract.count({ where: { companyId: company.id, no: { startsWith: 'BM-' } } }));
  if (skipSeed) {
    if (already === 0) throw new Error('--skip-seed passed but no BM- contracts are present — run once with --keep first.');
    console.log(`--skip-seed: measuring against the ${already} BM- contracts already in place.`);
  } else {
    if (already > 0) {
      console.log(`(${already} leftover BM- contracts found — cleaning them first)`);
      await cleanup(company.id);
    }
    console.log(`Seeding ${TARGET_EXTRA} contracts × ${INSTALLMENTS_PER_CONTRACT} installments + payments…`);
    await seed(company.id);
  }

  const contracts = await inTenant(company.id, (tx) => tx.contract.count({ where: { companyId: company.id } }));
  const installments = await inTenant(company.id, (tx) => tx.installment.count({ where: { companyId: company.id } }));
  const payments = await inTenant(company.id, (tx) => tx.rentPayment.count({ where: { companyId: company.id } }));
  console.log(`Now: ${contracts} contracts, ${installments} installments, ${payments} rent payments\n`);

  // Boot the real application context so propertyKpis() runs exactly the
  // production path, 5s tenant-transaction timeout included.
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const svc = app.get(ReportsService);

    let worst = 0;
    let failed = false;
    for (const label of ['cold  ', 'warm 1', 'warm 2']) {
      const t = Date.now();
      try {
        await svc.propertyKpis(company.id);
        const ms = Date.now() - t;
        worst = Math.max(worst, ms);
        console.log(`${label} ${ms} ms`);
      } catch (e) {
        failed = true;
        // Prisma buries the reason under a code frame, so pull out the line
        // that names it — "Transaction already closed" is the whole point of
        // this run, and printing the frame's first line instead would hide it.
        const lines = (e as Error).message.split('\n').map((l) => l.trim()).filter(Boolean);
        const why = lines.find((l) => /transaction|timeout|timed out/i.test(l)) ?? lines[0] ?? String(e);
        console.log(`${label} FAILED after ${Date.now() - t} ms — ${why}`);
      }
    }
    if (failed) {
      console.log('\nresult: FAIL — the report cannot survive the 5s tenant-transaction timeout');
      process.exitCode = 1;
    } else {
      console.log(`\nworst case: ${worst} ms — ${worst < 1000 ? 'PASS (< 1s)' : 'FAIL (>= 1s)'}`);
      if (worst >= 1000) process.exitCode = 1;
    }
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
