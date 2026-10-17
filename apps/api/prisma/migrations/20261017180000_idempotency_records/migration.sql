-- Idempotency keys of create requests on the document and posting routes, each with the document it wrote.
--
-- A row is written in the transaction that writes the document, so the key and its document stand or fall together. The
-- unique key per company makes a parallel request with the same key wait and then find the first one's row. The table is
-- created empty: nothing is written, so there is nothing to count or announce.

CREATE TABLE "idempotency_records" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "key"         TEXT NOT NULL,
    "scope"       TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "resourceId"  TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_companyId_key_key" ON "idempotency_records"("companyId", "key");

ALTER TABLE "idempotency_records"
    ADD CONSTRAINT "idempotency_records_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tenant isolation, the second layer.
ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_idempotency_records ON "idempotency_records"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
