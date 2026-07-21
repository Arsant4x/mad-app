import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @MinLength(1)
  orgName!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  permissionTemplateId!: string;

  @IsOptional()
  @IsISO8601()
  subStart?: string;

  @IsOptional()
  @IsISO8601()
  subEnd?: string;
}
