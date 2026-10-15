import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../password/password-policy';

/**
 * ⚖️ `ق-١٣٨٣` — **في ملفّ `.dto.ts` لا في المتحكّم**: مُلحَقُ `@nestjs/swagger` يقرأ هذه اللاحقةَ وحدَها
 * (`nest-cli.json`)، فالصنفُ في المتحكّم كان يُولَّد في الوثيقة **مخطَّطاً بلا خاصيّة** — والحقلُ إلزاميٌّ وقتَ التشغيل أصلاً.
 */
export class MfaCodeDto {
  /** الرمزُ من التطبيق (ستُّ خانات) أو رمزُ استرداد — والخدمةُ تميّزهما. */
  @IsString()
  @MinLength(6)
  code!: string;

  /** The account's current password: turning the second factor on or off changes the sign-in credentials. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;
}
