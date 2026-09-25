import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  /** ⑧ فئةُ ضريبة القيمة المضافة (`S` · `Z` · `E` · `O`) — تُعلَن عند الإنشاء ولا تُخمَّن؛ غيابُها يُردّ في الخدمة باسمه. */
  @IsOptional()
  @IsIn(['S', 'Z', 'E', 'O'])
  taxCategory?: 'S' | 'Z' | 'E' | 'O';

  /**
   * ⑧ رمزُ سبب الإعفاء من قائمة الهيئة — إلزاميٌّ لـ`Z`/`E`، ممنوعٌ على `S`؛ يُفحص في الخدمة من المصدر الواحد.
   * و`null` مقبولٌ (`@IsOptional` يتخطّاه) وتُرسله الواجهةُ لما لا ينطبق — فيُعلَن في النوع كي تقوله الوثيقةُ والمولَّد (`ق-١٤٠٤`).
   */
  @IsOptional()
  @IsString()
  taxExemptionReasonCode?: string | null;

  /** ⑧ نصُّ سبب «خارج النطاق» لـ`O` وحدَه — ٣ إلى ٢٥٠ حرفاً بعد القصّ (`ق-١٢٢٢`). و`null` كالرمز. */
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
