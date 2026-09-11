-- النسخةُ الكاملة قبل الإغلاق (ق-٥٥٤): لا يُمحى شيءٌ قبل أن ينال صاحبُه نسختَه.
-- بيانُ الملفّات (سنويةً + الأساسية + المختومُ كما هو) على طلب الحذف نفسه، وأجلُ إتاحة التنزيل. لا DML هنا.
ALTER TABLE "account_deletion_requests"
  ADD COLUMN "archiveManifest" JSONB,
  ADD COLUMN "archiveProducedAt" TIMESTAMP(3),
  ADD COLUMN "archiveExpiresAt" TIMESTAMP(3);
