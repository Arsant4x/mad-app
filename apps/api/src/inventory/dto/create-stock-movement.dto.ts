import { BranchFieldDto } from '../../branches/dto/branch-field.dto';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'] as const;

export class CreateStockMovementDto extends BranchFieldDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  toWarehouseId?: string;

  @IsIn(STOCK_MOVEMENT_TYPES)
  type!: (typeof STOCK_MOVEMENT_TYPES)[number];

  @IsNumber()
  qty!: number;

  @IsDateString()
  date!: string;

  /**
   * ⭐ `ق-١٣٧٧` — **السببُ إلزاميٌّ من اليوم**: قِيست الحركاتُ اليدويةُ القائمة فكانت **كلُّها بلا سبب** (التطوير `409` ·
   * النظيفة `13`) — فالحقلُ الاختياريّ لم يُملأ قطّ. ويُرفض الفارغُ هنا والمسافاتُ في الخدمة، **وقيدٌ في القاعدة يحبس
   * ما بعد لحظة الهجرة** (`§6.6` طبقتان)؛ والقائمُ يُعدّ ولا يُملأ بسببٍ مخترَع.
   */
  @IsString()
  @IsNotEmpty()
  reason!: string;

  /**
   * تكلفةُ الوحدة لما يدخل المخزونَ يدوياً (`IN` أو تسويةٌ موجبة) — **تُدخَل أو يُرفض** (ق-١٠٦٣/٣):
   * لا تؤخذ من بطاقة الصنف، فصفرُ البطاقة صفرٌ صامتٌ يصير تكلفةَ مبيعاتٍ لاحقاً. والصفرُ المُدخَل
   * صراحةً مقبول (عيّناتٌ مجّانية) — المرفوضُ هو الغياب.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  /// Batch/lot number and expiry — used on receiving (IN) perishables.
  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
