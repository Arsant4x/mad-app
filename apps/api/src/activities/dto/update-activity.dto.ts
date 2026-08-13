import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SECTORS } from '../sectors';

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  activityType?: string;

  /**
   * القطاع — **مقروءٌ من `SECTORS` لا منسوخاً هنا**. قائمةٌ منسوخة تفترق
   * عن مصدرها عند أول قطاع جديد، وهي عائلة الخمسة عشر اسماً المخترَعة.
   *
   * ⚠️ ولا يُقبل `sectorSuggested` من العميل: الاقتراح تكتبه المطابقة
   * الآلية وحدها، والتأكيد يُكتب هنا. وقبولُه من الخارج يمحو الفرق بين
   * «رشّحه الحاسوب» و«أكّده الإنسان».
   */
  @IsOptional()
  @IsIn(SECTORS as readonly string[])
  sector?: string;

  /**
   * التعطيل لا الحذف: `true` يُخفي شاشات النشاط و**يُبقي بياناته كما هي**.
   *
   * ⚠️ وعقودُ منشأةٍ عطّلت «عقارات» لا تُحذف ولا تُخفى من التقارير —
   * تختفي شاشتها فقط. وإخفاؤها من التقارير يجعل ميزان المراجعة يكذب.
   *
   * و`false` يُعيد التفعيل فوراً — في الطلب التالي بلا إعادة دخول.
   */
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}
