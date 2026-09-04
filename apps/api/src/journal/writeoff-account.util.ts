import { Prisma } from '@prisma/client';
import { getOrCreateAccount } from './inventory-accounts.util';

/**
 * حساب مصروف التلف والفقد — `5800`.
 *
 * ## لماذا حسابٌ مستقل لا `5400 مصروفات أخرى`
 *
 * قرار المالك (2026-09-03): **خلطه يُخفي رقماً يجب أن يُرى.** فسؤال «كم أتلفتُ
 * هذا الشهر؟» **مؤشرُ سرقةٍ قبل الجرد** — ورقمٌ مدفونٌ في «مصروفات أخرى» لا
 * يُسأل عنه أحد حتى يظهر النقص في جردٍ سنوي.
 *
 * ## ولماذا يُنشأ عند الحاجة لا في الدليل وحده
 *
 * ⚠️ `resolveAccountIds` يعيد `null` **تخطّياً صامتاً** إذا نقص رمز. فإضافة
 * `5800` إلى الدليل الافتراضي وحده تعني أن **كل منشأة قائمة يسقط قيد تلفها بلا
 * رسالة** — والشطب يُسجَّل والدفتر لا يعلم. فيُضاف إلى الدليل **للمنشآت
 * الجديدة**، ويُنشأ **عند أول شطب** للقائمة — نفس نمط `1300` و`1250` و`3900`.
 */
export const WRITEOFF_EXPENSE_ACCOUNT_CODE = '5800';
export const WRITEOFF_EXPENSE_ACCOUNT_NAME = 'مصروف تلف وفقد';

export const getOrCreateWriteOffAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, WRITEOFF_EXPENSE_ACCOUNT_CODE, WRITEOFF_EXPENSE_ACCOUNT_NAME, 'expense');
