-- ⚖️ توجيه ٢٨٧ — مسارُ توقيع المستأجر في النماذج (ق-١٦٢٠ · ق-١٦٣٣ · ق-١٦٦٨ إلى ق-١٦٧٣).
--
-- ① نسخُ النموذج والإرسالُ والمدّة على السجلّ (ق-١٦٦٩ · ق-١٦٧١) · ② صفُّ التوقيع ملحقٌ فقط، والجوالُ فيه مقنَّعٌ وبصمتُه (ق-١٦٦٨) ·
-- ③ رابطُ النموذج العامّ بصمةٌ لا نصّ، وسياسةُ قراءةٍ ضيّقة للبحث قبل معرفة المنشأة (نمطُ api_key_authentication) ·
-- ④ سجلُّ الأحداث والاعتراضُ ملحقان فقط · ⑤ صيغةُ البصمة عمودٌ في صفّ الختم (ق-١٦٧٠) · ⑥ ما أُرسل لا يُعدَّل ولا يُحذف (القاعدةُ مع البرنامج).
--
-- ⚠️ لا DML: DDL محضة (ق-٢٦٢). والأعمدةُ الجديدة فارغةٌ أو بافتراضٍ يصف ما سبق (نسخةٌ أولى · صيغةٌ ١ · بلا نفاذ).

