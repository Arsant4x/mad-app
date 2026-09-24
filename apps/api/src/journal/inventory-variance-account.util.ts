import { Prisma } from '@prisma/client';
import { getOrCreateAccount } from './inventory-accounts.util';

/**
 * ⚖️ `ق-١٣٦٣` — **حسابُ فروقات المخزون**: مقابلُ الحركة اليدوية في الاتجاهين.
 *
 * بنصّ المالك: «الحركةُ اليدوية: يُقيَّد لها قيد، ويُنقض القرارُ القديم بحجّة. ⇒ فحركةٌ تُحرّك قيمةَ المخزون ولا تصل الدفتر تجعل
 * الدفترَ لا يطابق ما على الرفّ، وهذا عينُ ما بُني الحارسُ ليمنعه. والقيد: حسابُ فروقات المخزون مقابل حساب المخزون، في الاتجاهين.»
 *
 * **حسابٌ واحد ينقلب جانبُه** — كـ`5900` «عجز وزيادة الصندوق» (`ق-٣٠٨`): إدخالٌ يدويّ ⟵ مدين `1300` / دائن الفروقات، وإخراجٌ ⟵
 * مدين الفروقات / دائن `1300`. **والرمزُ `5810` بجوار `5800` (التلف والفقد)** — عائلةُ ما يخرج من المخزون بلا بيع — «أو ما يُقرَّر».
 * ⚠️ **وليس التلف**: التلفُ فعلٌ بمستندٍ واعتماد (`5800`)؛ والحركةُ اليدوية تسويةٌ بلا مستند — ورقمُها يجب أن يُرى وحدَه.
 *
 * ويُنشأ عند أوّل حاجة (نمط `1300` و`1250` و`3900` و`5800`) — فمنشأةٌ قائمة لا يسقط قيدُها صامتاً لنقص رمز.
 */
export const INVENTORY_VARIANCE_ACCOUNT_CODE = '5810';
export const INVENTORY_VARIANCE_ACCOUNT_NAME = 'فروقات المخزون';

export const getOrCreateInventoryVarianceAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, INVENTORY_VARIANCE_ACCOUNT_CODE, INVENTORY_VARIANCE_ACCOUNT_NAME, 'expense');
