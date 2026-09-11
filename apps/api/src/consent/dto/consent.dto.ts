import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptConsentDto {
  /// رقمُ النسخة صريحٌ لا مضمَر — **فالقبولُ يقع على نصٍّ يعرفه القابل**، ولو نُشرت
  /// نسخةٌ بين عرضِ الشاشة والضغطة لَما مرّ قبولُ القديمة على أنه قبولٌ للجديدة.
  @Type(() => Number)
  @IsInt()
  version!: number;
}

export class UpsertSubProcessorDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(400)
  purpose!: string;

  /// **الموقعُ الجغرافيّ** — وهو ما يحكم النقلَ خارج المملكة، فلا يُترك فارغاً.
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  location!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  dataCategories!: string[];
}

export class PublishVersionDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  summary!: string;

  /// تاريخُ السريان — **والخدمةُ ترفض ما دون مهلة الإشعار**.
  @IsDateString()
  effectiveFrom!: string;
}
