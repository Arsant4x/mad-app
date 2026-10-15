import { IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MAX_LENGTH } from '../../common/password/password-policy';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  orgName?: string;

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

  // ⛔ **ولا `subStart`/`subEnd` هنا** (`ق-١٣١٧`): تغييرُ الاشتراك **للمالية وحدَها**، وله
  //    مسارُه `PATCH /companies/:id/subscription` بدوره. ومن أرسلهما هنا يُردّ `400`
  //    باسمهما (`forbidNonWhitelisted`) — **فالتضييقُ يُعلَن ولا يُتجاهَل صامتاً**.
}
