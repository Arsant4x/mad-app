import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

/** ⑥A1 (`ق-١٣٢٥`) — قراءةُ نسبة سنةٍ ومقترَحِها. */
export class VatRatioQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

/**
 * ⑥A1 — **إعلانُ نسبة الخصم النسبيّ لسنةٍ تقويمية** (م٥١/٤–٦).
 *
 * ⚠️ **يُعلنها التاجر ولا يكتبها النظام**: بياناتُنا قد لا تغطّي السنةَ الماضية كلَّها،
 * **ونسبةٌ من بياناتٍ ناقصة رقمٌ خاطئٌ بلا عَرَض**. فالخادمُ يحسب ويعرض، والتاجرُ يقرّ.
 */
export class DeclareVatRatioDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  /** كسرٌ بين صفرٍ وواحد — `0.75` تعني ٧٥٪. */
  @Type(() => Number)
  @IsNumber()
  @Min(0, { message: MSG.vat_ratio_range })
  @Max(1, { message: MSG.vat_ratio_range })
  ratio!: number;

  /** `COMPUTED` من سنةٍ ماضيةٍ في النظام · `ESTIMATED` تقديرُ السنة الحالية (م٥١/٦). */
  @IsIn(['COMPUTED', 'ESTIMATED'])
  basis!: 'COMPUTED' | 'ESTIMATED';

  /** أرقامُ الحساب كما كانت لحظةَ الإعلان — فمن يقرأ بعد سنةٍ يعرف ممّ جاءت النسبة. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
