-- الأبعاد التحليلية على سطر القيد — الموجة ٣ من L0.
--
-- ⚠️ **كُتب بيد بعد قراءة ما ولّدته `prisma migrate diff`** — فقد ولّدت معه
-- ثلاثة `DROP TABLE` (`tasks` · `task_logs` · `delegation_logs`) لم تُطلب.
-- سببها انحرافٌ قائم في `main` قبل هذه الموجة: النماذج حُذفت من `schema.prisma`
-- ولم يُكتب ترحيلُ حذف، فبقيت الجداول في القاعدة. والجداول **تحمل بيانات**
-- (٤٠٥ صفوف في قاعدة التطوير · ٥ على خادم العرض)، فتمريرُ المولَّد كما هو كان
-- يمحوها عند أول `migrate deploy`. الانحراف بندٌ مسجَّل يُعالَج وحده.
--
-- وثلاثة أعمدة تُضاف بلا قيمة افتراضية: إضافةُ عمودٍ فارغ لا تعيد كتابة الجدول
-- (قِيس: ~2ms لكل مليون صف)، فلا قفل طويل ولا منع قراءة.

ALTER TABLE "journal_lines" ADD COLUMN "branchId"   TEXT;
ALTER TABLE "journal_lines" ADD COLUMN "propertyId" TEXT;
ALTER TABLE "journal_lines" ADD COLUMN "unitId"     TEXT;

-- الفهرسان بـ`companyId` أولاً: كل استعلامٍ تحليلي مُستأجَرٌ بطبيعته، فالبادئة
-- المشتركة تخدم «أسطر هذا العقار» و«أسطر هذه الشركة» معاً.
CREATE INDEX "journal_lines_companyId_propertyId_idx" ON "journal_lines"("companyId", "propertyId");
CREATE INDEX "journal_lines_companyId_unitId_idx"     ON "journal_lines"("companyId", "unitId");

-- `RESTRICT` لا `SET NULL`: الدفتر سجلُّ واقعةٍ لا يُعدَّل. و`SET NULL` كان
-- سيحوّل انتماءً حقيقياً إلى «بلا انتماء» **صامتاً** عند حذف وحدة أو عقار —
-- وهو الكذب نفسه الذي يمنعه غيابُ القيمة الافتراضية. (وقيدُ الحساب على هذا
-- الجدول `RESTRICT` للسبب عينه: حسابٌ رُحِّل إليه لا يُحذف.)
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_branchId_fkey"
    FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ملاحظة: `journal_lines` عليها عزل الصفوف (RLS) مع FORCE سلفاً من ترحيلٍ
-- سابق، وإضافة عمودٍ لا تمسّها. ولا سياسة جديدة تلزم — البُعد يقع داخل صفٍّ
-- محميٍّ أصلاً بـ`companyId`.
