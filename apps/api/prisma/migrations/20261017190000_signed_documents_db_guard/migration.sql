-- A signed invoice, its lines and a posted journal entry are refused change in the database, not only in the services.
--
-- The services refuse editing an issued invoice and never update a journal line or a posted entry's numbers, but a raw
-- statement reaches the tables without them. These triggers stand where every path meets, in the style of the append
-- only logs (delegation_logs, task_logs, audit_logs).
--
-- What stays writable on a signed invoice is what the code writes after signing, read from every update of invoices:
-- the authority's answer (zatcaStatus, zatcaSubmittedAt, zatcaMessage, zatcaClearedXml, zatcaWarnings), the payment
-- status, the reversal entry of a rejected invoice closed by a replacement, and the operational links (branch, cash
-- shift, payment method, offline incident, notes). Everything the signed document or its posting carries is fixed.
--
-- Deleting journal entries is not refused here: the opening balance edit, the account delete and the test cleanup still
-- remove posted entries by design. A deleted company takes its rows with it as before, so a line guard lets a cascade
-- through once the company row is gone.
--
-- A later data migration that must touch these rows lifts the trigger by name for its own statement and restores it.
--
-- No data is written, so nothing is counted or announced.

CREATE OR REPLACE FUNCTION invoices_signed_guard() RETURNS trigger AS $$
BEGIN
    IF OLD."zatcaHash" IS NULL THEN
        RETURN NEW;
    END IF;
    IF (NEW."companyId", NEW."no", NEW."docType", NEW."customerId", NEW."issueDate", NEW."dueDate",
        NEW."currency", NEW."exchangeRate", NEW."subtotal", NEW."taxTotal", NEW."total",
        NEW."baseSubtotal", NEW."baseTaxTotal", NEW."baseTotal",
        NEW."relatedInvoiceId", NEW."replacesInvoiceId", NEW."adjustmentReason", NEW."adjustmentEventDate",
        NEW."journalEntryId", NEW."egsUnitId", NEW."zatcaUuid", NEW."zatcaHash", NEW."zatcaPreviousHash", NEW."zatcaIcv",
        NEW."zatcaSignedXml", NEW."zatcaInvoiceType", NEW."zatcaTransactionCode", NEW."zatcaQrPayload",
        NEW."zatcaStampedAt", NEW."issuedAt", NEW."issuedOffsetMin")
       IS DISTINCT FROM
       (OLD."companyId", OLD."no", OLD."docType", OLD."customerId", OLD."issueDate", OLD."dueDate",
        OLD."currency", OLD."exchangeRate", OLD."subtotal", OLD."taxTotal", OLD."total",
        OLD."baseSubtotal", OLD."baseTaxTotal", OLD."baseTotal",
        OLD."relatedInvoiceId", OLD."replacesInvoiceId", OLD."adjustmentReason", OLD."adjustmentEventDate",
        OLD."journalEntryId", OLD."egsUnitId", OLD."zatcaUuid", OLD."zatcaHash", OLD."zatcaPreviousHash", OLD."zatcaIcv",
        OLD."zatcaSignedXml", OLD."zatcaInvoiceType", OLD."zatcaTransactionCode", OLD."zatcaQrPayload",
        OLD."zatcaStampedAt", OLD."issuedAt", OLD."issuedOffsetMin")
    THEN
        RAISE EXCEPTION 'a signed invoice cannot change: correct it with a credit or debit note (invoice %)', OLD."no";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_signed_guard
    BEFORE UPDATE ON "invoices"
    FOR EACH ROW EXECUTE FUNCTION invoices_signed_guard();

CREATE OR REPLACE FUNCTION invoice_lines_signed_guard() RETURNS trigger AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE')
       AND EXISTS (SELECT 1 FROM "companies" WHERE "id" = OLD."companyId")
       AND EXISTS (SELECT 1 FROM "invoices" WHERE "id" = OLD."invoiceId" AND "zatcaHash" IS NOT NULL) THEN
        RAISE EXCEPTION 'a line of a signed invoice cannot change or be removed';
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND EXISTS (SELECT 1 FROM "invoices" WHERE "id" = NEW."invoiceId" AND "zatcaHash" IS NOT NULL) THEN
        RAISE EXCEPTION 'a line cannot be added to a signed invoice';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoice_lines_signed_guard
    BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines"
    FOR EACH ROW EXECUTE FUNCTION invoice_lines_signed_guard();

CREATE OR REPLACE FUNCTION journal_lines_posted_guard() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'a posted journal line cannot change: post a reversing entry';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_lines_posted_guard
    BEFORE UPDATE ON "journal_lines"
    FOR EACH ROW EXECUTE FUNCTION journal_lines_posted_guard();

-- The memo and the branch (set to null when a branch is deleted) stay writable; the numbers, the date and the links that
-- give an entry its meaning do not.
CREATE OR REPLACE FUNCTION journal_entries_posted_guard() RETURNS trigger AS $$
BEGIN
    IF (NEW."companyId", NEW."no", NEW."date", NEW."totalDebit", NEW."totalCredit", NEW."currency", NEW."exchangeRate",
        NEW."baseTotalDebit", NEW."baseTotalCredit", NEW."auto", NEW."openingForAccountId", NEW."reversalOfId",
        NEW."closingForFiscalYearId")
       IS DISTINCT FROM
       (OLD."companyId", OLD."no", OLD."date", OLD."totalDebit", OLD."totalCredit", OLD."currency", OLD."exchangeRate",
        OLD."baseTotalDebit", OLD."baseTotalCredit", OLD."auto", OLD."openingForAccountId", OLD."reversalOfId",
        OLD."closingForFiscalYearId")
    THEN
        RAISE EXCEPTION 'a posted journal entry cannot change: post a reversing entry (entry %)', OLD."no";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER journal_entries_posted_guard
    BEFORE UPDATE ON "journal_entries"
    FOR EACH ROW EXECUTE FUNCTION journal_entries_posted_guard();
