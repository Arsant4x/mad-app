-- One DUE tax point per installment, as a second layer under the installment row lock taken before billing.
--
-- Rows written before this migration are left out of the index: until the tax treatment of a posted contract was
-- locked, changing it added a second DUE row for the difference, and those rows stay as they were posted. The cut-off
-- is taken at run time with clock_timestamp (UTC, as Prisma writes createdAt) and written into the index predicate.
-- Nothing is written to any row.

DO $$
DECLARE
  cutover timestamp := (clock_timestamp() AT TIME ZONE 'UTC');
BEGIN
  EXECUTE format(
    'CREATE UNIQUE INDEX "rent_accruals_one_due_point" ON "rent_accruals" ("installmentId") WHERE "kind" = ''DUE'' AND "createdAt" >= %L',
    cutover
  );
END $$;
