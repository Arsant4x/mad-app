import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdatePurchaseDto extends CurrencyFieldsDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  subtotal?: number;

  @IsOptional()
  @IsBoolean()
  exempt?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeFromVat?: boolean;

  @IsOptional()
  @IsBoolean()
  amortize?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  amortizeMonths?: number;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsDateString()
  paidDate?: string;
}
