import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCompanyUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  permissionTemplateId!: string;

  /// Which branches this employee may see, from day one — same semantics as
  /// UpdateCompanyUserDto.branchIds: empty/omitted = unrestricted within the
  /// company (see CompanyUserBranch).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
}
