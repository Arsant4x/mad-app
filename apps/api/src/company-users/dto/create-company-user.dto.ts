import { IsString, MinLength } from 'class-validator';

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
}
