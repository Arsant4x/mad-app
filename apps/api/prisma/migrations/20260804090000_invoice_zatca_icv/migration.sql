-- Invoice Counter Value: the invoice's position in the company's ZATCA
-- submission sequence.
--
-- Nullable with no backfill on purpose. ICV counts *submitted* invoices, and
-- no invoice in any company has been submitted yet (zatcaHash is null
-- everywhere), so there is no sequence to reconstruct. Inventing numbers for
-- historical rows would fabricate a chain the authority never saw.
ALTER TABLE "invoices" ADD COLUMN "zatcaIcv" INTEGER;
