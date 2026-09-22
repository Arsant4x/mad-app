import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** التسويةُ البنكية (`ق-١٢٦١` ج) — مدى الكشف والدفتر معاً. */
export class ReconciliationQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class MatchStatementLineDto {
  @IsString()
  transactionId!: string;

  @IsString()
  lineId!: string;
}

export class UnmatchStatementLineDto {
  @IsString()
  transactionId!: string;
}

/** سطرُ كشفٍ بلا دفتر: يُرحَّل بطرفٍ يختاره المحاسب — لا يُخترع (`ق-٢٨١`). */
export class PostStatementLineDto {
  @IsString()
  transactionId!: string;

  @IsString()
  counterpartyAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class CloseReconciliationDto {
  @IsDateString()
  until!: string;
}
