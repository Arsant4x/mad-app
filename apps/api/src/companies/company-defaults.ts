import { Prisma } from '@mad-app/db';

/**
 * ما تُولد به كل منشأة — **مصدر واحد** يركب كل مسارات الإنشاء.
 *
 * ## الحادثة (2026-08-12)
 *
 * قال تعليق `BusinessActivity` في المخطط:
 *
 * > every company is seeded with one default activity and everything hangs
 * > off it … so the rest of the app can assume both exist without null-checking
 *
 * **ولم يكن ذلك صحيحاً للمنشآت الحقيقية قط.** الترحيل `structural_wave` أنشأ
 * الجدول بلا تعبئة، و`seed.ts` يخدم منشأتَي العرض وحدهما، ومسار إنشاء المنشأة
 * الحقيقية (`auth.service` · `companies.service`) لا يمسّ الاثنين. فكل منشأة
 * تُسجَّل من الواجهة تُولد بلا نشاط وبلا صفّ عملة — **صامتةً**، لأن لا شيء
 * يشتكي.
 *
 * انكشف بقياس منشأة حقيقية أُنشئت للتوّ: `activities []` · `currencies []`.
 *
 * ## حدّ العطل — مقيسٌ لا مُقدَّر
 *
 * **لا حساب مالي ينهار.** الأساس المالي على `Company.baseCurrency`
 * (`String @default("SAR")`)، والمستندات تحمل `currency @default("SAR")`
 * و`exchangeRate @default(1)`. جُرّبت على منشأة ناقصة: عميل ومنتج وعقار
 * وفاتورة — كلها **201**.
 *
 * فالأثر **عرضٌ واتساق**: شاشة «الأنشطة والعملات» تظهر فارغة، ولا صفَّ عملةٍ
 * يمثّل أساس المنشأة. وهو عطلٌ يستحق الإصلاح لأن التعليق يَعِد بما لا يفي —
 * وشيفرةٌ تُبنى غداً على وعده تنهار حينها لا اليوم.
 *
 * ## القاعدة
 *
 * هذه الوحدة **مصدر واحد**: تُستدعى من كل مسار يُنشئ منشأة، ومن سكربت التعبئة
 * — بلا نسخة في أيٍّ منها. وهي **عديمة الأثر عند التكرار** (`skipDuplicates`
 * و`upsert`)، فاستدعاؤها مرتين لا يُنشئ شيئاً مرتين ولا يدهس تعديلاً للمستخدم.
 *
 * نظيرتها `accounts/default-chart.ts` (بند 4.7) — **نفس العائلة ونفس العلاج**:
 * منشأة تُولد ناقصة بصمت لأن مسار البذرة وحده كان يكملها.
 */

/** اسم النشاط الافتراضي — نفس ما تستعمله البذرة، فلا تتفرّع التسميتان. */
export const DEFAULT_ACTIVITY_NAME = 'النشاط الرئيسي';

/** رمز عملة الأساس. يطابق `Company.baseCurrency` الافتراضي عمداً: صفٌّ لا
 *  يطابق أساس المنشأة أسوأ من غياب الصفّ — يوحي بأن الأساس شيء آخر. */
// The riyal's symbol is the central bank's official sign (U+20C1); the interface draws it from the issuer's file.
export const DEFAULT_CURRENCY = { code: 'SAR', name: 'ريال سعودي', symbol: '\u20C1' } as const;

export interface CompanyDefaultsResult {
  activityCreated: boolean;
  currencyCreated: boolean;
}

/**
 * يُكمل منشأةً بما يجب أن تُولد به.
 *
 * @param activityType نوع النشاط بنصّه الحر (`عقارات` · `مطاعم` …). يُترك
 *   فارغاً حين لا يُعرف — الاسم وحده يكفي لوجود النشاط، والنوع يُضبط لاحقاً
 *   من الشاشة. **لا تُخترع قيمة**: نوعٌ خاطئ يقود منطق العقارات إلى فرعٍ لا
 *   يخصّ المنشأة (`contracts.service` يقارن بـ`Property.activityType`).
 */
export async function createCompanyDefaults(
  tx: Prisma.TransactionClient,
  companyId: string,
  activityType?: string | null,
): Promise<CompanyDefaultsResult> {
  // createMany + skipDuplicates لا يكفي هنا: لا قيد فريد على (companyId,name)
  // في `business_activities`، فالتكرار لن يُكتشف. الفحص الصريح هو ما يجعلها
  // عديمة الأثر — ومطابقٌ لما تفعله البذرة اليوم.
  const existingActivity = await tx.businessActivity.findFirst({ where: { companyId } });
  if (!existingActivity) {
    await tx.businessActivity.create({
      data: {
        companyId,
        name: DEFAULT_ACTIVITY_NAME,
        activityType: activityType?.trim() || null,
      } as unknown as Prisma.BusinessActivityUncheckedCreateInput,
    });
  }

  // العملة لها قيد فريد (companyId, code) فـ`upsert` آمن ودقيق.
  // `update: {}` مقصود: منشأةٌ عدّلت اسم عملتها أو رمزها لا يُدهس تعديلها.
  const existingCurrency = await tx.currency.findFirst({ where: { companyId, code: DEFAULT_CURRENCY.code } });
  if (!existingCurrency) {
    await tx.currency.create({
      data: {
        companyId,
        code: DEFAULT_CURRENCY.code,
        name: DEFAULT_CURRENCY.name,
        symbol: DEFAULT_CURRENCY.symbol,
        isBase: true,
        rate: 1,
      } as unknown as Prisma.CurrencyUncheckedCreateInput,
    });
  }

  return {
    activityCreated: !existingActivity,
    currencyCreated: !existingCurrency,
  };
}
