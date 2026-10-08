-- ⚖️ توجيه ٢٨٦ (البند ٨) — المرحلةُ الثانية: يُسقط عمودُ المعرّف البديل الصريح (`customers.otherId`) بعد أن شفّره السكربت.
--
-- ⛔ **حارسٌ قبل الإسقاط، وصاخب**: إن بقي في العمود رقمٌ واحد تسقط هذه الهجرةُ بـEXCEPTION **قبل أن تكتب شيئاً** — فلا يُسقط
-- عمودٌ قبل أن تُنقل بياناتُه، ولا يقلع إصدارٌ يجهل الصريحَ على قاعدةٍ تحمله. والمخرجُ مسارُ (ج) في DEPLOY.md §6:
--   ١) `docker compose -f docker-compose.prod.yml --env-file .env.production run --rm --no-deps api node dist/scripts/backfill-customer-id-encryption.js`
--   ٢) `… run --rm --no-deps api prisma migrate resolve --rolled-back 20261008120000_customer_id_plaintext_dropped`
--   ٣) `./deploy.sh` ثانيةً.
--
-- **والحارسُ كتلةٌ واحدة** (`DO`) أوّلَ الملفّ عمداً — يقرؤها الاختبارُ الحيّ (`test/customer-identity.e2e-spec.ts` ⑦) فيُشغّلها
-- على صفٍّ صريحٍ في معاملةٍ تُرجَع ويرى أنها ترفض، وعلى قاعدةٍ بلا صريحٍ فيرى أنها تمرّ.
-- الجدولُ تحت FORCE والهجرةُ بدور التطبيق (ق-٢٦٢): يُرفع FORCE للعدّ ثم يُعاد؛ والقفلُ الذي يأخذه `ALTER TABLE` يبقى حتى آخر
-- المعاملة، فلا يُكتب صفٌّ صريحٌ بين العدّ والإسقاط.

DO $$
DECLARE
  n_plain integer;
BEGIN
  ALTER TABLE "customers" NO FORCE ROW LEVEL SECURITY;
  SELECT count(*) INTO n_plain FROM "customers" WHERE "otherId" IS NOT NULL;
  ALTER TABLE "customers" FORCE ROW LEVEL SECURITY;
  IF n_plain > 0 THEN
    RAISE EXCEPTION 'توجيه ٢٨٦: % عميلاً ما زال يحمل معرّفاً بديلاً صريحاً — شغّل scripts/backfill-customer-id-encryption.ts ثم migrate resolve --rolled-back 20261008120000_customer_id_plaintext_dropped ثم أعد النشر (DEPLOY.md §6). لا يُسقط عمودٌ قبل أن تُنقل بياناتُه',
      n_plain;
  END IF;
  RAISE WARNING 'توجيه ٢٨٦: % عميلاً يحمل معرّفاً بديلاً صريحاً — يُسقط العمودُ الصريح، والأرقامُ مشفَّرةٌ في otherIdCipher', n_plain;
END $$;

ALTER TABLE "customers" DROP CONSTRAINT "customers_other_id_alnum";
ALTER TABLE "customers" DROP CONSTRAINT "customers_other_id_pair_transition";
ALTER TABLE "customers" DROP COLUMN "otherId";

-- الزوجُ بعد الإسقاط: المخطّطُ والنصُّ المشفَّرُ معاً أو لا شيء (كان المخطّطَ والصريحَ — `customers_other_id_pair`).
ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_pair" CHECK (("otherIdScheme" IS NULL) = ("otherIdCipher" IS NULL));
