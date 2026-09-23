import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';
import { VatDeclarationQueryDto } from './vat-declaration-query.dto';

/**
 * ⑥A3 (`ق-١٣٢٥`) — **إعلانُ تصحيحٍ لإقرارٍ سابق** (م٦٣/٢–٣).
 *
 * يرث الفترةَ الحاملة من استعلام الإقرار (ربعٌ أو شهر، أحدُهما)، ويحمل **الفترةَ المصحَّحة**
 * بنوعها ورقمها — فمنشأةٌ انتقلت من الربعيّ إلى الشهريّ تصحّح ربعاً من إقرارٍ شهريّ.
 */
export class DeclareVatCorrectionDto extends VatDeclarationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  correctedYear!: number;

  @IsIn(['QUARTERLY', 'MONTHLY'])
  correctedPeriodType!: 'QUARTERLY' | 'MONTHLY';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  correctedPeriodNo!: number;

  /** موجبٌ: نقصٌ سابقٌ يُستدرك · سالب: زيادةٌ سابقةٌ تُردّ. **والصفرُ يمنعه قيدٌ في القاعدة**. */
  @Type(() => Number)
  @IsNumber()
  amount!: number;

  /** سببُ التصحيح — **إلزاميّ**: تصحيحٌ بلا سببٍ لا يُراجَع ولا يُدافَع عنه أمام الهيئة. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
