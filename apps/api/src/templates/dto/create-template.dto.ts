import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { ALLOWED_SCREENS } from '../screens';

export class CreateTemplateDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isAllScreens?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALLOWED_SCREENS, { each: true })
  allowedScreens?: string[];
}
