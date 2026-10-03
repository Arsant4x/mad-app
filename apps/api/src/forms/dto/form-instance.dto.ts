import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

/** سجلٌّ جديد على إصدارٍ منشورٍ من قالب المنشأة. */
export class CreateFormInstanceDto {
  @IsUUID()
  templateId!: string;

  /** تاريخُ التعبئة `YYYY-MM-DD` — ومنه سنةُ الرقم؛ غائبٌ ⇒ اليوم. */
  @IsOptional()
  @IsDateString()
  formDate?: string;
}

/** قيمةُ بندٍ بنوعه: نصٌّ للحالة والنصّ، ورقمٌ للعدد والرقم والعدّاد والحرارة، ونعم أو لا. وإرسالُ `null` يُفرغ القيمة. */
export class FormValueDto {
  @IsUUID()
  itemId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string | null;

  // حدُّ `Decimal(18,4)` حرفيٌّ لا ثابت، فالمُلحَقُ يُسقط الحقلَ من الوثيقة حين لا يقرأ قيمتَه.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-99999999999999)
  @Max(99999999999999)
  number?: number | null;

  @IsOptional()
  @IsBoolean()
  bool?: boolean | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class SetFormValuesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormValueDto)
  values!: FormValueDto[];
}
