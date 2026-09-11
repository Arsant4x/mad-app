-- إشعارُ المالك عند طلب الدعم وعند أوّل دخول (ق-٥٣٠): من لا يعلم لا يتحقّق (النظام م٨).
ALTER TYPE "NotificationKind" ADD VALUE 'SUPPORT_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE 'SUPPORT_ENTERED';

-- أوّلُ دخولٍ فعليّ تحت الإذن — يُكتب مرّةً، وعليه يُرفع الإشعار.
ALTER TABLE "support_access_grants" ADD COLUMN "firstEntryAt" TIMESTAMP(3);
