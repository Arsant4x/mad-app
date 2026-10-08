import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf, ValidateNested } from 'class-validator';

/** مدّةُ التوقيع لنوعٍ بالأيام. */
export class FormTypeSignPeriodDto {
  @IsUUID()
  formTypeId!: string;

  @IsInt()
  @Min(1)
  signPeriodDays!: number;
}

/** ⚖️ إعدادُ توقيع النماذج (توجيه ٢٨٧) — لمالك المنشأة. `nafathThreshold: null` يمحو الحدَّ فلا يُشترط نفاذ. */
export class UpdateFormSigningSettingsDto {
  // حدُّ `Decimal(18,2)` حرفيٌّ لا ثابت، فالمُلحَقُ يُسقط الحقلَ من الوثيقة حين لا يقرأ قيمتَه.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999999)
  @ApiProperty({ type: Number, nullable: true, required: false })
  nafathThreshold?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FormTypeSignPeriodDto)
  periods?: FormTypeSignPeriodDto[];
}

export class FormTypeSigningSettingResponse {
  formTypeId!: string;
  code!: string;
  name!: string;
  signPeriodDays!: number;
  /** لم يغيّره التاجر، فهو الافتراض. */
  isDefault!: boolean;
}

export class FormSigningSettingsResponse {
  /** الحدُّ نصّاً (`Decimal`) بعملة أساس المنشأة، وفارغٌ لا يشترط نفاذ. */
  nafathThreshold!: string | null;
  currency!: string;
  defaultSignPeriodDays!: number;
  types!: FormTypeSigningSettingResponse[];
}
