-- ⚖️ توجيه ٢٨٧ — قيمُ التعداد لمسار التوقيع، في هجرةٍ وحدَها: قيمةٌ تُضاف بـ ADD VALUE لا تُستعمل في معاملتها (55P04)،
-- فما يستعملها (المُشغِّلاتُ والجداول) في الهجرة التالية. ولا DML.

ALTER TYPE "FormInstanceStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SIGNATURE';
ALTER TYPE "FormInstanceStatus" ADD VALUE IF NOT EXISTS 'OBJECTED';
ALTER TYPE "FormInstanceStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TYPE "FormInstanceStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'FORM_SIGNING_EXPIRED';
ALTER TYPE "NotificationKind" ADD VALUE IF NOT EXISTS 'FORM_OBJECTED';
