import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const STATUSES = ['ACTIVE', 'FROZEN', 'STOPPED'] as const;

export class UpdateCompanyUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

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
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];
}
