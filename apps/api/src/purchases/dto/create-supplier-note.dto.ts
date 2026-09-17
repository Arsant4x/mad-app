import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

/**
 * سطرُ إشعارٍ من المورّد — مرآةُ سطر إشعار البيع: يشير إلى سطر الشراء الأصليّ (`returnsPurchaseLineId`)
 * ويقول إن كانت البضاعةُ **أُعيدت فعلاً** إلى المورّد (`goodsReturned`) أم أنه إشعارُ سعرٍ بلا بضاعة.
 * سطرٌ بلا إشارةٍ إلى الأصل إشعارٌ محاسبيٌّ لا يمسّ الرفّ.
 */
export class SupplierNoteLineDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  taxRate?: number;

  @IsOptional()
  @IsUUID()
  returnsPurchaseLineId?: string;

  @IsOptional()
  @IsBoolean()
  goodsReturned?: boolean;
}

/**
 * إشعارٌ من المورّد (دائنٌ أو مدين) على فاتورة شراء — **مستندُه هو، يُسجَّل لا يُصدَر** (`ق-١٠٠٦`/①):
 * رقمُه عندنا مرجعٌ خارجيّ (`supplierRef`)، وتاريخُه تاريخُ مستنده، ولا هيئةَ ولا ختمَ.
 */
export class CreateSupplierNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  /** تاريخُ مستند المورّد — يقرّر فترةَ تعديل المدخلات في الإقرار. فارغٌ ⇒ اليوم. */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** رقمُ إشعار المورّد كما على ورقته — مرجعٌ خارجيٌّ لا رقمُنا. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierRef?: string;

  /** فارغٌ ⇒ الإشعارُ الكامل من بنود الأصل (وفي الدائن: البضاعةُ المخزنيةُ تُعاد كلُّها). */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SupplierNoteLineDto)
  lines?: SupplierNoteLineDto[];
}
