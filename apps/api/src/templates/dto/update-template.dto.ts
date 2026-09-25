import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { ALLOWED_SCREENS } from '../screens';

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isAllScreens?: boolean;

  /** ⚠️ الشكلُ معلَنٌ صراحةً — المُلحَقُ يُسقط `each` من `@IsIn` (انظر `CreateTemplateDto` · `ق-١٤٠٤`). */
  @ApiProperty({ enum: [...ALLOWED_SCREENS], isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALLOWED_SCREENS, { each: true })
  allowedScreens?: string[];

  @IsOptional()
  @IsObject()
  screenActions?: Record<string, string[]>;
}
