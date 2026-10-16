/**
 * Backfill: encrypts the plain base salary of every existing employee, company by company, and clears the plain value.
 *
 * Why a script and not a migration: the key lives outside the database (`PII_ENCRYPTION_KEYS`), so no migration can
 * write ciphertext. The order is three steps (DEPLOY.md section 6, path c):
 *   1) migration 20261017090000_employee_salary_encrypted adds the column and counts what waits (WARNING).
 *   2) this script encrypts and clears the plain value.
 *   3) migration 20261017100000_employee_salary_plaintext_dropped drops the plain column, and refuses while one remains.
 *
 * Each company runs in its own transaction under its context (the table is under FORCE). What remains is counted from
 * the database itself. Safe to rerun, and it does nothing once the column is dropped. It never prints a salary, only
 * counts and the company name.
 *
 * Run (from apps/api):        npx ts-node scripts/backfill-employee-salary-encryption.ts
 * In production (run image):  node dist/scripts/backfill-employee-salary-encryption.js
 */
import { PrismaClient } from '@mad-app/db';
import { encryptPlaintextSalaries, plaintextSalaryColumnExists } from '../src/employees/salary-backfill.util';

const prisma = new PrismaClient();

async function main() {
  if (!(await plaintextSalaryColumnExists(prisma))) {
    console.log('The plain column employees.baseSalary does not exist (dropped by the second migration); nothing to encrypt.');
    return;
  }
  const companies = await prisma.company.findMany({ select: { id: true, orgName: true }, orderBy: { createdAt: 'asc' } });
  console.log(`Checking ${companies.length} companies ...`);

  let failures = 0;
  let total = 0;
  let remainingTotal = 0;
  for (const company of companies) {
    try {
      const { found, encrypted, remaining } = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true)`;
        const done = await encryptPlaintextSalaries(tx, company.id);
        const left = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "employees" WHERE "companyId" = ${company.id} AND "baseSalary" IS NOT NULL`;
        return { ...done, remaining: Number(left[0]?.n ?? 0) };
      });
      total += encrypted;
      remainingTotal += remaining;
      if (found) console.log(`ok ${company.orgName}: found ${found}, encrypted ${encrypted}, still plain ${remaining}`);
    } catch (e) {
      failures += 1;
      console.error(`failed ${company.orgName}: ${(e as Error).message}`);
    }
  }

  console.log(`Total: encrypted ${total} salaries across ${companies.length} companies, still plain ${remainingTotal}.`);
  if (failures || remainingTotal) {
    console.error(`Not complete: ${failures} companies failed, ${remainingTotal} still plain. Fix the cause and run again (safe to rerun); the second migration refuses until this is zero.`);
    process.exitCode = 1;
  } else {
    console.log('Complete: no plain salary remains, the second migration will pass.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
