import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ReportRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** ميزان المراجعة (10.4): فترة + فرع اختياري — «أو مجمَّع» عند غيابه. */
export class TrialBalanceDto extends ReportRangeDto {
  @IsOptional()
  @IsString()
  branchId?: string;
}
