import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/** إيداعُ نقدِ درجٍ في بنك عبر «نقدٍ في الطريق» (`ق-١٢٦١` ج — ⑦A3). */
export class CreateCashDepositDto {
  @IsString()
  drawerId!: string;

  @IsString()
  bankId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class VoidCashDepositDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
