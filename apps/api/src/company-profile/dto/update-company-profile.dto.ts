import { IsEmail, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';

export class UpdateCompanyProfileDto {
  @IsString()
  @MinLength(1)
  legalName!: string;

  /// 15 digits, must start and end with '3' (the Saudi VAT number format).
  /// @ValidateIf skips the @Matches check for '' (treated as "clear the
  /// field") and for omitted values (handled by @IsOptional) — only a
  /// genuinely non-empty value gets format-checked.
  @IsOptional()
  @ValidateIf((o) => !!o.vatNumber)
  @Matches(/^3\d{13}3$/, { message: 'الرقم الضريبي يجب أن يتكوّن من 15 رقماً ويبدأ وينتهي بالرقم 3' })
  vatNumber?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.crNumber)
  @Matches(/^\d{10}$/, { message: 'رقم السجل التجاري يجب أن يتكوّن من 10 أرقام بالضبط' })
  crNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.email)
  @IsEmail({}, { message: 'صيغة البريد الإلكتروني غير صحيحة' })
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
