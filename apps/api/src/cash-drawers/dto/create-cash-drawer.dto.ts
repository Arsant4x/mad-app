import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateCashDrawerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  /** الفرع الذي يقف فيه الدرج — يُترك فارغاً لمنشأةٍ بلا فروع. */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
