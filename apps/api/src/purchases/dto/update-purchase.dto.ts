import { Type } from 'class-transformer';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { PURCHASE_CATEGORY_CODES } from '../../common/purchase-categories';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { PurchaseLineDto } from './purchase-line.dto';

export class UpdatePurchaseDto extends CurrencyFieldsDto {
  /**
   * البنودُ — **تُعدَّل قبل أيّ استهلاكٍ وحدَه** (`ق-٩٩٧`/①): يُعكس استلامُ القديم بحركةٍ خارجة ويُستلم الجديد،
   * والقديمُ يُحفظ متجاوَزاً. وبعد استهلاكٍ ولو جزئيّ تُرفض مع الإجمالي والعملة وسعرها بـ`409` يسمّي المخرج.
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines?: PurchaseLineDto[];

  /** مستودعُ الاستلام الجديد عند تعديل البنود — وإلا فمستودعُ الاستلام الأصليّ ثم مستودعُ الفرع. */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** رقمُ فاتورة المورّد — مرجعٌ خارجيّ يُعدَّل على الشراء (لا على الإشعار: مرحَّلٌ لا يُمسّ). */
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

  // ⛔ لا `paid` ولا `paidDate` هنا (`ق-٨٧٤`): السدادُ سندُ صرفٍ يُرحَّل (`POST /supplier-payments`)،
  // والحالةُ مشتقّةٌ من تخصيصاته. وعميلٌ يرسل العلَمَ القديم يُردّ بـ400 من الصمّام لا يُتجاهل صامتاً.
}
