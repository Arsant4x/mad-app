-- A signed ZATCA document keeps the type it was signed with (standard or simplified) and the seven digit transaction
-- code (KSA-2) its signed XML carries. The send path used to derive the type from the buyer's current card, so a buyer
-- that gained a VAT number after signing sent a signed simplified invoice to clearance.

-- CreateEnum
CREATE TYPE "ZatcaInvoiceType" AS ENUM ('STANDARD', 'SIMPLIFIED');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "zatcaInvoiceType" "ZatcaInvoiceType",
ADD COLUMN "zatcaTransactionCode" TEXT;

-- Both or neither, and the code's first two digits name the same type: 01 standard, 02 simplified (BR-KSA-06).
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_zatca_type_matches_code" CHECK (
  ("zatcaInvoiceType" IS NULL AND "zatcaTransactionCode" IS NULL)
  OR ("zatcaInvoiceType" = 'STANDARD' AND "zatcaTransactionCode" ~ '^01[01]{5}$')
  OR ("zatcaInvoiceType" = 'SIMPLIFIED' AND "zatcaTransactionCode" ~ '^02[01]{5}$')
);

-- Documents signed before this column take the type their signed XML carries. A signed XML without a readable code
-- keeps both columns empty, is counted here and is refused at send rather than sent on a guessed path.
-- The table is under FORCE, which shows the migration role nothing without a company context; FORCE is lifted for the
-- backfill and restored.
ALTER TABLE "invoices" NO FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  n_pending integer;
  n_filled integer;
BEGIN
  SELECT count(*) INTO n_pending FROM "invoices" WHERE "zatcaSignedXml" IS NOT NULL AND "zatcaInvoiceType" IS NULL;
  IF n_pending = 0 THEN
    RETURN;
  END IF;

  UPDATE "invoices"
  SET "zatcaTransactionCode" = substring("zatcaSignedXml" from '<cbc:InvoiceTypeCode name="(0[12][01]{5})"'),
      "zatcaInvoiceType" = CASE
        WHEN substring("zatcaSignedXml" from '<cbc:InvoiceTypeCode name="(0[12])[01]{5}"') = '01' THEN 'STANDARD'::"ZatcaInvoiceType"
        ELSE 'SIMPLIFIED'::"ZatcaInvoiceType"
      END
  WHERE "zatcaSignedXml" IS NOT NULL
    AND "zatcaInvoiceType" IS NULL
    AND "zatcaSignedXml" ~ '<cbc:InvoiceTypeCode name="0[12][01]{5}"';
  GET DIAGNOSTICS n_filled = ROW_COUNT;

  RAISE WARNING 'invoices: % signed documents took their ZATCA type from their signed XML; % carry no readable transaction code and are refused at send',
    n_filled, n_pending - n_filled;
END $$;

ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;
