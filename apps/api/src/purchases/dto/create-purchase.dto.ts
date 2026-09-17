import { Type } from 'class-transformer';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { PURCHASE_CATEGORY_CODES } from '../../common/purchase-categories';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
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

  /** رقمُ فاتورة المورّد كما على ورقته — مرجعٌ خارجيٌّ يُسجَّل، لا رقمٌ نُصدره (`ق-١٠٠٦`/①). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierRef?: string;

  /** لافتةٌ حرّة — تُقبل للتوافق مع عملاء قدامى، ويُشتقّ منها الرمز. */
  @IsOptional()
  @IsString()
  category?: string;

  /** الرمز المعتمَد. `IsIn` يرفض المخترَع بدل أن يُرحَّل إلى المستقرّ صامتاً. */
  @IsOptional()
  @IsIn(PURCHASE_CATEGORY_CODES as string[])
  categoryCode?: string;

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

  /**
   * مستودع الاستلام — يُشتقّ من الفرع إن تُرك فارغاً.
   *
   * ⚠️ وبندٌ مخزنيّ بلا مستودعٍ يُرفض ولا يُتخطّى: **البضاعة لا تُستلم في لا
   * مكان**، ومخزونٌ في الميزانية بلا طبقةٍ تقابله يجعل أول بيعٍ استهلاكاً
   * مؤقّتاً بلا سبب.
   */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;
}
