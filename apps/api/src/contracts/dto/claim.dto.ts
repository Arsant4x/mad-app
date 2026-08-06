import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Matches } from 'class-validator';
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
