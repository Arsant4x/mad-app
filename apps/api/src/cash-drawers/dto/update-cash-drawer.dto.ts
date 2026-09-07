import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCashDrawerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  /** التعطيل مشروط (ق-٢٦٥): لا مناوبةً مفتوحة، ولا رصيداً غير صفر. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
