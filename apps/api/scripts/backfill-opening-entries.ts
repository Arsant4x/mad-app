/**
 * Backfill: opening balances → real قيود افتتاحية (closes the CLAUDE.md 3.8
 * debt for existing databases).
 *
 * Before the opening-entries change, an account's openingBalance was seeded
 * straight into its running `balance` with no journal entry behind it. This
 * script posts the missing قيد افتتاحي (counterpart: 3900 الأرصدة الافتتاحية)
 * for every such account, per company, WITHOUT changing the account's balance
 * — it was already right; only the ledger and 3900 gain the posting. See
 * backfillCompanyOpeningEntries for the exact mechanics.
 *
 * Idempotent: accounts that already have an opening entry (marked via
 * JournalEntry.openingForAccountId) are skipped, so re-running adds nothing.
 * A company whose fiscal-year-start period is closed fails with the standard
 * closed-period message and is reported — reopen the period, run again.
 *
 * Run from apps/api:  npx ts-node scripts/backfill-opening-entries.ts
 */
import { PrismaClient } from '@prisma/client';
import { backfillCompanyOpeningEntries } from '../src/journal/opening-balance.util';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, orgName: true } });
  console.log(`فحص ${companies.length} منشأة...`);

  let failures = 0;
  for (const company of companies) {
    try {
      const posted = await prisma.$transaction(
        async (tx) => {
          // Same set_config pattern as seed.ts — the raw client has no tenant
          // extension, so RLS is satisfied per-transaction.
          await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true)`;
          return backfillCompanyOpeningEntries(tx, company.id);
        },
        { timeout: 120_000 },
      );
      if (posted.length) {
        console.log(`✔ ${company.orgName}: رُحِّل ${posted.length} قيد افتتاحي`);
        for (const p of posted) console.log(`    ${p.code} ${p.name}: ${p.amount}`);
      } else {
        console.log(`— ${company.orgName}: لا شيء يحتاج ترحيلاً`);
      }
    } catch (e) {
      failures += 1;
      console.error(`✘ ${company.orgName}: ${(e as Error & { response?: { message?: string } }).response?.message ?? (e as Error).message}`);
    }
  }

  if (failures) {
    console.error(`اكتمل مع ${failures} منشأة فاشلة — عالج السبب وأعد التشغيل (السكربت آمن للإعادة).`);
    process.exitCode = 1;
  } else {
    console.log('اكتمل الترحيل بنجاح.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
