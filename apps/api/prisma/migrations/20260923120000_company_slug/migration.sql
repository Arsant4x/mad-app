-- معرّفُ النطاق الفرعيّ لا يُعاد استعمالُه (ق-١٣٠٣ · ك/⑬A2).

ALTER TABLE "companies" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- 🔴 **الشكلُ في القاعدة لا في التحقّق وحدَه**: تحقّقُ الطلب يُتخطّى بمسارٍ لا يمرّ به
-- (بذرةٌ · سكربتٌ · ترحيلٌ لاحق)، والقيدُ لا يُتخطّى. ثلاثةُ أحرفٍ فأكثر وأربعون فأقلّ،
-- حروفٌ صغيرةٌ وأرقامٌ وشرطة، ولا تبدأ بشرطةٍ ولا تنتهي بها.
ALTER TABLE "companies" ADD CONSTRAINT "companies_slug_format"
  CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

CREATE TABLE "reserved_slugs" (
  "slug" TEXT NOT NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reserved_slugs_pkey" PRIMARY KEY ("slug")
);

-- محجوزاتُ المنصّة: أسماءٌ لو أخذها تاجرٌ لأربكت التوجيهَ أو انتحلت المنصّة.
-- (كتابةُ بيانات ⇒ تُعلَن — ق-٦٩١.)
INSERT INTO "reserved_slugs" ("slug") VALUES
  ('www'), ('api'), ('app'), ('admin'), ('mail'), ('smtp'), ('imap'), ('pop'),
  ('ftp'), ('cdn'), ('static'), ('assets'), ('files'), ('docs'), ('status'),
  ('support'), ('help'), ('billing'), ('pay'), ('payments'), ('auth'), ('login'),
  ('account'), ('accounts'), ('dashboard'), ('console'), ('test'), ('staging'),
  ('dev'), ('demo'), ('rikz'), ('rikzapp'), ('mad'), ('madapp'), ('ns1'), ('ns2')
ON CONFLICT ("slug") DO NOTHING;

DO $$
DECLARE reserved_count INT; company_count INT;
BEGIN
  SELECT count(*) INTO reserved_count FROM "reserved_slugs";
  SELECT count(*) INTO company_count FROM "companies";
  RAISE WARNING 'ك/⑬A2: حُجزت % معرّفاً للمنصّة، و% منشأةً قائمةً بلا معرّفٍ فرعيّ (null) — تختاره بنفسها ولا يُخمَّن لها.',
    reserved_count, company_count;
END $$;
