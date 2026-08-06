import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  bankId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  source?: string;
}
