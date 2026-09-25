import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  category?: string;

  /** إعلانُ الوحدة للقائم أو تغييرُها — رمزٌ من القائمة المغلقة، يُفحص في الخدمة. */
  @IsOptional()
  @IsString()
  unitCode?: string;

  /** ٥+٦ إعلانُ التتبّع للقائم عند لمس الصنف — نعم أو لا. */
  @IsOptional()
  @IsBoolean()
  expiryTracked?: boolean;

  /** ⑧ إعلانُ الفئة للقائم (`LEGACY_STANDARD` ⟵ `S`/`Z`/`E`/`O`) أو تغييرُها — ولا يُعاد صنفٌ إلى القيمة القديمة. */
  @IsOptional()
  @IsIn(['S', 'Z', 'E', 'O'])
  taxCategory?: 'S' | 'Z' | 'E' | 'O';

  /** و`null` **يمحو** القائم (الخدمةُ تدمج ما لم يُرسَل مع القائم — فتغييرُ `Z` إلى `S` يحتاج `null` صريحاً) — معلَنٌ في النوع (`ق-١٤٠٤`). */
  @IsOptional()
  @IsString()
  taxExemptionReasonCode?: string | null;

  @IsOptional()
  @IsString()
  taxExemptionReason?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  barcode?: string;
}
