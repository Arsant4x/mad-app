-- ═══════════════════════════════════════════════════════════════════════
-- L0-0 — بند المستند: الصفّ الذي لم يكن
-- ═══════════════════════════════════════════════════════════════════════
--
-- الشراء كان **رأساً بلا بنود**: مورّد وفئة و`subtotal` و`total`. فلا شيء
-- يقول *ماذا* اشترى، ولا حدثَ في المنصّة كلها يحمل (صنفاً وكميةً وتكلفة)
-- معاً. ولذلك لم تكن طبقات التكلفة تفتقر إلى ميزة — كانت تفتقر إلى **مصدر**.
--
-- وسطر الفاتورة نصٌّ حرّ: `description` و`quantity` و`unitPrice`. فحتى لو
-- وُجدت الطبقات لما وجد قيدُ COGS ما يُطلقه.
--
-- ⚠️ **وهذه الموجة تُنشئ الصفّ وتقف.** الترحيل المحاسبي يقرأ الرأس كما كان،
-- ولا يتغيّر قيدٌ واحد. ما يتغيّر أن للموجة التالية ما تقرؤه.
--
-- ## `productId` — إلزاميٌّ على الجديد، مُعفى منه القائم
--
-- العمود قابل للإفراغ في القاعدة، وإلزاميٌّ في المدخل للسطر المخزني. وثلاث
-- فئات تتقاسم الجدول:
--
--   · صفوفٌ كُتبت قبل هذه الموجة → NULL
--   · سطورٌ خدمية (إيجار · ساعة استشارة · بلاغ صيانة) → NULL بطبيعتها
--   · سطورٌ مخزنية من الآن → مضبوطة دائماً
--
-- ⚠️ **والأثر معلَن لا مكتشَف**: السطور المُعفاة **لا يُحسب لها COGS** — لا
-- صنفَ لها تُستهلك من طبقته. فتقرير هامشٍ على مستندٍ قديم يقرأ إيراداً بلا
-- تكلفة. والبديل — اختراع صنفٍ لسطرٍ لم يحمله — يُنتج تكلفة **خاطئة** بدل
-- تكلفة **غائبة**، وهو أسوأ.
--
-- ## ولماذا لا علَم «مخزني/خدمي»
--
-- `productId` نفسه هو العلَم: من حمل صنفاً فهو مخزني، ومن لم يحمله فخدمي.
-- وعلَمٌ منفصل يستطيع أن يخالف الصنف، فيلزم عندئذٍ من يحكم أيّهما يكذب.
--
-- ## ولماذا كُتب هذا الملف يدوياً
--
-- ⚠️ `prisma migrate diff` على هذه القاعدة يقترح حذف `tasks` و`task_logs` و
-- `delegation_logs` وفهرس `business_activities_companyId_sector_idx` — لأنها
-- أُنشئت بترحيلات SQL خام ولم تُضَف إلى `schema.prisma`. فالمسار الآلي كان
-- سيكتب ترحيلاً يحذف ثلاثة جداول عاملة. أُخذت التصريحات المطلوبة وحدها.

-- ═══ ① الصنف على سطري الفاتورة والعرض ═══
ALTER TABLE "invoice_lines" ADD COLUMN "productId" TEXT;
ALTER TABLE "quote_lines"   ADD COLUMN "productId" TEXT;

-- ═══ ② بند الشراء ═══
CREATE TABLE "purchase_lines" (
    "id"          TEXT NOT NULL,
    "companyId"   TEXT NOT NULL,
    "purchaseId"  TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "productId"   TEXT,
    "quantity"    DECIMAL(18,3) NOT NULL,
    "unitPrice"   DECIMAL(18,6) NOT NULL,
    "taxRate"     DECIMAL(5,2)  NOT NULL DEFAULT 15,
    "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- ═══ ③ الفهارس ═══
CREATE INDEX "purchase_lines_purchaseId_idx"         ON "purchase_lines"("purchaseId");
CREATE INDEX "purchase_lines_companyId_productId_idx" ON "purchase_lines"("companyId", "productId");
CREATE INDEX "invoice_lines_companyId_productId_idx"  ON "invoice_lines"("companyId", "productId");
CREATE INDEX "quote_lines_companyId_productId_idx"    ON "quote_lines"("companyId", "productId");

-- ═══ ④ المفاتيح الأجنبية ═══
-- `RESTRICT` على الصنف مقصود: صنفٌ يشير إليه مستندٌ مرحَّل تاريخٌ، والتاريخ لا
-- يفقد موضوعه. والأرشفة تبقى طريقَ إخراج الصنف من الاستعمال.
ALTER TABLE "invoice_lines"  ADD CONSTRAINT "invoice_lines_productId_fkey"
    FOREIGN KEY ("productId")  REFERENCES "products"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_lines"    ADD CONSTRAINT "quote_lines_productId_fkey"
    FOREIGN KEY ("productId")  REFERENCES "products"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_companyId_fkey"
    FOREIGN KEY ("companyId")  REFERENCES "companies"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_productId_fkey"
    FOREIGN KEY ("productId")  REFERENCES "products"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══ ⑤ عزل المستأجر — ENABLE وFORCE معاً ═══
-- ⚠️ **FORCE شرطٌ لا تفصيل**: مالك الجدول يتجاوز السياسة بدونه، والاتصال
-- الذي تُشغَّل به الترحيلات هو المالك. فجدولٌ بـENABLE وحده يبدو محميّاً
-- ويُقرأ عبر المنشآت.
-- ⚠️ **مسافة واحدة قبل `ROW` في السطرين — لا محاذاة.** حارس
-- `activities/rls-context.spec.ts` يقرأ نصّ الترحيلات بنمطٍ حرفيّ
-- (`/ALTER TABLE "(\w+)" FORCE ROW LEVEL SECURITY/`)، فمسافةٌ زائدة تجعل
-- الجدول يبدو له بـ`ENABLE` بلا `FORCE` — وهو أخطر ما يُخفيه التجميل.
ALTER TABLE "purchase_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchase_lines" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_purchase_lines ON "purchase_lines"
    USING      ("companyId" = current_setting('app.company_id', true))
    WITH CHECK ("companyId" = current_setting('app.company_id', true));
