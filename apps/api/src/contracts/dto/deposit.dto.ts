import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

const DEPOSIT_TYPES = ['RENT', 'FACILITY'] as const;
const DEPOSIT_HOLDERS = ['COMPANY', 'EJAR'] as const;
const DEDUCTION_KINDS = ['UNPAID_RENT', 'DAMAGE', 'UTILITIES', 'CLEANING', 'OTHER'] as const;

export class RecordDepositDto extends CurrencyFieldsDto {
  @IsIn(DEPOSIT_TYPES)
  type!: (typeof DEPOSIT_TYPES)[number];

  /// Defaults to COMPANY — the older behaviour, and the one that posts. Set to
  /// EJAR when the platform is blocking the money and the company never
  /// received it; nothing is posted to the ledger in that case.
  @IsOptional()
  @IsIn(DEPOSIT_HOLDERS)
  holder?: (typeof DEPOSIT_HOLDERS)[number];

  /// Cash actually received. A zero deposit is not a deposit, so it is rejected
  /// rather than silently recorded as an unposted row.
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class DeductionDto {
  @IsIn(DEDUCTION_KINDS)
  kind!: (typeof DEDUCTION_KINDS)[number];

  @IsNumber()
  @Min(0.01)
  amount!: number;

  /// Required, not optional: a deduction the tenant cannot see a reason for is
  /// the thing that turns into a dispute. Matched against a non-whitespace
  /// pattern rather than @IsNotEmpty, which happily accepts a run of spaces.
  @IsString()
  @Matches(/\S/)
  reason!: string;
}

export class SettleDepositDto {
  @IsDateString()
  settledAt!: string;

  /// May be empty — settling with no deductions is a full refund, which is the
  /// common case and must not require an inventing a zero line.
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => DeductionDto)
  deductions!: DeductionDto[];

  /// ⚖️ سعرُ صرف يوم التسوية (`ق-١٤٨٩` · B8) — **إلزاميٌّ لوديعةٍ بعملةٍ غير عملة الأساس متى تحرّك نقد**: ردٌّ للمستأجر
  /// من وديعةٍ تحتجزها المنشأة، أو ما تُفرج عنه «إيجار» للمنشأة. وغيابُه حينها يُرفض برسالةٍ مسمّاة — سعرُ الوديعة
  /// افتراضاً يطوي فرقَ السوق في النقدية. ولا يُقرأ حيث لا نقد (خصمٌ كامل) ولا لوديعةٍ بعملة الأساس.
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  exchangeRate?: number;
}
