import { IsBoolean, IsOptional } from 'class-validator';
import { VatDeclarationQueryDto } from './vat-declaration-query.dto';

/**
 * علَمُ «قُدِّم» — فترةٌ تُوسَم بيد التاجر (`ق-٩١٩`).
 *
 * ⑥A2 (`ق-١٣٢٥`): كان ربعَ سنةٍ حتماً. **ويرث الآن شرطَ الفترة نفسَه** من استعلام الإقرار —
 * فالوسمُ والقراءة يقرآن الفترةَ بقاعدةٍ واحدة، **ولا تتباعد صيغتان لشيءٍ واحد**.
 */
export class VatFiledDto extends VatDeclarationQueryDto {
  /**
   * ⑥A3 (`ق-١٣٢٥`) — **أطلبتَ ردَّ الفائض؟** الافتراضُ `false` **وهو حكمُ النصّ**:
   * «may request excess Tax to be refunded, **otherwise** excess Tax will be **carried forward**».
   * ⚠️ **ولا يُخمَّن**: لو خُمِّن ترحيلاً وقد طُلب ردُّه لحُسب الفائضُ مرّتين.
   */
  @IsOptional()
  @IsBoolean()
  refundRequested?: boolean;
}
