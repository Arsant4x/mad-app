import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

/** Sets an employee's base salary; null clears it (no salary entered). The key itself is required. */
export class SetEmployeeSalaryDto {
  @ApiProperty({ type: Number, nullable: true })
  @ValidateIf((o: SetEmployeeSalaryDto) => o.baseSalary !== null)
  @IsNumber()
  @Min(0)
  // Twelve integer digits keep every amount exact to two decimals in a JavaScript number.
  @Max(999999999999.99)
  baseSalary!: number | null;
}
