import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

const DIRECTIONS = ['RECEIVED', 'PAID'] as const;

export class RecordKeyMoneyDto extends CurrencyFieldsDto {
  /// Decides the whole accounting treatment, not just a label: received is
  /// income, paid is an asset.
  @IsIn(DIRECTIONS)
  direction!: (typeof DIRECTIONS)[number];

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsDateString()
  paidAt!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
