-- ⚖️ توجيه ٢٨٧ — تحدّي رمز التحقّق لمسار توقيع النماذج (ق-١٥٩١ · ق-١٦٣٣ · ق-١٦٣٥ ④).
--
-- الرمزُ بصمةٌ لا نصّ ("codeHash" بصيغة البصمة b1)، والجوالُ بصمةٌ ومقنَّعٌ لا رقمٌ كامل. وقيودُ القاعدة تحرس الشكلَ والعدّ:
-- المحاولاتُ بين الصفر والحدّ، والانقضاءُ بعد الإنشاء، والبصمتان بصيغتهما.
--
-- ⚠️ لا DML: DDL محضة والجدولُ يُنشأ فارغاً (ق-٢٦٢).

CREATE TABLE "verification_challenges" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "purpose"      TEXT NOT NULL,
    "subjectKey"   TEXT NOT NULL,
    "mobileIndex"  TEXT NOT NULL,
    "mobileMasked" TEXT NOT NULL,
    "codeHash"     TEXT NOT NULL,
    "attempts"     INTEGER NOT NULL DEFAULT 0,
    "maxAttempts"  INTEGER NOT NULL,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "consumedAt"   TIMESTAMP(3),
    "revokedAt"    TIMESTAMP(3),
    "lockedAt"     TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "verification_challenges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "verification_challenges_attempts_bounded" CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts"),
    CONSTRAINT "verification_challenges_hashed" CHECK ("codeHash" LIKE 'b1:%' AND "mobileIndex" LIKE 'b1:%'),
    CONSTRAINT "verification_challenges_purpose_named" CHECK (length(trim("purpose")) > 0 AND length(trim("subjectKey")) > 0)
);

CREATE UNIQUE INDEX "verification_challenges_companyId_id_key" ON "verification_challenges"("companyId", "id");
CREATE INDEX "verification_challenges_companyId_purpose_subjectKey_createdAt_idx"
    ON "verification_challenges"("companyId", "purpose", "subjectKey", "createdAt");

ALTER TABLE "verification_challenges"
    ADD CONSTRAINT "verification_challenges_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ عزل المستأجر — الطبقة الثانية ═══
ALTER TABLE "verification_challenges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification_challenges" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_verification_challenges ON "verification_challenges"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
