import type { PrismaClient } from '@mad-app/db';

/** How long a test company's subscription runs: long enough that no suite reaches its end. */
export const TEST_SUBSCRIPTION_DAYS = 365;

/**
 * Test only: gives a test company a paid-up subscription. A company is born read only, with no free
 * trial, so a suite that writes calls this on the company it registered. It writes from the test
 * process through the same Prisma client the app uses; the running API has no route that does this.
 */
export async function grantTestSubscription(db: Pick<PrismaClient, 'company'>, companyId: string): Promise<void> {
  const subEnd = new Date(Date.now() + TEST_SUBSCRIPTION_DAYS * 86_400_000);
  await db.company.update({ where: { id: companyId }, data: { subEnd, status: 'ACTIVE', frozenAt: null } });
}

// The browser suite runs against a separate API process, so its setup calls this file as a command:
//   ts-node test/test-subscription.ts <companyId>   (from apps/api, with DATABASE_URL set)
if (require.main === module) {
  const companyId = process.argv[2];
  if (!companyId) throw new Error('usage: ts-node test/test-subscription.ts <companyId>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set: the test subscription is written straight to the database');
  const { PrismaClient: Client } = require('@mad-app/db') as typeof import('@mad-app/db');
  const db = new Client();
  grantTestSubscription(db, companyId)
    .finally(() => db.$disconnect())
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
