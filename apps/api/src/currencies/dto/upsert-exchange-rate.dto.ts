import { IsDateString, IsPositive, Length, Matches } from 'class-validator';

export class UpsertExchangeRateDto {
  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  fromCode!: string;

  @Length(3, 3)
  @Matches(/^[A-Za-z]{3}$/)
  toCode!: string;

  @IsPositive()
  rate!: number;

  /// The date the rate applied on — this is the whole point of the table:
  /// a posted document must always be traceable to the rate of its own day.
  @IsDateString()
  date!: string;
}
