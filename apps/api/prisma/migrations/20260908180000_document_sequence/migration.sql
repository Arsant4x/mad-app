-- ⭐ عدّادُ تسلسل المستندات (ق-٣٢٨) — رقمٌ يُشتقّ من عدّادٍ لا من مسح
--
-- ## العلّة
--
-- **سبعةُ مواضع** تقرأ **كلَّ صفوف السنة** ثم تأخذ الأعلى: الفاتورة · القيد ·
-- السند · العقد · الشراء · إعدامُ المخزون · **عرضُ السعر** — والسابعُ وجده
-- الحارسُ المشتقُّ بعد أن قال القياسُ ستة. **فمتجرٌ بمئة بيعةٍ يومياً يقرأ
-- ملايينَ الصفوف** — ثلاثَ مرّاتٍ في كل بيعة — والبطءُ يتضاعف حتى يتوقّف
-- الكاشير. **ولا يظهر في السير لأن قاعدته فارغة** (ق-٣١٨).
--
-- ⚠️ والقراءةُ السريعة (صفٌّ واحد بـ`ORDER BY no DESC`) **ترتيبٌ نصّيّ**:
-- `…-9999` يسبق `…-10000` أبجدياً **فتُعطي رقماً مستعمَلاً**. فالمشكلتان
-- واحدة، **والعدّادُ يُلغي الترتيبَ النصّيّ أصلاً**.
--
-- ## البذرُ مرّةً واحدة — بنيةً لا انضباطاً (شرطُ المالك الأول)
--
-- `@@unique(companyId, kind, year)` هو ما يجعل الإدراجَ الثاني يصطدم، فالبذرُ
-- **يُدرِج أو لا يفعل شيئاً** (`ON CONFLICT DO NOTHING`) — **وتشغيلٌ ثانٍ لا
-- يغيّر شيئاً**. و`last` **آخرُ ما صدر لا التالي**: فما لا يُبذَر يبدأ من
-- صفرٍ وأولُ رقمٍ `1`.
--
-- ⚠️ **ولا رقمٌ صدر يتغيّر**: الجدولُ يُنشأ فارغاً، ويُبذَر لكلِّ (منشأة ·
-- نوع · سنة) **عند أول طلبٍ** من أعلى رقمٍ قائمٍ حينها.
--
-- ⚠️ ولا `DML` على جدولٍ تحت `FORCE`: الإنشاءُ `DDL` محضة (ق-٢٦٢).

CREATE TABLE "document_sequences" (
    "id"        TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind"      TEXT NOT NULL,
    "year"      INTEGER NOT NULL,
    "last"      INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_sequences_companyId_kind_year_key"
    ON "document_sequences"("companyId", "kind", "year");

ALTER TABLE "document_sequences"
    ADD CONSTRAINT "document_sequences_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══ عزل المستأجر — الطبقة الثانية (rls-coverage.live.spec يوجبها لكل جدولٍ يملكه المستأجر) ═══
ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_document_sequences ON "document_sequences"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
