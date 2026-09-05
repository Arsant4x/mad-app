import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
import { InvoiceLineDto } from './invoice-line.dto';

export class CreateInvoiceDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsDateString()
  issueDate!: string;

  /**
   * لحظةُ الإصدار عند الجهاز (ISO) **وانحرافُه عن UTC بالدقائق** — يأتيان معاً أو
   * لا يأتيان (`ق-١٨٥`): **انحرافٌ بلا لحظةٍ يُرفَض** — لا معنى له وحده؛ ولحظةٌ بلا
   * انحراف تُحفظ ولا تُعطي يومَ التاجر فيُصدَر المستند بيومه و`00:00:00`. غيابهما =
   * مستندٌ مؤرَّخٌ بيدٍ بلا وقت.
   */
  @ValidateIf((o: CreateInvoiceDto) => o.issuedAt !== undefined || o.issuedOffsetMin !== undefined)
  @IsDateString()
  issuedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  issuedOffsetMin?: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines!: InvoiceLineDto[];
}
