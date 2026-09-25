import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { ALLOWED_SCREENS } from '../screens';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isAllScreens?: boolean;

  /**
   * ⚠️ مُلحَقُ الوثيقة يقرأ `@IsIn` تعداداً **ويُسقط `each`** فيصف المصفوفةَ نصّاً واحداً — فالشكلُ يُعلَن
   * هنا صراحةً، وفحصُ «حقلُ المصفوفة يُوصف مصفوفة» يمسك عودتَه (`ق-١٤٠٤`).
   */
  @ApiProperty({ enum: [...ALLOWED_SCREENS], isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALLOWED_SCREENS, { each: true })
  allowedScreens?: string[];

  /// Per-screen action grants, e.g. { "contracts": ["view","add"] }. Sanitized
  /// server-side against known screens/actions, so it's a loose object here.
  @IsOptional()
  @IsObject()
  screenActions?: Record<string, string[]>;
}
