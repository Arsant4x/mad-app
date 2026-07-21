import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SCRIPT_AUDIENCES } from './create-script.dto';

export class UpdateScriptDto {
  @IsOptional()
  @IsIn(SCRIPT_AUDIENCES)
  audience?: (typeof SCRIPT_AUDIENCES)[number];

  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  text?: string;
}
