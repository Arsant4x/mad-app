-- Purchase: VAT-declaration exclusion + establishment-expense amortization metadata.
-- All defaulted/nullable → no backfill, no RLS toggle needed.
ALTER TABLE "purchases" ADD COLUMN     "amortize" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "amortizeMonths" INTEGER,
ADD COLUMN     "excludeFromVat" BOOLEAN NOT NULL DEFAULT false;
