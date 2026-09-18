import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  category?: string;

  /** ① وحدةُ القياس الأساس — رمزٌ من القائمة المغلقة (`common/units/units.ts`). مطلوبٌ عند
   * الإنشاء ويُفحص في الخدمة برسالةٍ مسمّاة؛ ولا يُقبل نصٌّ حرّ بعد اليوم. */
  @IsOptional()
  @IsString()
  unitCode?: string;

  /** ٥+٦ «يُتتبَّع بالدفعة والانتهاء؟» — علَمٌ ثنائيّ يُعلَن عند الإنشاء ولا يُخمَّن؛ غيابُه يُردّ في الخدمة باسمه. */
  @IsOptional()
  @IsBoolean()
  expiryTracked?: boolean;

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
