import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf, ValidateNested } from 'class-validator';
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

  /**
   * ⚖️ **تصريحٌ بتجاوز حدّ الائتمان** (`ق-٣٣٩` · `ق-٣٤٠`).
   *
   * ⚠️ **نيّةٌ لا إذن**: الخادمُ يتحقّق أن صاحبَها يملك `invoice:review`،
   * **ويرفض إن لم يملك**. **وغيابُها هو الغالب** — فالطلبُ الأول يُردّ برسالةٍ
   * تحمل الأرقام، **ثم يُعاد بها بعد أن يقرأ التاجرُ ما يتجاوزه**.
   *
   * **فلا يمرّ تجاوزٌ لم يقصده أحد** — وهو ما يجعل التحذيرَ فعلاً لا زخرفة.
   */
  @IsOptional()
  @IsBoolean()
  creditOverride?: boolean;

  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines!: InvoiceLineDto[];
}
