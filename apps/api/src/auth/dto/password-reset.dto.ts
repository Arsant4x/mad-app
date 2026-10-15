import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { MSG } from '../../common/i18n/messages';
import { PASSWORD_MAX_LENGTH } from '../../common/password/password-policy';

export class ForgotPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  username!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  /// The full password rules (common/password) are checked by the service, with the account's username.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  orgName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  username!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  /// Required: a password reset link is only ever sent to this address.
  @IsNotEmpty({ message: MSG.owner_email_required })
  @IsEmail({}, { message: MSG.email_invalid })
  email!: string;

  /// 🔴 `ق-١٣٦٨` — دولةُ المنشأة (ISO 3166-1 alpha-2). اختياريّةٌ ما دامت المنصّةُ تخدم إقليماً واحداً، وتصير إلزاميةً وحدَها حين
  /// يُضاف ثانٍ (`regionForNewCompany`). والتحقّقُ من دعمها هناك لا هنا — فرسالتُه تسمّي الدولة.
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country?: string;
}
