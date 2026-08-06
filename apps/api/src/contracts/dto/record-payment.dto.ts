import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RecordPaymentDto extends CurrencyFieldsDto {
  @IsOptional()
  @IsString()
  installmentId?: string;

  @IsString()
  @IsNotEmpty()
  date!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @IsIn(['CASH', 'BANK'])
  method!: 'CASH' | 'BANK';

  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
