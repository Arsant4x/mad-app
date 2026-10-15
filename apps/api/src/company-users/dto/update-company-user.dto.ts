import { IsBoolean, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password/password-policy';

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

  /// Length and content rules are checked by the service (common/password).
  @IsOptional()
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  @IsOptional()
  @IsString()
  permissionTemplateId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: (typeof STATUSES)[number];

  /// ⚖️ `ق-١٤٦٨` — Which branches this employee may see (replace-all). **`[]` is no branch** —
  /// company-wide rows only — not «all». A non-empty list with `allBranches` omitted clears the flag
  /// (an explicit restriction). Omitting the key leaves it unchanged.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];
  /// ⚖️ `ق-١٤٦٨` — «All branches, including ones added later» as an explicit flag. `true` with a
  /// non-empty `branchIds` is refused (400). Omitting it leaves it unchanged.
  @IsOptional()
  @IsBoolean()
  allBranches?: boolean;
  /// Exempts this employee from the master-data lock.
  @IsOptional()
  @IsBoolean()
  canEditMasterData?: boolean;
}
