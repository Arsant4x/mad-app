import { IsISO8601, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  orgName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsString()
  permissionTemplateId?: string;

  @IsOptional()
  @IsISO8601()
  subStart?: string;

  @IsOptional()
  @IsISO8601()
  subEnd?: string;
}
