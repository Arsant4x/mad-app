import { IsArray, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password/password-policy';

export class CreateCompanyUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(3)
  username!: string;

  /// Length and content rules are checked by the service (common/password).
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
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

  /// Exempts this employee from the master-data lock — `false` when omitted. ⚖️ توجيه ٢٧٥ (القاعدة ٣٧): نافذةُ
  /// الإنشاء تعرض الخانةَ وترسلها منذ 2026-08-07، والإنشاءُ كان لا يعرفها فيرفض المرشّحُ الحفظَ كلَّه.
  @IsOptional()
  @IsBoolean()
  canEditMasterData?: boolean;
}
