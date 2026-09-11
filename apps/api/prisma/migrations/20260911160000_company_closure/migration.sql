-- المنشأةُ لا تُحذف بعد أوّل حركة — تُغلَق (ق-٥٤٢ · ق-٥٤٧): حالةٌ رابعة لا تعود بالدفع،
-- وأجلُ حفظٍ أدنى يُقرأ للتاجر، وطلبُ إعادة فتحٍ بقرارٍ مسجَّل (ق-٥٤٨). لا DML هنا.
ALTER TYPE "AccountStatus" ADD VALUE 'CLOSED';

CREATE TYPE "AccountRequestKind" AS ENUM ('DELETION', 'REOPENING');
CREATE TYPE "AccountRequestOutcome" AS ENUM ('DELETED', 'CLOSED', 'REOPENED');

ALTER TABLE "companies"
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "retainUntil" TIMESTAMP(3);

ALTER TABLE "account_deletion_requests"
  ADD COLUMN "kind" "AccountRequestKind" NOT NULL DEFAULT 'DELETION',
  ADD COLUMN "outcome" "AccountRequestOutcome",
  ADD COLUMN "movement" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
