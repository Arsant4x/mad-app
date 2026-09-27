import { Prisma } from '@mad-app/db';
import { round2 } from '../common/money/rounding';
import { exposureOf } from '../reports/receivables-exposure.util';

/**
 * ⭐ **حدُّ الائتمان — يُقرأ من المصدر الواحد ولا يحسب تعرّضَه بنفسه**
 * (`ق-٣٣٦` · `ق-٣٣٨` · `ق-٣٤٠` · `ق-٣٤١`).
 *
 * ── العطل الذي بُني له ───────────────────────────────────────────────────
 *
 * `Customer.creditLimit` **قائمٌ منذ البداية**: يُخزَّن ويُحرَّر ويُعرض في
 * جدول العملاء — **ولا قارئَ له في أيّ قرار** (`ق-٣٣٢`①). **وحكمُ المالك**:
 * «**حقلٌ يراه التاجر ويظنّه يحميه ولا يفعل شيئاً أخطر من غيابه**».
 *
 * ── ولا يحسب التعرّضَ بنفسه ──────────────────────────────────────────────
 *
 * ⚠️ **`ق-٣٤١` شرطُ قبولٍ يسبق هذا الملفّ لا يتبعه**: «المتبقّي» كان يُحسب في
 * **ثلاثة مواضع بلا دالّةٍ مشتركة**، **وحدٌّ يحسبه بنفسه يصير رابعاً** —
 * **وتاجرٌ يقرأ في الأعمار `٤٠٬٠٠٠` وفي رسالة المنع `٤٥٬٠٠٠` يفقد الثقة في
 * الاثنين**. فيُقرأ من `exposureOf` وحدها، **وهي عينُ ما يقرؤه تقريرُ
 * الأعمار**.
 *
 * ── والعملةُ أساسٌ لا عملةَ الفاتورة ─────────────────────────────────────
 *
 * ⚠️ **مقيسٌ لا مفترَض**: `customerExposure` تجمع `baseTotal` (السطر ١٣٧) —
 * **فالتعرّضُ بالعملة الأساس**. فيُقارَن به **`baseTotal` الفاتورةِ الجديدة**
 * لا `total`ها، **والحدُّ يُقرأ أساساً كذلك**. ومقارنةُ مبلغٍ بعملةٍ أخرى
 * **تُنتج منعاً عشوائياً يصعب تفسيره للتاجر**.
 */

/**
 * ⚠️ **صفرٌ يعني «بلا حدّ» — وهذا شرطُ ألّا تكسر الميزةُ كلَّ عميلٍ قائم.**
 *
 * `creditLimit Decimal @default(0)`، **وكلُّ عميلٍ في كل منشأةٍ اليوم على
 * الصفر**. فلو قُرئ الصفرُ حدّاً فعلياً **لمُنع كلُّ بيعٍ آجلٍ في المنصّة
 * لحظةَ تفعيل الميزة** — وهو انحدارٌ شاملٌ يبدو ميزةً.
 */
export const NO_CREDIT_LIMIT = 0;

export interface CreditCheck {
  /** اسمُ العميل — **تحمله الرسالة**، فيُقرأ الرفضُ بلا فتح شاشةٍ أخرى. */
  customerName: string;
  /** الحدُّ المخزَّن على العميل بالعملة الأساس — `0` يعني **بلا حدّ**. */
  limit: number;
  /** تعرّضُ العميل **قبل** هذه الفاتورة، من `exposureOf` وحدها. */
  exposure: number;
  /** ما تضيفه هذه الفاتورة — **`baseTotal`ها**. */
  adding: number;
  /** `exposure + adding` — وهو ما يُقارَن بالحدّ ويُعرض في الرسالة. */
  after: number;
  /** هل يتجاوز؟ **`false` دائماً حين لا حدّ**. */
  exceeded: boolean;
}

/**
 * يقيس أثرَ فاتورةٍ **قبل إنشائها** على حدّ عميلها.
 *
 * ⚠️ **و`tx` معاملةُ المستدعي** (`ق-٣٥٩` · `ق-٣٧٤`): يُقرأ التعرّضُ **داخل
 * معاملة إنشاء الفاتورة**، **ولا تُفتح معاملةٌ ثانية** — فمعاملةٌ داخل معاملة
 * تمسك اتصالين، **وثلاثُ بيعاتٍ متزامنة تُجوّع المجموع ويتوقّف الكاشير عند
 * الذروة**. وقد بُنيت `exposureOf` قابلةً لمعاملة المستدعي **وقايةً لهذا
 * الموضع بعينه قبل أن يوجد**.
 */
export async function checkCreditLimit(
  tx: Prisma.TransactionClient,
  args: { customerId: string; asOf: Date; addingBase: number },
): Promise<CreditCheck> {
  const customer = await tx.customer.findUnique({
    where: { id: args.customerId },
    select: { name: true, creditLimit: true },
  });
  const customerName = customer?.name ?? '';
  const limit = round2(Number(customer?.creditLimit ?? NO_CREDIT_LIMIT));
  const adding = round2(args.addingBase);

  // ⚠️ **ولا يُقرأ التعرّضُ أصلاً حين لا حدّ**: استعلامُ الأعمار ليس رخيصاً،
  //    **وكلُّ عملاء المنصّة اليوم بلا حدّ** — فقراءتُه لهم كلُّها كلفةٌ بلا
  //    قرار. **والفحصُ يسبق القراءة لا يتبعها.**
  if (limit <= NO_CREDIT_LIMIT) {
    return { customerName, limit: NO_CREDIT_LIMIT, exposure: 0, adding, after: adding, exceeded: false };
  }

  const exposure = await exposureOf(tx, args.customerId, args.asOf);
  const after = round2(exposure + adding);
  return { customerName, limit, exposure, adding, after, exceeded: after > limit };
}
