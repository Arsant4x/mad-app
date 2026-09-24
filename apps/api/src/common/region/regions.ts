import { BadRequestException } from '@nestjs/common';
import { formatMessage, MSG } from '../i18n/messages';

/**
 * 🔴 `ق-١٣٦٨` — **الدولةُ صفةٌ للمنشأة لا افتراضٌ في الشيفرة**: أربعةُ حقولٍ على `Company` (الدولة · المنطقةُ الزمنية · اللغة · عملةُ الأساس).
 *
 * **بنصّ المالك**: «الدولةُ مفترَضةٌ لا صفة: أربعةُ حقولٍ على المنشأة الآن … ⇒ فالمسحُ قال إن ما لا يُعكَس هو ضياعُ الفرق بين
 * «سعوديٌّ مُعلَن» و«سعوديٌّ بالافتراض». والقائمُ يُعبَّأ «السعودية» معلَناً في الهجرة، لأن المنصّةَ لم تخدم غيرها.»
 *
 * ## هذا الملفّ هو مسكنُ قيم الدولة — والوحيد
 * ما يُكتب على منشأةٍ عند ميلادها يُقرأ من هنا، **ولا عمودَ في القاعدة بقيمةٍ افتراضية** (الهجرة `…_company_region` أسقطت `DEFAULT`
 * عملة الأساس ولم تضع للثلاثة الجديدة افتراضاً) — فلا يولد صفٌّ سعوديٌّ بالافتراض. وحارسُ القاعدة الملزمة (`country-literals.util.ts`)
 * يعدّ هذا الملفَّ داخل حدود الدولة: هنا تُكتب قيمُها لتُقرأ من المنشأة في كلِّ موضعٍ آخر (`ق-١٣٥٠` ②).
 *
 * ## ومتى يصير الإعلانُ إلزامياً — بالبناء لا بالتذكير
 * المنصّةُ تخدم إقليماً **واحداً** اليوم، فميلادٌ بلا دولةٍ معلَنة يأخذه — **وهو إعلانٌ لا افتراض**: الحجّةُ نفسُها التي عبّأت القائمَ
 * («لم تخدم غيرها»). وحين يُضاف إقليمٌ ثانٍ هنا **يصير الإعلانُ إلزامياً من تلقاء نفسه** (`region_required`) — فلا صفَّ يولد بعدها
 * بإقليمٍ لم يُعلَن. ⛔ **ولا يُبنى اليوم شيءٌ لدولةٍ أخرى** (`ق-١٣٥٠`) — الإقليمُ الثاني قرارٌ بمسحٍ وبحثٍ نظاميّ لا سطرٌ هنا.
 */
export interface RegionProfile {
  /** رمزُ الدولة — ISO 3166-1 alpha-2. */
  country: string;
  /** المنطقةُ الزمنية — IANA. */
  timeZone: string;
  /** لغةُ العرض ومحلّيتُه — BCP 47. */
  locale: string;
  /** عملةُ الأساس — ISO 4217؛ إليها تُوحَّد التقارير ويسقط كلُّ مستندٍ بلا عملةٍ صريحة. */
  baseCurrency: string;
}

/** الأقاليمُ التي تخدمها المنصّة — مفتاحُها رمزُ الدولة. */
export const SUPPORTED_REGIONS: Readonly<Record<string, RegionProfile>> = Object.freeze({
  SA: Object.freeze({ country: 'SA', timeZone: 'Asia/Riyadh', locale: 'ar-SA', baseCurrency: 'SAR' }),
});

/**
 * إقليمُ منشأةٍ تولد: المُعلَنُ في الطلب إن كان مدعوماً (وإلا `400` مسمّى) — وبلا إعلانٍ **الوحيدُ** الذي تخدمه المنصّة؛ فإن كانت
 * تخدم أكثر من إقليمٍ فالإعلانُ إلزاميّ (`400`). والسجلُّ وسيطٌ ليُصادَق الفرعان بسجلٍّ من إقليمين.
 */
export function regionForNewCompany(country: string | null | undefined, regions: Readonly<Record<string, RegionProfile>> = SUPPORTED_REGIONS): RegionProfile {
  const code = country?.trim().toUpperCase();
  if (code) {
    const region = regions[code];
    if (!region) throw new BadRequestException(formatMessage(MSG.region_unsupported, { country: code }));
    return region;
  }
  const all = Object.values(regions);
  if (all.length !== 1) throw new BadRequestException(MSG.region_required);
  return all[0];
}
