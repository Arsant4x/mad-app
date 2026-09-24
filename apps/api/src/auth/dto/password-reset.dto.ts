import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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

  /// Same floor as account creation: 8+ characters.
  @IsString()
  @MinLength(8)
  @MaxLength(200)
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
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  /// Optional but strongly encouraged — it's what password recovery uses.
  @IsOptional()
  @IsEmail()
  email?: string;

  /// 🔴 `ق-١٣٦٨` — دولةُ المنشأة (ISO 3166-1 alpha-2). اختياريّةٌ ما دامت المنصّةُ تخدم إقليماً واحداً، وتصير إلزاميةً وحدَها حين
  /// يُضاف ثانٍ (`regionForNewCompany`). والتحقّقُ من دعمها هناك لا هنا — فرسالتُه تسمّي الدولة.
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country?: string;
}
