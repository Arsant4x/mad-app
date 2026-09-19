import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

/** سطرُ استلام: سطرُ شراءٍ وكمّيةٌ وصلت منه — لا تتجاوز ما بقي (الخدمة تردّ مسمّىً). */
export class GoodsReceiptLineDto {
  @IsUUID()
  purchaseLineId!: string;

  @IsNumber()
  @Min(0.001)
  quantity!: number;

  /** ٥+٦ دفعةٌ تختلف عمّا على سطر الشراء (وصلت بدفعةٍ أخرى) — وإلا فدفعةُ السطر. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

/**
 * ٢٥ استلامٌ مسجَّل على شراءٍ قائم (`ق-١١٢٢`/②): جزئيٌّ أو مكمِّل، بتاريخِ وصولٍ هو تاريخُ الطبقة.
 * لا `purchaseId` هنا — يأتي من المسار (`POST /purchases/:id/receipts`)، فالاستلامُ قبل الفاتورة مؤجَّل (④).
 */
export class CreateGoodsReceiptDto {
  @IsDateString()
  receivedAt!: string;

  /** مستودعُ الاستلام — وإلا فمستودعُ فرع الشراء. */
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}
