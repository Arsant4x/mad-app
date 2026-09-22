import { ArrayMaxSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** تسويةُ الشبكة `1251` (`ق-١٢٦١` ج — ⑦A2): الإجماليُّ من السندات، والعمولةُ وضريبتُها من إشعار المستحوذ. */
export class CreateNetworkSettlementDto {
  @IsString()
  bankId!: string;

  /** يومُ دخول التحصيل إلى البنك. */
  @IsDateString()
  date!: string;

  /** مدى سندات القبض التي تطالب بها التسوية — بتاريخ السند. */
  @IsDateString()
  periodFrom!: string;

  @IsDateString()
  periodTo!: string;

  @IsNumber()
  @Min(0)
  feeAmount!: number;

  /** ضريبةُ القيمة المضافة على العمولة — تُدخَل لا تُفترض (صفرٌ جائز). */
  @IsNumber()
  @Min(0)
  feeVatAmount!: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;

  /** حصرُ المطالبة بسنداتٍ بعينها من المدى — للاستثناء عند نزاعٍ على سطر. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  receiptIds?: string[];
}

export class OpenNetworkReceiptsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class VoidNetworkSettlementDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
