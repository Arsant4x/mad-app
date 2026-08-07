import { IsBoolean, IsArray, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

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

  /// Which branches this employee may see. Sending `[]` clears the restriction
  /// (back to unrestricted within the company) rather than locking them out of
  /// everything — see CompanyUserBranch. Omitting the key leaves it unchanged.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
  /// Exempts this employee from the master-data lock.
  @IsOptional()
  @IsBoolean()
  canEditMasterData?: boolean;
}
