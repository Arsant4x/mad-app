import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password/password-policy';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  orgName!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  /// Length and content rules are checked by the service (common/password).
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @IsString()
  permissionTemplateId!: string;

  @IsOptional()
  @IsISO8601()
  subStart?: string;

  @IsOptional()
  @IsISO8601()
  subEnd?: string;

  /// 🔴 `ق-١٣٦٨` — دولةُ المنشأة (ISO 3166-1 alpha-2) — كالتسجيل الذاتيّ: اختياريّةٌ ما دام الإقليمُ واحداً.
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2)
  country?: string;
}
