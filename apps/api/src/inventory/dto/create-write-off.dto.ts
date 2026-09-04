import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { BranchFieldDto } from '../../branches/dto/branch-field.dto';

/**
 * تسجيل واقعة شطب — **والسبب حقلٌ إلزامي لا اختياري**.
 *
 * ⚠️ **ولا `@IsIn(WRITEOFF_REASON_CODES)` هنا عمداً**: التحقّق يقع في الخدمة
 * عبر `writeOffReason` من المصدر الواحد. فقائمةٌ في المُزخرِف تصير **نسخةً
 * ثانية**، ورمزٌ يُضاف غداً يمرّ من أحدهما ويسقط في الآخر — وأسوأ ما فيه أن
 * الرسالة تكون «قيمة غير مقبولة» بلا ذكر السبب الحقيقي.
 */
export class CreateWriteOffDto extends BranchFieldDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsNumber()
  @IsPositive()
  qty!: number;

  /** رمزٌ من `WRITEOFF_REASONS` — يُتحقَّق منه في الخدمة. */
  @IsString()
  @IsNotEmpty()
  reasonCode!: string;

  /** تاريخ **وقوع** التلف — لا تاريخ التسجيل (`ق-١٢٩`). */
  @IsDateString()
  occurredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
