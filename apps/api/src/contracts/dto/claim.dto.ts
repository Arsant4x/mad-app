import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Matches, Min } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

/** At least one non-whitespace character. */
const NON_BLANK = /\S/;

const CLAIM_KINDS = ['MAINTENANCE', 'UTILITIES', 'LATE_FEE', 'DAMAGE', 'OTHER'] as const;

export class CreateClaimDto extends CurrencyFieldsDto {
  @IsIn(CLAIM_KINDS)
  kind!: (typeof CLAIM_KINDS)[number];

  @IsNumber()
  @IsPositive()
  amount!: number;

  /// Required, like a deposit deduction's reason: an unexplained demand for
  /// money is what turns into a dispute.
  ///
  /// `@IsNotEmpty` alone is not enough — it passes a string of spaces, which
  /// the service then trims to nothing, leaving exactly the unexplained claim
  /// this field exists to prevent.
  @IsString()
  @Matches(NON_BLANK)
  description!: string;

  @IsDateString()
  issuedAt!: string;
}

export class PayClaimDto {
  @IsDateString()
  paidAt!: string;

  /// ⚖️ سعرُ صرف يوم التحصيل (`ق-١٤٨٩` · B7) — **إلزاميٌّ لمطالبةٍ بعملةٍ غير عملة الأساس**، وغيابُه يُرفض برسالةٍ
  /// مسمّاة: سعرُ المطالبة افتراضاً يطوي فرقَ السوق في النقدية. والنقدُ يُقوَّم به، والفرقُ عن سعر المطالبة على `5600`.
  /// ولمطالبةٍ بعملة الأساس لا يُقرأ — سعرُها سعرُ يومها بالتعريف. ولا عملةَ تُرسل: النقدُ بعملة المطالبة نفسِها.
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  exchangeRate?: number;
}

export class WaiveClaimDto {
  @IsDateString()
  waivedAt!: string;

  /// Writing off money owed is a decision someone has to answer for later.
  @IsString()
  @Matches(NON_BLANK)
  reason!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
