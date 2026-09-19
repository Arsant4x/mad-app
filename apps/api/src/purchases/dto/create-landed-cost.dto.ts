import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

/** نصيبُ طبقةٍ بعينها — للتوزيع اليدويّ وحدَه (`MANUAL`)، ومجموعُ الأنصبة قيمةُ السطر. */
export class LandedCostManualLineDto {
  @IsUUID()
  layerId!: string;

  @IsNumber()
  @Min(0)
  baseAmount!: number;
}

/**
 * ٧ توزيعُ سطرِ شراءٍ خدميّ (شحنٌ · تخليصٌ · رسومٌ جمركية) على طبقاتٍ مسمّاة (`ق-١١٤٥`).
 * لا `purchaseId` هنا — يأتي من المسار (`POST /purchases/:id/landed-costs`)؛ والسطرُ سطرُ ذلك الشراء.
 * الطبقاتُ تُسمّى بمعرّفاتها **أو** باستلاماتها (فتُؤخذ طبقاتُ سطورها كلُّها) — أو بالاثنين.
 */
export class CreateLandedCostDto {
  @IsUUID()
  purchaseLineId!: string;

  /** بالقيمة (الافتراض) · بالكمّية · يدوياً. */
  @IsOptional()
  @IsIn(['VALUE', 'QUANTITY', 'MANUAL'])
  method?: 'VALUE' | 'QUANTITY' | 'MANUAL';

  /** تاريخُ التوزيع (تاريخُ قيده) — وإلا فتاريخُ الشراء الخدميّ. */
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  layerIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  goodsReceiptIds?: string[];

  /** للتوزيع اليدويّ: نصيبُ كلِّ طبقة. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => LandedCostManualLineDto)
  lines?: LandedCostManualLineDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
