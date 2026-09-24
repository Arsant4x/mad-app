import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  orgName!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
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
