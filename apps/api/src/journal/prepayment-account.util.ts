import { Prisma } from '@prisma/client';
import { existingReservedAccount, getOrCreateAccount } from './inventory-accounts.util';

/**
 * **دفعاتٌ مقدَّمة من العملاء** (`ق-١٢٦١` ب — ④A1): التزامٌ حتى يقع التوريد — لا إيرادٌ ولا ذمّةٌ سالبة.
 *
 * مقبوضٌ قبل التوريد يوجب مستنداً ضريبياً (م٥٣(١)(أ)(٢) · م٥٣(٧)(أ)(٢)) — فالضريبةُ تُستحقّ يومَ القبض وتدخل `2200`؛
 * وأصلُ المبلغ **ليس إيراداً** (لم يُورَّد شيء) **ولا ذمّةً سالبة على العميل** (كان يبقى دائناً على `1200` فيُقرأ ديناً
 * معكوساً في الأعمار): هو التزامٌ باسمه. رمزُه في نطاق الخصوم بعد تأمينات المستأجرين `2300` والإيراد المؤجَّل `2400` —
 * «أو ما يُقرَّر». يُنشأ عند أوّل دفعةٍ مقدَّمة كسائر حسابات الحاجة (`1190` · `5910`).
 */
export const CUSTOMER_PREPAYMENTS_CODE = '2450';
export const CUSTOMER_PREPAYMENTS_NAME = 'دفعات مقدَّمة من العملاء';
/** نوعُه — مصدرٌ واحد للإنشاء عند الحاجة وللفحص قبل الترقيم. */
const CUSTOMER_PREPAYMENTS_TYPE = 'liability';

export const getOrCreateCustomerPrepaymentsAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, CUSTOMER_PREPAYMENTS_CODE, CUSTOMER_PREPAYMENTS_NAME, CUSTOMER_PREPAYMENTS_TYPE);

/**
 * (`ق-١٤٩٠`) **`2450` بنوعه قبل ترقيم مستند الدفعة المقدَّمة أو فاتورةٍ تطبّقها** — رمزٌ قائمٌ بنوعٍ آخر يُرفض هنا
 * برسالته قبل أن يُحجز رقمٌ ضريبيّ، لا بعده. ولا يُنشأ الحسابُ هنا: الإنشاءُ عند الترحيل كما كان.
 */
export const assertCustomerPrepaymentsAccountUsable = async (tx: Prisma.TransactionClient, companyId: string): Promise<void> => {
  await existingReservedAccount(tx, companyId, CUSTOMER_PREPAYMENTS_CODE, CUSTOMER_PREPAYMENTS_TYPE);
};
