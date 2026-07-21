import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

export class VatDeclarationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  quarter!: number;
}
