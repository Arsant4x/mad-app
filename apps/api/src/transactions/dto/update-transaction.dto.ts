import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateTransactionDto extends CurrencyFieldsDto {
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  source?: string;
}
