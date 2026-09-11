-- سجلُّ التدقيق يبقى بعد حذف المنشأة (ق-٨٠ · ق-٥٣٥): الحذفُ صلبٌ (Cascade عبر هويّة الدخول)،
-- وأثرُ آخر عمليةٍ قبل الحذف كان يُمحى مع الحذف نفسه. لا DML هنا — والجدولُ تحت FORCE كما هو.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_companyId_fkey";
