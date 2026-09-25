import { EmployeeStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseSalary?: number;

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
