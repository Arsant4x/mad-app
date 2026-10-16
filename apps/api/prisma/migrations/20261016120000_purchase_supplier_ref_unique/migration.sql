-- A supplier invoice is recorded once: one active purchase per supplier and supplier invoice
-- number, compared without case or surrounding spaces. Voided purchases, purchases without a
-- number and supplier notes are outside the index. The service refuses the same case first with
-- a named 409; the index holds when two requests race or a write bypasses the service.
--
-- Existing duplicates are counted before the index is built. If there are any, the migration
-- stops with their count and the way out instead of failing on a bare index error.
-- The table is under FORCE row level security and migrations run as the application role, so
-- FORCE is lifted for the count and restored: under FORCE the count would see no rows at all.
--
-- No data is written here.

DO $$
DECLARE
  n_numbers integer;
  n_purchases integer;
BEGIN
  ALTER TABLE "purchases" NO FORCE ROW LEVEL SECURITY;
  SELECT count(*), coalesce(sum(d.n), 0) INTO n_numbers, n_purchases
  FROM (
    SELECT count(*) AS n
    FROM "purchases"
    WHERE "docType" = 'PURCHASE' AND "voidedAt" IS NULL AND "supplierRef" IS NOT NULL AND btrim("supplierRef") <> ''
    GROUP BY "companyId", "supplierId", lower(btrim("supplierRef"))
    HAVING count(*) > 1
  ) d;
  ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY;
  IF n_numbers > 0 THEN
    RAISE EXCEPTION 'Found % supplier invoice number(s) recorded on more than one active purchase of the same supplier (% purchases). Void the extra purchases or correct their supplier reference, then run prisma migrate resolve --rolled-back 20261016120000_purchase_supplier_ref_unique and deploy again',
      n_numbers, n_purchases;
  END IF;
END $$;

CREATE UNIQUE INDEX "purchases_supplier_ref_key" ON "purchases" ("companyId", "supplierId", lower(btrim("supplierRef")))
  WHERE "docType" = 'PURCHASE' AND "voidedAt" IS NULL AND "supplierRef" IS NOT NULL AND btrim("supplierRef") <> '';
