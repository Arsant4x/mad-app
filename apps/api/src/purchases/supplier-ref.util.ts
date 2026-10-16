import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * A supplier invoice is recorded once per company and supplier: another active purchase of the same
 * supplier with the same number, compared without case or surrounding spaces, is refused with a named
 * 409. The partial unique index purchases_supplier_ref_key holds the same rule when two writes race.
 */
export async function assertSupplierRefFree(
  tx: Prisma.TransactionClient,
  args: { companyId: string; supplierId: string; supplierRef: string | null | undefined; exceptPurchaseId?: string },
): Promise<void> {
  const ref = args.supplierRef?.trim();
  if (!ref) return;
  const taken = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "purchases"
    WHERE "companyId" = ${args.companyId}
      AND "supplierId" = ${args.supplierId}
      AND "docType" = 'PURCHASE'
      AND "voidedAt" IS NULL
      AND lower(btrim("supplierRef")) = lower(btrim(${ref}))
      AND "id" <> ${args.exceptPurchaseId ?? ''}
    LIMIT 1`;
  if (taken.length > 0) throw new ConflictException(formatMessage(MSG.purchase_supplier_ref_taken, { ref }));
}

/** The index refused a write that changes nothing else unique on the row: the same named 409, not a 500. */
export function asSupplierRefConflict(e: unknown, supplierRef: string | null | undefined): unknown {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new ConflictException(formatMessage(MSG.purchase_supplier_ref_taken, { ref: supplierRef?.trim() ?? '' }));
  }
  return e;
}
