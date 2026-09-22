import { Prisma } from '@prisma/client';
import { getOrCreateAccount } from './inventory-accounts.util';

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

export const getOrCreateCustomerPrepaymentsAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, CUSTOMER_PREPAYMENTS_CODE, CUSTOMER_PREPAYMENTS_NAME, 'liability');