-- ═══ ① السجلّ: النسخةُ والإرسالُ والمدّة ═══
ALTER TABLE "form_instances"
    ADD COLUMN "revisionGroupId"        TEXT,
    ADD COLUMN "revisionNo"             INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "previousRevisionId"     TEXT,
    ADD COLUMN "sentAt"                 TIMESTAMP(3),
    ADD COLUMN "signDeadline"           TIMESTAMP(3),
    ADD COLUMN "counterpartyCustomerId" TEXT,
    ADD COLUMN "nafathRequired"         BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_revision_positive" CHECK ("revisionNo" >= 1);
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_revision_chained"
    CHECK (("revisionNo" = 1 AND "previousRevisionId" IS NULL) OR ("revisionNo" > 1 AND "previousRevisionId" IS NOT NULL));
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_sent_has_deadline"
    CHECK (("sentAt" IS NULL) = ("signDeadline" IS NULL));

ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_previousRevisionId_fkey"
    FOREIGN KEY ("previousRevisionId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_instances" ADD CONSTRAINT "form_instances_companyId_previousRevisionId_fkey"
    FOREIGN KEY ("companyId", "previousRevisionId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "form_instances_companyId_status_signDeadline_idx" ON "form_instances"("companyId", "status", "signDeadline");

-- ═══ ⑤ صيغةُ البصمة ═══
ALTER TABLE "form_seals" ADD COLUMN "format" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "form_seals" ADD CONSTRAINT "form_seals_format_known" CHECK ("format" IN (1, 2));

-- ═══ ② صفُّ التوقيع ═══
CREATE TYPE "FormSignerRole" AS ENUM ('STAFF', 'COUNTERPARTY', 'SUBSTITUTE', 'REPRESENTATIVE');
CREATE TYPE "FormSignatureLevel" AS ENUM ('DRAWN_STAFF_SESSION', 'DRAWN_OTP', 'DRAWN_NAFATH', 'PAPER_WITNESSED');
CREATE TYPE "FormSignatureChannel" AS ENUM ('LINK', 'STAFF_DEVICE', 'PAPER');
CREATE TYPE "FormLinkPurpose" AS ENUM ('SIGN', 'FINAL_COPY', 'SUBSTITUTE_CONSENT');

CREATE TABLE "form_signatures" (
    "id"                TEXT NOT NULL,
    "companyId"         TEXT NOT NULL,
    "instanceId"        TEXT NOT NULL,
    "role"              "FormSignerRole" NOT NULL,
    "level"             "FormSignatureLevel" NOT NULL,
    "channel"           "FormSignatureChannel" NOT NULL,
    "signerName"        TEXT NOT NULL,
    "signerCustomerId"  TEXT,
    "signerKind"        TEXT,
    "signerUserId"      TEXT,
    "mobileMasked"      TEXT,
    "mobileIndex"       TEXT,
    "evidenceKey"       TEXT,
    "evidenceSha256"    TEXT,
    "signedContentHash" TEXT NOT NULL,
    "challengeId"       TEXT,
    "identityTxRef"     TEXT,
    "witnessUserId"     TEXT,
    "witnessUserName"   TEXT,
    "ip"                TEXT,
    "userAgent"         TEXT,
    "signedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_signatures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_signatures_content_hash_shape" CHECK ("signedContentHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "form_signatures_evidence_hash_shape" CHECK ("evidenceSha256" IS NULL OR "evidenceSha256" ~ '^[0-9a-f]{64}$'),
    -- ق-١٦٦٨: الجوالُ بصمةٌ ومقنَّعٌ معاً أو لا شيء، ولا رقمَ كاملاً (أكثرُ من ثمانية أرقامٍ متتالية يُرفض).
    CONSTRAINT "form_signatures_mobile_masked_only" CHECK (
        ("mobileIndex" IS NULL) = ("mobileMasked" IS NULL)
        AND ("mobileIndex" IS NULL OR "mobileIndex" LIKE 'b1:%')
        AND ("mobileMasked" IS NULL OR "mobileMasked" !~ '[0-9]{8,}')
    ),
    -- كلُّ مستوى بما يُثبته: الرمزُ بتحدّيه، ونفاذٌ بمعاملته، والورقيُّ بشاهده، وما سوى الورقيّ برسمه.
    CONSTRAINT "form_signatures_level_evidence" CHECK (
        ("level" <> 'DRAWN_OTP' OR "challengeId" IS NOT NULL)
        AND ("level" <> 'DRAWN_NAFATH' OR "identityTxRef" IS NOT NULL)
        AND ("level" <> 'PAPER_WITNESSED' OR ("witnessUserId" IS NOT NULL AND "channel" = 'PAPER'))
        AND ("evidenceKey" IS NOT NULL AND "evidenceSha256" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "form_signatures_companyId_id_key" ON "form_signatures"("companyId", "id");
CREATE UNIQUE INDEX "form_signatures_instanceId_role_key" ON "form_signatures"("instanceId", "role");
ALTER TABLE "form_signatures" ADD CONSTRAINT "form_signatures_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_signatures" ADD CONSTRAINT "form_signatures_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_signatures" ADD CONSTRAINT "form_signatures_companyId_instanceId_fkey"
    FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ ③ رابطُ النموذج العامّ ═══
CREATE TABLE "form_signing_links" (
    "id"               TEXT NOT NULL,
    "companyId"        TEXT NOT NULL,
    "instanceId"       TEXT NOT NULL,
    "purpose"          "FormLinkPurpose" NOT NULL,
    "recipientRole"    "FormSignerRole" NOT NULL,
    "tokenHash"        TEXT NOT NULL,
    "expiresAt"        TIMESTAMP(3),
    "revokedAt"        TIMESTAMP(3),
    "sessionHash"      TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "sessionMethod"    TEXT,
    "sessionRef"       TEXT,
    "identityTxRef"    TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_signing_links_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_signing_links_token_hash_shape" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "form_signing_links_session_hash_shape" CHECK ("sessionHash" IS NULL OR "sessionHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "form_signing_links_session_method" CHECK ("sessionMethod" IS NULL OR "sessionMethod" IN ('OTP', 'NAFATH'))
);

CREATE UNIQUE INDEX "form_signing_links_tokenHash_key" ON "form_signing_links"("tokenHash");
CREATE UNIQUE INDEX "form_signing_links_companyId_id_key" ON "form_signing_links"("companyId", "id");
CREATE INDEX "form_signing_links_companyId_instanceId_idx" ON "form_signing_links"("companyId", "instanceId");
ALTER TABLE "form_signing_links" ADD CONSTRAINT "form_signing_links_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_signing_links" ADD CONSTRAINT "form_signing_links_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_signing_links" ADD CONSTRAINT "form_signing_links_companyId_instanceId_fkey"
    FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ ④ سجلُّ الأحداث والاعتراض ═══
CREATE TABLE "form_signing_events" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "instanceId"      TEXT NOT NULL,
    "kind"            TEXT NOT NULL,
    "actor"           TEXT NOT NULL,
    "recipientMasked" TEXT,
    "note"            TEXT,
    "at"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_signing_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_signing_events_masked_only" CHECK ("recipientMasked" IS NULL OR "recipientMasked" !~ '[0-9]{8,}')
);
CREATE UNIQUE INDEX "form_signing_events_companyId_id_key" ON "form_signing_events"("companyId", "id");
CREATE INDEX "form_signing_events_companyId_instanceId_at_idx" ON "form_signing_events"("companyId", "instanceId", "at");
ALTER TABLE "form_signing_events" ADD CONSTRAINT "form_signing_events_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_signing_events" ADD CONSTRAINT "form_signing_events_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_signing_events" ADD CONSTRAINT "form_signing_events_companyId_instanceId_fkey"
    FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "form_objections" (
    "id"           TEXT NOT NULL,
    "companyId"    TEXT NOT NULL,
    "instanceId"   TEXT NOT NULL,
    "note"         TEXT NOT NULL,
    "photoKey"     TEXT,
    "photoSha256"  TEXT,
    "photoMime"    TEXT,
    "byName"       TEXT NOT NULL,
    "mobileMasked" TEXT,
    "objectedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_objections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "form_objections_note_present" CHECK (length(trim("note")) > 0),
    CONSTRAINT "form_objections_photo_paired" CHECK (("photoKey" IS NULL) = ("photoSha256" IS NULL)),
    CONSTRAINT "form_objections_masked_only" CHECK ("mobileMasked" IS NULL OR "mobileMasked" !~ '[0-9]{8,}')
);
CREATE UNIQUE INDEX "form_objections_companyId_id_key" ON "form_objections"("companyId", "id");
CREATE UNIQUE INDEX "form_objections_instanceId_key" ON "form_objections"("instanceId");
ALTER TABLE "form_objections" ADD CONSTRAINT "form_objections_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_objections" ADD CONSTRAINT "form_objections_instanceId_fkey"
    FOREIGN KEY ("instanceId") REFERENCES "form_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_objections" ADD CONSTRAINT "form_objections_companyId_instanceId_fkey"
    FOREIGN KEY ("companyId", "instanceId") REFERENCES "form_instances"("companyId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ═══ الملحقُ فقط: التوقيعُ والحدثُ والاعتراض يُكتب مرّةً ولا يُعدَّل ولا يُحذف، والوقتُ من الخادم ═══
CREATE OR REPLACE FUNCTION form_signing_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'صفُّ التوقيع والاعتراض والحدث يُكتب مرّةً ولا يُعدَّل ولا يُحذف (توجيه ٢٨٧ · ق-١٦٦٨).' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION form_signatures_stamp() RETURNS trigger AS $$
BEGIN
    NEW."signedAt" := now();
    IF EXISTS (SELECT 1 FROM "form_instances" fi WHERE fi."id" = NEW."instanceId" AND fi."status" IN ('SEALED', 'EXPIRED', 'DISPUTED', 'OBJECTED')) THEN
        RAISE EXCEPTION 'لا توقيعَ على نموذجٍ مختومٍ أو منقضٍ أو معترَضٍ عليه (توجيه ٢٨٧).' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION form_signing_events_stamp() RETURNS trigger AS $$
BEGIN
    NEW."at" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION form_objections_stamp() RETURNS trigger AS $$
BEGIN
    NEW."objectedAt" := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER form_signatures_stamp BEFORE INSERT ON "form_signatures" FOR EACH ROW EXECUTE FUNCTION form_signatures_stamp();
CREATE TRIGGER form_signatures_append_only BEFORE UPDATE OR DELETE ON "form_signatures" FOR EACH ROW EXECUTE FUNCTION form_signing_append_only();
CREATE TRIGGER form_signing_events_stamp BEFORE INSERT ON "form_signing_events" FOR EACH ROW EXECUTE FUNCTION form_signing_events_stamp();
CREATE TRIGGER form_signing_events_append_only BEFORE UPDATE OR DELETE ON "form_signing_events" FOR EACH ROW EXECUTE FUNCTION form_signing_append_only();
CREATE TRIGGER form_objections_stamp BEFORE INSERT ON "form_objections" FOR EACH ROW EXECUTE FUNCTION form_objections_stamp();
CREATE TRIGGER form_objections_append_only BEFORE UPDATE OR DELETE ON "form_objections" FOR EACH ROW EXECUTE FUNCTION form_signing_append_only();

-- ═══ ⑥ ما أُرسل لا يُعدَّل ولا يُحذف؛ والمختومُ والمنقضي والخلافُ نهائيّة؛ ولا عودةَ إلى المسوّدة ═══
CREATE OR REPLACE FUNCTION form_instances_sealed_guard() RETURNS trigger AS $$
BEGIN
    IF OLD."status" = 'SEALED' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'السجلُّ المختوم لا يُحذف، والتصحيحُ بنموذجٍ تصحيحيّ (ق-١٦٣٥).' USING ERRCODE = 'restrict_violation';
        END IF;
        RAISE EXCEPTION 'السجلُّ المختوم لا يُعدَّل (ق-١٦٣٥).' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        IF OLD."status" <> 'DRAFT' THEN
            RAISE EXCEPTION 'النموذجُ المرسَل لا يُحذف (توجيه ٢٨٧).' USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD."status" IN ('EXPIRED', 'DISPUTED') THEN
        RAISE EXCEPTION 'النموذجُ المنقضي والخلافُ القائم لا يُعدَّلان (توجيه ٢٨٧).' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD."status" <> 'DRAFT' THEN
        IF NEW."status" = 'DRAFT' THEN
            RAISE EXCEPTION 'لا عودةَ إلى المسوّدة بعد الإرسال؛ التعديلُ نسخةٌ جديدة (ق-١٦٦٩).' USING ERRCODE = 'restrict_violation';
        END IF;
        IF NEW."templateVersionId" IS DISTINCT FROM OLD."templateVersionId"
           OR NEW."linkedEntityType" IS DISTINCT FROM OLD."linkedEntityType"
           OR NEW."linkedEntityId" IS DISTINCT FROM OLD."linkedEntityId"
           OR NEW."formDate" IS DISTINCT FROM OLD."formDate"
           OR NEW."filledById" IS DISTINCT FROM OLD."filledById"
           OR NEW."filledByName" IS DISTINCT FROM OLD."filledByName"
           OR NEW."revisionGroupId" IS DISTINCT FROM OLD."revisionGroupId"
           OR NEW."revisionNo" IS DISTINCT FROM OLD."revisionNo"
           OR NEW."previousRevisionId" IS DISTINCT FROM OLD."previousRevisionId"
           OR NEW."sentAt" IS DISTINCT FROM OLD."sentAt"
           OR NEW."signDeadline" IS DISTINCT FROM OLD."signDeadline"
           OR NEW."counterpartyCustomerId" IS DISTINCT FROM OLD."counterpartyCustomerId"
           OR NEW."nafathRequired" IS DISTINCT FROM OLD."nafathRequired" THEN
            RAISE EXCEPTION 'النموذجُ المرسَل لا يُعدَّل؛ التعديلُ نسخةٌ جديدة (ق-١٦٦٩).' USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;
    IF NEW."status" = 'SEALED' AND NOT EXISTS (SELECT 1 FROM "form_seals" fs WHERE fs."instanceId" = NEW."id") THEN
        RAISE EXCEPTION 'لا يُختم السجلُّ بلا ختمٍ مكتوب (ق-١٦٣٦).' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- وقيمُ ما أُرسل كقيم المختوم: لا تُكتب ولا تُعدَّل ولا تُحذف تحت سجلٍّ غيرِ مسوّدة.
CREATE OR REPLACE FUNCTION form_values_sealed_guard() RETURNS trigger AS $$
DECLARE
    locked_parent boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM "form_instances" fi
         WHERE fi."status" <> 'DRAFT'
           AND fi."id" IN (
               CASE WHEN TG_OP <> 'INSERT' THEN OLD."instanceId" END,
               CASE WHEN TG_OP <> 'DELETE' THEN NEW."instanceId" END
           )
    ) INTO locked_parent;
    IF locked_parent THEN
        RAISE EXCEPTION 'قيمُ السجلّ المرسَل أو المختوم لا تُكتب ولا تُعدَّل ولا تُحذف (ق-١٦٣٥ · ق-١٦٦٩).' USING ERRCODE = 'restrict_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══ عزلُ المستأجر — ENABLE وFORCE معاً ═══
ALTER TABLE "form_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_signatures" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_signatures ON "form_signatures"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "form_signing_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_signing_links" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_signing_links ON "form_signing_links"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
-- 🔴 مسندُ البحث عن الرابط — قراءةٌ فقط، ومسارٌ واحد، على نمط api_key_authentication (ق-١٢٩١): الرابطُ يُقدَّم قبل أن تُعرف منشأتُه،
-- فالسياقُ هو ما نبحث عنه. وحدودُه: FOR SELECT فلا يُكتب به شيء · و app.form_link_lookup تضبطه معاملةٌ واحدة (runAsFormLinkLookup)
-- لا يستدعيها إلا مسارُ الرابط العامّ · والبحثُ ببصمة الرمز الفريدة فلا يُعيد إلا صفّاً واحداً، وكلُّ ما بعده في سياق منشأة الرابط.
CREATE POLICY form_signing_link_lookup ON "form_signing_links"
    FOR SELECT
    USING (current_setting('app.form_link_lookup', true) = 'true');

ALTER TABLE "form_signing_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_signing_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_signing_events ON "form_signing_events"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));

ALTER TABLE "form_objections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "form_objections" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_form_objections ON "form_objections"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
