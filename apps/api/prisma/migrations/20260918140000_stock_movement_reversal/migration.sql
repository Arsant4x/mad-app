-- ㉙ حذفُ الحركة ⟵ عكسٌ بحركةٍ مقابلة (ق-١٠٦٣ · 2026-09-18)
--
-- تاريخُ المخزون لا يُمحى: الحركةُ الخاطئة تُعكَس بحركةٍ مقابلة تشير إليها، وتبقى الاثنتان. ولا يُعكَس ما له
-- مستندٌ (بيعٌ · استلامٌ · شطب) إلا من مستنده، ولا يُعكَس ما استُهلكت طبقتُه، ولا تُعكَس الحركةُ مرّتين.
-- ولا صفوفَ قائمة تُمسّ: ما حُذف قبل اليوم لا يعود، وما بقي كما هو.

ALTER TABLE "stock_movements" ADD COLUMN "reversalOfId" TEXT;
CREATE UNIQUE INDEX "stock_movements_reversalOfId_key" ON "stock_movements"("reversalOfId");
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversalOfId_fkey"
  FOREIGN KEY ("reversalOfId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
