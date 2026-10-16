import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { EmployeeStatus } from '@mad-app/db';

/**
 * ⚖️ **ردُّ ربط الموظّف بحساب دخوله** (`ق-١٤٤٥`) بصنفٍ مسمّى — مسارٌ جديد بعد مِسنَن الردود (`ق-١٤٣٨`)، **والمِسنَنُ لا يزيد**.
 *
 * **والحقولُ كما تُرسَل**: الموظّفُ بلا أعمدته المشفَّرة (`publicEmployee` — `ق-١٣٤٥`) ومعه **ما في الملفّ** منها علامةً لا قيمة،
 * **وحسابُ الدخول المربوط** بمعرّفه واسمه وفروعه أو `null`. **والصنفُ حدٌّ أدنى**: المعلَنُ ما يحمله كلُّ ردٍّ ويقرؤه القارئ.
 */
export class EmployeeLoginAccountResponse {
  id!: string;
  name!: string;
  branchIds!: string[];
}

/** الحقولُ المشفَّرة **حاضرةٌ أم لا** — لا قيمتُها (`ق-١٣٤٥`). */
export class EmployeeIdentityOnFileResponse {
  nationalId!: boolean;
  salaryIban!: boolean;
  socialInsuranceNo!: boolean;
}

@ApiExtraModels(EmployeeLoginAccountResponse)
export class EmployeeWithLoginAccountResponse {
  id!: string;
  fullName!: string;
  branchId!: string | null;
  // تعدادُ Prisma — المُلحَقُ يقرؤه Object.
  @ApiProperty({ enum: EmployeeStatus })
  status!: EmployeeStatus;
  companyUserId!: string | null;
  archived!: boolean;
  identityOnFile!: EmployeeIdentityOnFileResponse;
  @ApiProperty({ allOf: [{ $ref: getSchemaPath(EmployeeLoginAccountResponse) }], nullable: true })
  loginAccount!: EmployeeLoginAccountResponse | null;
  createdAt!: string;
  updatedAt!: string;
}

/** An employee's base salary, served only to holders of the salaries action. */
export class EmployeeSalaryResponse {
  employeeId!: string;
  /** Two decimal text, or null when no salary was entered. */
  @ApiProperty({ type: String, nullable: true, example: '5000.00' })
  baseSalary!: string | null;
}
