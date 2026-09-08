import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const;

export class CreateAccountDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(ACCOUNT_TYPES)
  type!: (typeof ACCOUNT_TYPES)[number];

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  /**
   * تاريخُ الافتتاح **الذي يعلنه التاجر** (`ق-٢٩٦`) — اختياريّ.
   * غيابُه يعني «لم يُعلَن»، فيُشتقّ كما كان **ويبقى العمودُ فارغاً**.
   */
  @IsOptional()
  @IsDateString()
  openingDate?: string;
}
