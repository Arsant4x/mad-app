import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { ALLOWED_SCREENS } from '../../templates/screens';

/**
 * ⚖️ `ق-١٣٨٣` — **في ملفّ `.dto.ts` لا في المتحكّم**: مُلحَقُ `@nestjs/swagger` يقرأ هذه اللاحقةَ وحدَها
 * (`nest-cli.json`)، فالصنفُ في المتحكّم كان يُولَّد في الوثيقة **مخطَّطاً بلا خاصيّة** — والحقولُ إلزاميةٌ وقتَ التشغيل أصلاً.
 */
export class RequestSupportAccessDto {
  @IsString()
  companyId!: string;

  /** يظهر للمالك حرفياً — سببٌ فارغ لا يستحق موافقة. */
  @IsString()
  @MinLength(5)
  reason!: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  /**
   * **نطاقُ ما يُرى** (`ق-٥٢٧`) — شاشاتٌ من `ALLOWED_SCREENS` **مقروءةً لا
   * منسوخة**، واحدةٌ على الأقلّ: إذنٌ بلا نطاقٍ ليس تعليمةً (اللائحة م١٧/١/ب).
   * ⚠️ والشكلُ معلَنٌ صراحةً — المُلحَقُ يُسقط `each` من `@IsIn` فيصفها نصّاً واحداً (`ق-١٤٠٤`).
   */
  @ApiProperty({ enum: [...ALLOWED_SCREENS], isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ALLOWED_SCREENS as readonly string[], { each: true })
  screens!: string[];
}
