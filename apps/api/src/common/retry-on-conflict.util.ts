import { Prisma } from '@prisma/client';

/**
 * Retries `fn` (a full `runInTenantContext` call — a fresh transaction each
 * time) when it fails on a unique-constraint violation (P2002). Used for
 * count()-then-insert numbering schemes (invoice/purchase "no"): under
 * concurrent creates for the same company, two transactions can compute the
 * same next number, and the loser's INSERT fails on `@@unique([companyId,
 * no])`. A retry re-reads the count, which by then reflects the winner's
 * commit, so it converges instead of surfacing a raw 500.
 */
export async function retryOnUniqueConflict<T>(fn: () => Promise<T>, attempts = 8): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const isLastAttempt = i === attempts - 1;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && !isLastAttempt) {
        // Random jitter, not a fixed delay: without it, two callers that
        // collided once tend to stay in lockstep (both re-read count() at
        // the same relative offset and collide again on every retry).
        await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 40));
        continue;
      }
      throw e;
    }
  }
  /* istanbul ignore next — unreachable: the loop always returns or throws */
  throw new Error('retryOnUniqueConflict: unreachable');
}
