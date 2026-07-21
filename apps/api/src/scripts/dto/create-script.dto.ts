import { IsIn, IsString, MinLength } from 'class-validator';

export const SCRIPT_AUDIENCES = ['TENANT', 'CUSTOMER', 'EMPLOYEE'] as const;

export class CreateScriptDto {
  @IsIn(SCRIPT_AUDIENCES)
  audience!: (typeof SCRIPT_AUDIENCES)[number];

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  text!: string;
}
