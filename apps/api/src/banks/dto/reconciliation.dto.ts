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

  /** الطرفُ المقابل — يُهمَل حين يُقدَّم `depositId` (الطرفُ حينها `1190` حتماً). */
  @IsOptional()
  @IsString()
  counterpartyAccountId?: string;

  /** تأكيدُ إيداع درجٍ في الطريق (⑦A3): السطرُ بمبلغ الإيداع نفسِه، والطرفُ `1190`. */
  @IsOptional()
  @IsString()
  depositId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}

export class CloseReconciliationDto {
  @IsDateString()
  until!: string;
}
