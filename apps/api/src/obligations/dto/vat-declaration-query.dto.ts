import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

/**
 * ⑥A2 (`ق-١٣٢٥`) — **ربعٌ أو شهر، أحدُهما لا كلاهما ولا واحدَ.**
 *
 * وكان `quarter` إلزامياً بـ`@IsIn([1,2,3,4])` — فلا يُطلب شهرٌ أصلاً. **والاثنان يبقيان
 * مفتوحَين لكلِّ تاجر** مهما كان إعدادُه: الفترةُ عدسةٌ لا بوّابة (`vat-period.util.ts`).
 *
 * ⚠️ **والرفضُ مسمّىً لا صامتاً**: من أرسلهما معاً أو لم يرسل أيّاً منهما يُردّ برسالةٍ
 * عربية تقول أيُّهما نقص — لا «شهرٌ مُهمَل» ولا «ربعٌ افتراضيّ» يُختار عنه.
 */
export class VatDeclarationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4], { message: MSG.vat_period_quarter_range })
  quarter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], { message: MSG.vat_period_month_range })
  month?: number;

  /**
   * الشرطُ المتقاطع: يُفحص حين **لا يكون أحدُهما وحدَه** — فيُطلق الرفضَ في الحالتين
   * (كلاهما · ولا واحد) برسالةٍ واحدة. و`ValidateIf` ترى الجسمَ كلَّه فتقيس التقاطع.
   */
  @ValidateIf((o: VatDeclarationQueryDto) => (o.quarter === undefined) === (o.month === undefined))
  @IsIn([], { message: MSG.vat_period_one_of })
  readonly periodChoice?: never;
}
