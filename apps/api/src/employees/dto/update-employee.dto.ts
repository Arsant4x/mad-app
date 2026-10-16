import { EmployeeStatus } from '@mad-app/db';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsDateString()
  hireDate?: string;

  // The base salary is not set here: it has its own path, gated by the salaries action.

  @IsOptional()
  @IsString()
  phone?: string;

  // ③ (`ق-١٤٠٤`): كالإنشاء — تعدادٌ صريحٌ في الوثيقة لا «كائن».
  @ApiProperty({ enum: EmployeeStatus, required: false })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /** ⚖️ `ق-١٣٤٥` — كالإنشاء: تُطبَّع وتُشفَّر في الخدمة، والفارغُ يمحو، وغيابُ الحقل لا يمسّه. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  salaryIban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  socialInsuranceNo?: string;
}
