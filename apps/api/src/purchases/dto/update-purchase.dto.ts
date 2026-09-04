import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { PURCHASE_CATEGORY_CODES } from '../../common/purchase-categories';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

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

  /** لافتةٌ حرّة — تُقبل للتوافق مع عملاء قدامى، ويُشتقّ منها الرمز. */
  @IsOptional()
  @IsString()
  category?: string;

  /** الرمز المعتمَد. `IsIn` يرفض المخترَع بدل أن يُرحَّل إلى المستقرّ صامتاً. */
  @IsOptional()
  @IsIn(PURCHASE_CATEGORY_CODES as string[])
  categoryCode?: string;

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

  /// Establishment-expense line item, for the incorporation report.
  @IsOptional()
  @IsString()
  incorpItem?: string;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsDateString()
  paidDate?: string;
}
