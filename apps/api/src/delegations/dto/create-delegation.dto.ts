import { ArrayNotEmpty, IsArray, IsIn, IsString, Matches } from 'class-validator';
import { ALLOWED_SCREENS, SCREEN_ACTIONS } from '../../templates/screens';
import { RAW_DOMAINS } from '../permission-tree';

/**
 * ⚠️ النمط **مبنيٌّ من `screens.ts` لا مكتوبٌ يدوياً**.
 *
 * قائمةٌ منسوخة هنا تتخلّف عند أول شاشة جديدة: تُضاف إلى `ALLOWED_SCREENS`
 * فتعمل حراستها ويرفضها هذا الفحص — أو الأسوأ، تُحذف من هناك ويبقى الفحص
 * يقبلها. وهي عائلة الخمسة عشر اسماً المخترَعة بعينها.
 */
const GRANT_PATTERN = new RegExp(`^(${ALLOWED_SCREENS.join('|')}):(${SCREEN_ACTIONS.join('|')})$`);

/**
 * عُقد الشجرة المقبولة: `root` · نطاق · شاشة.
 *
 * ⚠️ أسماء النطاقات **من `RAW_DOMAINS` لا مكتوبةً هنا**. كتبتُها يدوياً في
 * أول صياغة — وهو خرقٌ لقاعدةٍ سبق أن كلّفَنا خمسة عشر اسماً مخترَعاً:
 * قائمةٌ منسوخة تفترق عن مصدرها بلا شكوى، ونطاقٌ يُعاد تسميته يصير مرفوضاً
 * برسالةٍ لا تدلّ على السبب.
 *
 * و`other` مضمومة: `buildTree` يضع تحتها ما لم يُسنَد إلى نطاق، فهي عقدةٌ
 * حقيقية تظهر للمستخدم — واستثناؤها يجعل ما تحتها غير قابلٍ للتفويض.
 */
const NODE_KEYS = ['root', 'other', ...RAW_DOMAINS.map((d) => d.key), ...ALLOWED_SCREENS] as const;

export class CreateDelegationDto {
  @IsString()
  granteeId!: string;

  @IsIn(NODE_KEYS as readonly string[])
  nodeKey!: string;

  @IsArray()
  @ArrayNotEmpty()
  @Matches(GRANT_PATTERN, { each: true })
  grants!: string[];
}
