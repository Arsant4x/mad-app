import { IsString, MinLength } from 'class-validator';

/**
 * ⚖️ `ق-١٣٨٣` — **في ملفّ `.dto.ts` لا في المتحكّم**: مُلحَقُ `@nestjs/swagger` يقرأ هذه اللاحقةَ وحدَها
 * (`nest-cli.json`)، فالصنفُ في المتحكّم كان يُولَّد في الوثيقة **مخطَّطاً بلا خاصيّة** — والحقلُ إلزاميٌّ وقتَ التشغيل أصلاً.
 */
export class MfaCodeDto {
  /** الرمزُ من التطبيق (ستُّ خانات) أو رمزُ استرداد — والخدمةُ تميّزهما. */
  @IsString()
  @MinLength(6)
  code!: string;
}
