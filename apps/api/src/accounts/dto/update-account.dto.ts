import { IsDateString, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: (typeof ACCOUNT_TYPES)[number];

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  /** تاريخُ الافتتاح المعلَن (`ق-٢٩٦`) — يُقبل ما دام الحساب بلا حركةٍ غير افتتاحيّه. */
  @IsOptional()
  @IsDateString()
  openingDate?: string;
}
