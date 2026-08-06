import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBankDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsDateString()
  openingDate!: string;
}
