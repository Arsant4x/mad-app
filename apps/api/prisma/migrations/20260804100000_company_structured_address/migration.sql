-- ZATCA's cac:PostalAddress wants the address in parts, not as one line.
--
-- No backfill from the existing free-text `address`: splitting "طريق الملك فهد،
-- العليا، الرياض" into street/district/city by guesswork would put wrong data
-- on a tax document. Merchants fill these in on the company profile screen;
-- `address` stays as the display line.
ALTER TABLE "companies"
  ADD COLUMN "street" TEXT,
  ADD COLUMN "buildingNumber" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "postalCode" TEXT;
