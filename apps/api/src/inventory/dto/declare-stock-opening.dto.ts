import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { BranchFieldDto } from '../../branches/dto/branch-field.dto';

/**
 * ٣٠ سطرُ إعلانٍ افتتاحيّ — ما على الرفّ يومَ الدخول، سطراً سطراً (`ق-١١٧٧`):
 * الصنفُ والمستودعُ والكمّيةُ **بوحدة الصنف** وتكلفةُ الوحدة **صريحةً** (الصفرُ الصريح مقبول — عيّناتٌ
 * مجّانية؛ المرفوضُ الغياب) وتاريخُ الاقتناء (`≤` تاريخ الافتتاح — به يُرتَّب `FIFO`)، والدفعةُ والانتهاءُ
 * بالقاعدة القائمة (معلَنُ التتبّع بلا دفعةٍ يُرفض)، والسندُ اختياريٌّ — غيابُه يُعلَن لا يُمنع.
 */
export class StockOpeningLineDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsNumber()
  @Min(0.001)
  qty!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsDateString()
  acquiredAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  /** رقمُ فاتورةٍ أو مرجعُ سندٍ — اختياريّ؛ وبلا سندٍ يُعلَن السطرُ «بلا سند» في تقرير الافتتاح. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  evidenceRef?: string;
}

/**
 * إعلانُ الرصيد الافتتاحي للمخزون. `openingDate` تاريخُ القيد — واحدٌ للمنشأة: يُعلَن مرّةً أو يُشتقّ من بداية
 * السنة المالية التي تغطّي اليوم (كما `3.8`)؛ والإعلاناتُ اللاحقة تحمل التاريخَ نفسَه أو تُردّ مسمّاةً.
 */
export class DeclareStockOpeningDto extends BranchFieldDto {
  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StockOpeningLineDto)
  lines!: StockOpeningLineDto[];
}
