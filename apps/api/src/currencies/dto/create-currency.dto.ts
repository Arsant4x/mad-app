import { IsNotEmpty, IsOptional, IsPositive, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateCurrencyDto {
  /// ISO 4217, upper-cased before storage so "usd" and "USD" can't coexist.
  @IsString()
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  symbol?: string;

  /// Units of this currency per one unit of the base currency. Optional at
  /// creation — a merchant may add the currency first and set the rate later.
  @IsOptional()
  @IsPositive()
  rate?: number;
}
