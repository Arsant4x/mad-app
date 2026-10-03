import { Prisma } from '@mad-app/db';
import { getOrCreateAccount } from './inventory-accounts.util';

/**
 * ⚖️ **حسابا عقار التشغيل حين المؤجّرُ المالك** (السؤال ٥٧٧ · `ق-١٦٠٠` · `ق-١٦٠٩`/أ، بحكم صاحب المشروع).
 *
 * ## ما هما
 *
 * المالكُ مؤجّرٌ والمنشأةُ وكيلٌ معلَن يحصّل عنه بعمولة: **ما يُقبض من المستأجر ليس إيراداً للمنشأة** بل أمانةٌ للمالك
 * تُدفع له — فهو **التزامٌ** (`2500`). **وإيرادُها عمولتُها** (`4250`) وحدَها، وعليها ضريبةُ ١٥٪ دائماً، سكنياً كان
 * الإيجارُ أو تجارياً — فالعمولةُ خدمةٌ تقدّمها المنشأةُ للمالك.
 *
 * ## ولماذا لا `2300` ولا `4300`
 *
 * `2300` «تأمينات المستأجرين» مالُ **المستأجر** يُردّ له، وحصّةُ المالك مالُ **المالك** يُدفع له؛ وجمعُهما يُفسد تقريرَ
 * التأمينات ومطابقتَه (`ق-٤٧١`). و`4300` «إيرادات أخرى» عارضٌ (مطالباتٌ وخلوُّ رِجل)، والعمولةُ نشاطُ المشغّل الأصليّ.
 *
 * ## ولماذا رمزان ثابتان يُنشآن عند الحاجة
 *
 * حسابٌ واحدٌ لكلِّ منشأة كـ`2400` (`ق-٤٧٠`)، خارجَ كلِّ نطاقٍ يُولَّد منه رمز (`code-bands.ts`)، **ويُنشأ عند أوّل قبضٍ**
 * للمنشآت القائمة ويدخل دليلَ المولود الجديد (`ق-٤٧١`) — فالرفضُ لنقص حسابٍ هنا يعني قبضاً بلا التزامٍ للمالك.
 * ورمزٌ قائمٌ بنوعٍ آخر يُرفض ولا يُستعمل (`existingReservedAccount`).
 */
export const OWNER_SHARE_ACCOUNT_CODE = '2500';
export const OWNER_SHARE_ACCOUNT_NAME = 'مستحقٌّ لمالكي العقارات';

export const OPERATING_COMMISSION_ACCOUNT_CODE = '4250';
export const OPERATING_COMMISSION_ACCOUNT_NAME = 'إيرادات عمولات تشغيل العقارات';

export const getOrCreateOwnerShareAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, OWNER_SHARE_ACCOUNT_CODE, OWNER_SHARE_ACCOUNT_NAME, 'liability');

export const getOrCreateOperatingCommissionAccount = (tx: Prisma.TransactionClient, companyId: string) =>
  getOrCreateAccount(tx, companyId, OPERATING_COMMISSION_ACCOUNT_CODE, OPERATING_COMMISSION_ACCOUNT_NAME, 'revenue');
