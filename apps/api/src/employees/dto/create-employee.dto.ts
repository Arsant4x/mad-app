import { BranchFieldDto } from '../../branches/dto/branch-field.dto';
import { EmployeeStatus } from '@mad-app/db';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeDto extends BranchFieldDto {
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsDateString()
  hireDate!: string;

  // The base salary is not set here: it has its own path, gated by the salaries action.

  @IsOptional()
  @IsString()
  phone?: string;

  // ③ (`ق-١٤٠٤`): تعدادُ Prisma يصفه مُلحَقُ الوثيقة «كائناً» — فيُعلَن تعداداً صراحةً كي يُولَّد نوعُه قيماً لا `Record`.
  @ApiProperty({ enum: EmployeeStatus, required: false })
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /**
   * ⚖️ `ق-١٣٤٥` — الحقولُ الحسّاسة الثلاثة: تُطبَّع وتُشفَّر في الخدمة ولا تُخزَّن نصّاً صريحاً قطّ، والفارغُ يمحو.
   * **وأسماؤها عامّة** (`ق-١٣٥٠`): صيغُ الدولة (عشرةُ أرقامٍ للهويّة · رقمُ التأمينات) تُفحص في وحدتها حين تُبنى لا هنا.
   */
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

/** البحثُ برقم الهويّة — في الجسم لا في المسار ولا في الاستعلام، فلا يُكتب في سجلّات الوصول. */
export class FindByNationalIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  nationalId!: string;
}
