import { Type } from 'class-transformer';
import { IsIn, IsInt, Max, Min } from 'class-validator';

/** علَمُ «قُدِّم» — ربعُ سنةٍ يُوسَم بيد التاجر (`ق-٩١٩`). */
export class VatFiledDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsIn([1, 2, 3, 4])
  quarter!: number;
}
