import { IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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

  /// ⚖️ `ق-١٤٦٨` — Which branches this employee may see, from day one. **Empty/omitted is no branch**
  /// (company-wide rows only) unless `allBranches` is `true`.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  /// ⚖️ `ق-١٤٦٨` — «All branches, including ones added later» — an explicit flag, `false` when omitted.
  /// `true` with a non-empty `branchIds` is refused (400): the two contradict.
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;
}
