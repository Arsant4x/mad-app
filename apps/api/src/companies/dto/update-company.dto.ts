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

  // ⛔ **ولا `subStart`/`subEnd` هنا** (`ق-١٣١٧`): تغييرُ الاشتراك **للمالية وحدَها**، وله
  //    مسارُه `PATCH /companies/:id/subscription` بدوره. ومن أرسلهما هنا يُردّ `400`
  //    باسمهما (`forbidNonWhitelisted`) — **فالتضييقُ يُعلَن ولا يُتجاهَل صامتاً**.
}
