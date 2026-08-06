import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateFiscalYearDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /// A full date, not a month number: a Saudi fiscal year does not have to
  /// begin in January (CLAUDE.md 6.9). Twelve monthly periods are generated
  /// forward from this date.
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;
}
