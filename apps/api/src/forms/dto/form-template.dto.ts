import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FormItemType } from '@mad-app/db';
import { SECTORS, type Sector } from '../../activities/sectors';

/** بندٌ في إصدار القالب، بترتيب إرساله. */
export class FormTemplateItemDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  label!: string;

  // تعدادُ Prisma يصفه مُلحَقُ الوثيقة «كائناً» — فيُعلَن تعداداً صراحةً (`ق-١٤٠٤`).
  @ApiProperty({ enum: FormItemType })
  @IsEnum(FormItemType)
  itemType!: FormItemType;

  /** بندٌ فارغٌ يمنع الختم. */
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  // حدُّ `Decimal(18,4)`: أربعَ عشرةَ خانةً صحيحة — حرفيٌّ لا ثابت، فالمُلحَقُ يُسقط الحقلَ من الوثيقة حين لا يقرأ قيمتَه.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-99999999999999)
  @Max(99999999999999)
  minValue?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(-99999999999999)
  @Max(99999999999999)
  maxValue?: number;

  /** قيمةٌ خارج النطاق تمنع الختم؛ وإلا سُجّلت انحرافاً ومضى. */
  @IsOptional()
  @IsBoolean()
  isBlocking?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  helpText?: string;
}

/** قالبٌ عامٌّ جديد من لوحة المطوّر: إصدارُه الأوّل مسوّدة. */
export class CreateFormTemplateDto {
  @IsUUID()
  formTypeId!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormTemplateItemDto)
  items!: FormTemplateItemDto[];
}

/** تحريرُ المسوّدة — والبنودُ إن أُرسلت تحلّ محلَّ بنودها كلِّها بترتيبها. */
export class UpdateFormTemplateDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FormTemplateItemDto)
  items?: FormTemplateItemDto[];
}

/** نسخُ إصدارٍ عامٍّ منشور إلى المنشأة — مسوّدةً يحرّرها التاجرُ ثم ينشرها. */
export class CopyFormTemplateDto {
  @IsUUID()
  sourceTemplateId!: string;

  /** اسمُ النسخة — غائبٌ ⇒ اسمُ القالب العامّ. */
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name?: string;
}

/** نوعُ نموذجٍ في كتالوج المنصّة. */
export class CreateFormTypeDto {
  /** مفتاحٌ ثابت بحروفٍ لاتينية كبيرة وأرقامٍ وشرطةٍ سفلية (`UNIT_HANDOVER`). */
  @Matches(/^[A-Z][A-Z0-9_]{2,59}$/)
  code!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** نشاطُ المنشأة الذي يخصّه، وغائبٌ = لكلِّ الأنشطة. */
  @IsOptional()
  @IsIn(SECTORS)
  sector?: Sector;
}

/** الرمزُ لا يتغيّر بعد الإنشاء؛ ما يتغيّر الاسمُ والوصفُ والنشاط. */
export class UpdateFormTypeDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** `null` يعيده لكلِّ الأنشطة (و`@IsOptional` يقبل الفراغ). */
  @IsOptional()
  @IsIn(SECTORS)
  sector?: Sector | null;
}
