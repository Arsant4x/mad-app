import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreatePurchaseDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNumber()
  @Min(0.01)
  subtotal!: number;

  @IsOptional()
  @IsBoolean()
  exempt?: boolean;

  /// VAT charged but no valid tax invoice → drop from the VAT declaration.
  @IsOptional()
  @IsBoolean()
  excludeFromVat?: boolean;

  /// Only meaningful when category = 'مصروفات تأسيس'; enforced in the service.
  @IsOptional()
  @IsBoolean()
  amortize?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  amortizeMonths?: number;

  /// Establishment-expense line item, for the incorporation report.
  @IsOptional()
  @IsString()
  incorpItem?: string;
}
