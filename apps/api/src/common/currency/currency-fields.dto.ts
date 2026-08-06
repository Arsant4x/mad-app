import { IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';
import { BranchFieldDto } from '../../branches/dto/branch-field.dto';

/**
 * The two currency fields every money-carrying DTO accepts. Both optional:
 * omitting them means the company's base currency at parity, which is what a
 * single-currency business always wants — so no existing caller has to change.
 *
 * The rate is deliberately taken from the caller rather than looked up here:
 * it must be the rate **as of the transaction**, and only the caller knows
 * whether this is a document being written today or one being back-dated.
 *
 * Extends BranchFieldDto because every money document is also attributable to
 * a branch — that way one rule covers both: any DTO that can carry a branch
 * extends BranchFieldDto, directly or through this class.
 */
export class CurrencyFieldsDto extends BranchFieldDto {
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  /// A rate can be far below 1 (e.g. JPY→SAR), so the floor is just "positive".
  @IsOptional()
  @IsNumber()
  @Min(0.000001)
  exchangeRate?: number;
}
