-- ⚖️ ق-١٥٨٣ (توجيه ٢٧٥، بحكم صاحب المشروع) — «وإعادةُ فتح الفترة بسببٍ مكتوبٍ يُسجَّل».
--
-- ثلاثةُ أعمدةٍ على الفترة: السببُ ولحظةُ الفتح ومن فتحها. فارغةٌ لما لم يُفتح بعد هذا البناء، ولا يُكتب فيها شيءٌ رجعياً:
-- فترةٌ فُتحت قبله فتحُها مجهولُ السبب، والفراغُ يقول ذلك ولا يخترع سبباً.

ALTER TABLE "fiscal_periods" ADD COLUMN "reopenReason" TEXT;
ALTER TABLE "fiscal_periods" ADD COLUMN "reopenedAt" TIMESTAMP(3);
ALTER TABLE "fiscal_periods" ADD COLUMN "reopenedById" TEXT;
