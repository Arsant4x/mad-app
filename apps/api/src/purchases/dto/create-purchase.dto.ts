import { Type } from 'class-transformer';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { PurchaseLineDto } from './purchase-line.dto';

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

  /**
   * بنود الشراء — **اختيارية في هذه الموجة، وستصير المصدر في التي بعدها**.
   *
   * ⚠️ **ولا تُغيّر الإجماليات**: `subtotal` يبقى مصدر الترحيل كما كان، ولا
   * يُشتقّ من البنود هنا. اشتقاقُه تغييرٌ في الترحيل، وهذه الموجة لا تمسّه.
   * فمن أرسل بنوداً لا تطابق `subtotal` **تُقبل منه** — والمطابقة تأتي مع
   * الموجة التي تجعل البنود مصدر الحقيقة.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines?: PurchaseLineDto[];
}
