-- الإتلافُ حقٌّ يُطلب وسياسةٌ تُطبَّق معاً (ق-٥٥٩): نوعُ طلبٍ ثالث (إتلافٌ صريح — م٤/٥) ونتيجتُه،
-- وطابعُ محو غير الملزِم على المنشأة. لا DML هنا.
ALTER TYPE "AccountRequestKind" ADD VALUE 'ERASURE';
ALTER TYPE "AccountRequestOutcome" ADD VALUE 'ERASED';

ALTER TABLE "companies" ADD COLUMN "erasedAt" TIMESTAMP(3);
