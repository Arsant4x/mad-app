import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SECTORS } from '../sectors';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /// Free text (عقارات | مطاعم | صيدلية …) rather than an enum: the behaviour
  /// tied to an activity lives in code, and a company must be able to describe
  /// a line of business we didn't anticipate.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  activityType?: string;

  /**
   * القطاع — **مقروءٌ من  لا منسوخاً هنا**. قائمةٌ منسوخة
   * تفترق عن مصدرها عند أول قطاع جديد، وهي عائلة الخمسة عشر اسماً.
   *
   * ⚠️ ولا يُقبل `sectorSuggested` من العميل: الاقتراح تكتبه المطابقة
   * الآلية وحدها، والتأكيد يُكتب هنا. وقبولُه من الخارج يمحو الفرق بين
   * «رشّحه الحاسوب» و«أكّده الإنسان».
   */
  @IsOptional()
  @IsIn(SECTORS as readonly string[])
  sector?: string;
}
