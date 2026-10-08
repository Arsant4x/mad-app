-- ⚖️ توجيه ٢٨٧ ⑤ و⑥ و⑦ — من يوقّع عن الطرف (الممثّلُ والبديل)، وسندُ الممثّل على صفّ التوقيع، ورابطُ جهاز الموظّف.
--
-- ⚠️ لا DML: DDL محضة (ق-٢٦٢)، والأعمدةُ الجديدة فارغةٌ أو بافتراضٍ يصف ما سبق (رابطٌ ليس على جهاز الموظّف).

ALTER TABLE "form_signatures"
    ADD COLUMN "authorityType"           TEXT,
    ADD COLUMN "authorityRef"            TEXT,
    ADD COLUMN "authorityEvidenceKey"    TEXT,
    ADD COLUMN "authorityEvidenceSha256" TEXT,
    ADD COLUMN "authorityVerification"   TEXT;
-- السندُ للممثّل وحدَه، ونوعُه ورقمُه معاً (القرار ١٦٣٥ ②: «حقلان إلزاميان»).
ALTER TABLE "form_signatures" ADD CONSTRAINT "form_signatures_authority_for_representative" CHECK (
    ("role" = 'REPRESENTATIVE') = ("authorityType" IS NOT NULL)
    AND ("authorityType" IS NULL OR ("authorityType" IN ('CR_MANAGER', 'NAJIZ_POA') AND length(trim("authorityRef")) > 0))
    AND ("authorityVerification" IS NULL OR "authorityVerification" IN ('VERIFIED', 'UNVERIFIED'))
);

ALTER TABLE "form_signing_links" ADD COLUMN "staffDevice" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "form_signer_designations" (
    "id"                      TEXT NOT NULL,
    "companyId"               TEXT NOT NULL,
    "instanceId"              TEXT NOT NULL,
    "groupId"                 TEXT NOT NULL,
    "role"                    "FormSignerRole" NOT NULL,
    "name"                    TEXT NOT NULL,
    "mobileCipher"            TEXT NOT NULL,
    "mobileMasked"            TEXT NOT NULL,
    "mobileIndex"             TEXT NOT NULL,
    "nationalIdCipher"        TEXT,
    "nationalIdIndex"         TEXT,
    "authorityType"           TEXT,
    "authorityRef"            TEXT,
    "authorityEvidenceKey"    TEXT,
    "authorityEvidenceSha256" TEXT,
    "authorityVerification"   TEXT,
    "status"                  TEXT NOT NULL,
    "createdAt"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt"               TIMESTAMP(3),
    CONSTRAINT "form_signer_designations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_signer_designations_role" CHECK ("role" IN ('REPRESENTATIVE', 'SUBSTITUTE')),
    CONSTRAINT "form_signer_designations_status" CHECK ("status" IN ('ACTIVE', 'REPLACED', 'PENDING_CONSENT', 'APPROVED', 'REJECTED')),
    -- الجوالُ مشفَّرٌ يُفكّ (f1) ومقنَّعٌ وبصمتُه، ولا رقمَ كاملاً صريحاً.
    CONSTRAINT "form_signer_designations_mobile_sealed" CHECK (
        "mobileCipher" LIKE 'f1:%' AND "mobileIndex" LIKE 'b1:%' AND "mobileMasked" !~ '[0-9]{8,}'
    ),
    CONSTRAINT "form_signer_designations_id_paired" CHECK (("nationalIdCipher" IS NULL) = ("nationalIdIndex" IS NULL)),
    CONSTRAINT "form_signer_designations_authority" CHECK (
        ("role" = 'REPRESENTATIVE') = ("authorityType" IS NOT NULL)
        AND ("authorityType" IS NULL OR ("authorityType" IN ('CR_MANAGER', 'NAJIZ_POA') AND length(trim("authorityRef")) > 0))
    )
);
CREATE UNIQUE INDEX "form_signer_designations_companyId_id_key" ON "form_signer_designations"("companyId", "id");
CREATE INDEX "form_signer_designations_companyId_groupId_role_idx" ON "form_signer_designations"("companyId", "groupId", "role");
ALTER TABLE "form_signer_designations" ADD CONSTRAINT "form_signer_designations_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_signer_designations" ADD CONSTRAINT "form_signer_designations_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_signer_designations" ADD CONSTRAINT "form_signer_designations_companyId_instanceId_fkey"
    FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ عزلُ المستأجر — ENABLE وFORCE معاً ═══
ALTER TABLE "form_signer_designations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_signer_designations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_signer_designations ON "form_signer_designations"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
