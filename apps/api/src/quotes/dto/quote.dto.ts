import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

/** بند عرض — بشكل بند الفاتورة حرفياً، فالتحويل نقلٌ لا إعادة إدخال. */
export class QuoteLineDto {
  @IsString()
  description!: string;

  /**
   * الصنف — يُحمل هنا للسبب نفسه الذي حُمل لأجله في بند الفاتورة: **العرض
   * الذي يتحوّل فاتورةً يجب أن يُسلّم ما عرضه، لا صياغته فقط.** وبدونه
   * يُعاد اختيار الصنف يدوياً عند التحويل، وخطأُ الاختيار هناك **تكلفةٌ
   * خاطئة لا تسميةٌ خاطئة**.
   */
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  /** ④B1 — خصمٌ على السطر مبلغاً؛ ينتقل إلى الفاتورة عند التحويل. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  /** ⑧ مشتقّةٌ من الفئة — كما في بند الفاتورة: تُقبل مساويةً الأساسية إعلاناً لـ`S`، وتُطابَق مع فئةٍ معلَنة. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxRate?: number;

  /** ⑧ الفئةُ لبندٍ بلا صنف؛ وبندٌ بصنفٍ يرثها من بطاقته لحظةَ كتابة العرض. */
  @IsOptional()
  @IsIn(['S', 'Z', 'E', 'O'])
  taxCategory?: 'S' | 'Z' | 'E' | 'O';

  @IsOptional()
  @IsString()
  taxExemptionReasonCode?: string;

  @IsOptional()
  @IsString()
  taxExemptionReason?: string;
}

export class CreateQuoteDto extends CurrencyFieldsDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsDateString()
  issueDate!: string;

  /** آخر يوم يصلح فيه التحويل. */
  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];
}

/** تعديل مسودة/مرسَل فقط — المحوَّل صخرة. */
export class UpdateQuoteDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'SENT'])
  status?: 'DRAFT' | 'SENT';

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines?: QuoteLineDto[];
}
