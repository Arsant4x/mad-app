-- ق-٦٤٦ — صفُّ إذن الدعم يحمل «من قرّر» على الصفّ، بالشكل نفسِه الذي في الإجازات والشطب.
--
-- كان الصفُّ يحمل من طلب (requestedById/Name) ومتى قُرّر (decidedAt) ولا يحمل من قرّر.
-- والمالكُ واحدٌ فيُستدلّ عليه — والاستدلالُ ليس تسجيلاً. حقلان قابلان للفراغ عمداً:
-- الصفوفُ القائمة لا تحمل قائلاً، وفراغُها «غيرُ معلوم» — ولا يُملأ رجعياً بترجيح.
ALTER TABLE "support_access_grants" ADD COLUMN "decidedById" TEXT;
ALTER TABLE "support_access_grants" ADD COLUMN "decidedByName" TEXT;
