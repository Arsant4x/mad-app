import { Prisma } from '@mad-app/db';
import { encryptSalary } from './employee-salary.util';

/**
 * Encrypts the plain base salaries left from before encryption, for one company, and clears the plain value in the
 * same update, so a row never holds both (the transition constraint forbids it anyway).
 *
 * - Inside the company's context (`tx` has `app.company_id` set): the table is under FORCE, and a read outside the
 *   context comes back empty without an error.
 * - Raw SQL with no soft delete filter: a trashed employee is encrypted like a live one.
 * - Safe to rerun: a second run finds nothing, and each update is conditioned on the value read, so a concurrent
 *   change is not overwritten.
 * - Every plain value is kept, zero included, so nothing is lost in the move.
 */
export async function encryptPlaintextSalaries(tx: Prisma.TransactionClient, companyId: string): Promise<{ found: number; encrypted: number }> {
  const rows = await tx.$queryRaw<{ id: string; baseSalary: string }[]>`
    SELECT "id", "baseSalary"::text AS "baseSalary" FROM "employees" WHERE "companyId" = ${companyId} AND "baseSalary" IS NOT NULL`;
  let encrypted = 0;
  for (const r of rows) {
    const cipher = encryptSalary(companyId, r.id, r.baseSalary);
    encrypted += await tx.$executeRaw`
      UPDATE "employees" SET "baseSalaryCipher" = ${cipher}, "baseSalary" = NULL
       WHERE "id" = ${r.id} AND "baseSalary" = ${r.baseSalary}::numeric`;
  }
  return { found: rows.length, encrypted };
}

/** Is the plain column still there? After the second migration it is gone, and there is nothing to do. */
export async function plaintextSalaryColumnExists(client: { $queryRaw: Prisma.TransactionClient['$queryRaw'] }): Promise<boolean> {
  const r = await client.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'employees' AND column_name = 'baseSalary'`;
  return Number(r[0]?.n ?? 0) > 0;
}
