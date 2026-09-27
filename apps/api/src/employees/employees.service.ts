import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { Employee, Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { blindIndex, decryptField, encryptField } from '../common/crypto/field-cipher.util';
import { normalizeIban, normalizeIdentifier } from '../common/identity/identifiers.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { LinkLoginAccountDto } from './dto/link-login-account.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { assertBranchIdsAssignable, assertNoOpenShiftOutside, replaceBranchAssignments } from '../company-users/branch-assignment.util';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { mapList, pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسمُ والمسمّى والقسمُ والهاتف. */
const EMPLOYEE_SEARCH_FIELDS = ['fullName', 'jobTitle', 'department', 'phone'] as const;

/**
 * ⚖️ `ق-١٣٤٥` (الحزمة م①) — **هويّةُ الموظف ورقمُ حسابه ورقمُ تأميناته تُشفَّر في التطبيق من أوّل حقل.**
 *
 * الحقولُ الثلاثة تُكتب نصّاً مشفَّراً (`field-cipher.util`) **مربوطاً بمنشأته وحقله وصفّه** — فنسخُه إلى صفٍّ آخر يفشل فكُّه
 * — ورقمُ الهويّة معه بصمةُ بحثٍ بمفتاحٍ منفصل. **ولا يخرج نصٌّ مشفَّرٌ ولا بصمةٌ في ردٍّ قطّ**: القائمةُ تقول «مسجَّلٌ أم
 * لا» وحدَه، والتفصيلُ يفكّ لمن يملك الاطّلاع على الشاشة.
 *
 * **والأسماءُ عامّةٌ لا سعودية** (`ق-١٣٥٠`): `nationalId` · `salaryIban` · `socialInsuranceNo` — التأميناتُ الاجتماعية
 * (`GOSI`) مثالُها السعوديّ، وصيغُها المحلّية تُفحص في وحدة الدولة حين تُبنى لا هنا.
 *
 * ⚠️ **يمسّ وحدةَ الموظفين التي رُفض العملُ عليها (2026-08-10)** — ويُبنى بأمر المالك الصريح في التوجيه ٢٥٩.
 */
const aadOf = (companyId: string, employeeId: string, field: 'nationalId' | 'salaryIban' | 'socialInsuranceNo') => `${companyId}|employees.${field}|${employeeId}`;

type IdentityInput = { nationalId?: string | null; salaryIban?: string | null; socialInsuranceNo?: string | null };

/** ما يُكتب من الحقول الحسّاسة: `undefined` لا يمسّ، والفارغُ يمحو، وغيرُه يُطبَّع ثم يُشفَّر. */
function identityData(companyId: string, employeeId: string, dto: IdentityInput) {
  const data: { nationalIdCipher?: string | null; nationalIdIndex?: string | null; salaryIbanCipher?: string | null; socialInsuranceNoCipher?: string | null } = {};
  if (dto.nationalId !== undefined) {
    const v = normalizeIdentifier(dto.nationalId);
    data.nationalIdCipher = v ? encryptField(v, aadOf(companyId, employeeId, 'nationalId')) : null;
    data.nationalIdIndex = v ? blindIndex(v, companyId) : null;
  }
  if (dto.salaryIban !== undefined) {
    const v = normalizeIban(dto.salaryIban);
    data.salaryIbanCipher = v ? encryptField(v, aadOf(companyId, employeeId, 'salaryIban')) : null;
  }
  if (dto.socialInsuranceNo !== undefined) {
    const v = normalizeIdentifier(dto.socialInsuranceNo);
    data.socialInsuranceNoCipher = v ? encryptField(v, aadOf(companyId, employeeId, 'socialInsuranceNo')) : null;
  }
  return data;
}

/** الصفُّ كما يخرج في كلِّ ردّ: بلا نصٍّ مشفَّرٍ ولا بصمة — وعلامةُ الوجود وحدَها. */
export function publicEmployee(row: Employee) {
  const { nationalIdCipher, nationalIdIndex: _index, salaryIbanCipher, socialInsuranceNoCipher, ...rest } = row;
  return {
    ...rest,
    identityOnFile: { nationalId: nationalIdCipher !== null, salaryIban: salaryIbanCipher !== null, socialInsuranceNo: socialInsuranceNoCipher !== null },
  };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', includeArchived = false, query?: PagedQueryDto) {
    const where: Prisma.EmployeeWhereInput = { ...branchFilter(allowedBranchIds), ...(includeArchived ? {} : { archived: false }), ...searchWhere(searchTerm(query), EMPLOYEE_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) =>
      mapList(await pagedFindMany(query, tx.employee, { where, orderBy: { fullName: 'asc' } }), (row) => publicEmployee(row as Employee)),
    );
  }

  /** التفصيل — الحقولُ الحسّاسة مفكوكةً لمن يملك الاطّلاع على شاشة الموظفين، في فروعه. */
  findOne(companyId: string, allowedBranchIds: string[] | 'all', id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await tx.employee.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
      if (!row) throw new NotFoundException(MSG.employee_not_found);
      return {
        ...publicEmployee(row),
        loginAccount: await this.loginAccountOf(tx, row.companyUserId),
        nationalId: row.nationalIdCipher ? decryptField(row.nationalIdCipher, aadOf(companyId, row.id, 'nationalId')) : null,
        salaryIban: row.salaryIbanCipher ? decryptField(row.salaryIbanCipher, aadOf(companyId, row.id, 'salaryIban')) : null,
        socialInsuranceNo: row.socialInsuranceNoCipher ? decryptField(row.socialInsuranceNoCipher, aadOf(companyId, row.id, 'socialInsuranceNo')) : null,
      };
    });
  }

  /** البحثُ برقم الهويّة ببصمته — داخل المنشأة وفروع القارئ، ولا يُكتب الرقمُ في مسارٍ ولا في سجلّ. */
  findByNationalId(companyId: string, allowedBranchIds: string[] | 'all', nationalId: string) {
    const v = normalizeIdentifier(nationalId);
    if (!v) return Promise.resolve([]);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) =>
      (await tx.employee.findMany({ where: { nationalIdIndex: blindIndex(v, companyId), ...branchFilter(allowedBranchIds) }, orderBy: { fullName: 'asc' } })).map(publicEmployee),
    );
  }

  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateEmployeeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      // المعرّفُ قبل الكتابة — فالنصُّ المشفَّر يُربط بصفّه من أوّل حقل.
      const id = randomUUID();
      const row = await tx.employee.create({
        // companyId omitted on purpose — injected at runtime by the tenant
        // scope extension (see accounts.service.ts for why this cast exists).
        data: {
          id,
          branchId,
          fullName: dto.fullName,
          jobTitle: dto.jobTitle || null,
          department: dto.department || null,
          hireDate: new Date(dto.hireDate),
          baseSalary: dto.baseSalary ?? 0,
          phone: dto.phone || null,
          status: dto.status ?? 'ACTIVE',
          ...identityData(companyId, id, dto),
        } as unknown as Prisma.EmployeeCreateInput,
      });
      return publicEmployee(row);
    });
  }

  /**
   * 🔴 **الصفُّ بفروع الفاعل — كالتفصيل** (`ق-١٤١١`): كان التعديلُ والأرشفةُ والحذفُ تقرأ `findUnique({ id })` **فموظّفٌ
   * مقيَّدٌ بفرعٍ عدّل موظّفَ فرعٍ آخر** وهو لا يراه في القائمة ولا في التفصيل. ⟸ خارجُ الفروع `404` كـ`findOne` نفسِه.
   */
  private async findVisible(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', id: string) {
    const existing = await tx.employee.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
    if (!existing) throw new NotFoundException(MSG.employee_not_found);
    return existing;
  }

  update(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateEmployeeDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.findVisible(tx, allowedBranchIds, id);

      const data: Prisma.EmployeeUncheckedUpdateInput = {};
      if (dto.fullName !== undefined) data.fullName = dto.fullName;
      if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle || null;
      if (dto.department !== undefined) data.department = dto.department || null;
      if (dto.hireDate !== undefined) data.hireDate = new Date(dto.hireDate);
      if (dto.baseSalary !== undefined) data.baseSalary = dto.baseSalary;
      if (dto.phone !== undefined) data.phone = dto.phone || null;
      if (dto.status !== undefined) data.status = dto.status;
      Object.assign(data, identityData(companyId, id, dto));

      return publicEmployee(await tx.employee.update({ where: { id }, data }));
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, allowedBranchIds: string[] | 'all', id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.findVisible(tx, allowedBranchIds, id);
      return publicEmployee(await tx.employee.update({ where: { id }, data: { archived } }));
    });
  }

  /**
   * ⚖️ **نقلُ الموظّف للقادم** (`ق-١٤١٥` · التوجيه ٢٦٣ §٤ بنصّ المالك: «النقلُ للقادم، وصلاحياتُه تُقرأ حيّةً فتنفذ في
   * الطلب التالي، وأفعالُه السابقة بفرعها»).
   *
   * يتغيّر فرعُه **من هذا الطلب**، وما سبقه بفرعه: المستنداتُ تحمل فروعَها مختومةً (`resolveDimensions`)، والحضورُ
   * والإجازاتُ لا تحمل فرعاً أصلاً — **فلا يُعاد نسبُ شيء**؛ وقائمةُ الموظفين تُرشَّح بالفرع في كلِّ طلب فيراه فرعُه
   * الجديد من الطلب التالي. **والفرعُ السابق شرطٌ في الطلب وأثرٌ في السجلّ** (`TransferEmployeeDto`).
   *
   * **والفاعلُ مالكُ المنشأة** (فاعلُ الموجز §٠) — وتوسيعُه لمن يملك الفرعَين والفعلَ «لحكم المالك» (س٤).
   */
  transfer(companyId: string, actorType: string, allowedBranchIds: string[] | 'all', id: string, dto: TransferEmployeeDto) {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.employee_transfer_forbidden);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.findVisible(tx, allowedBranchIds, id);
      if ((existing.branchId ?? null) !== (dto.fromBranchId ?? null)) throw new ConflictException(MSG.employee_transfer_stale);
      const toBranchId = await resolveBranchId(tx, dto.toBranchId, allowedBranchIds);
      if (toBranchId === (existing.branchId ?? null)) throw new BadRequestException(MSG.employee_transfer_same_branch);
      /**
       * ⚖️ **فروعُ الحساب المربوط فعلٌ صريحٌ في الخطوة نفسِها** (`ق-١٤٣٤` · `ق-١٤٤٥`): تُغيَّر إن طُلبت وحدَها، وفي المعاملة
       * نفسِها — فرفضُها (مناوبةٌ مفتوحة `ق-١٤٤٦` · فرعٌ غيرُ مأذون) يُرجع النقلَ كلَّه، لا نصفَ نقل.
       */
      if (dto.loginAccountBranchIds !== undefined) {
        if (!existing.companyUserId) throw new BadRequestException(MSG.employee_login_account_not_linked);
        await assertBranchIdsAssignable(tx, allowedBranchIds, dto.loginAccountBranchIds);
        await assertNoOpenShiftOutside(tx, existing.companyUserId, dto.loginAccountBranchIds);
        await replaceBranchAssignments(tx, existing.companyUserId, dto.loginAccountBranchIds);
        // ⚖️ `ق-١٤٦٨`: قائمةُ فروعٍ صريحةٌ تقييدٌ — فيُطفأ «كلُّ الفروع» معها، ولا يبقى علَمٌ يعلو القائمة.
        await tx.companyUser.update({ where: { id: existing.companyUserId }, data: { allBranches: false } });
      }
      const row = await tx.employee.update({ where: { id }, data: { branchId: toBranchId } });
      return { ...publicEmployee(row), loginAccount: await this.loginAccountOf(tx, row.companyUserId) };
    });
  }

  /**
   * ⚖️ **ربطُ الموظّف بحساب دخوله — صراحةً من المالك** (`ق-١٤٤٥` بنصّه: «**`companyUserId` فريدٌ اختياريٌّ يضبطه المالكُ صراحةً،
   * والقائمُ بلا ربطٍ حتى يُربط. ⛔ ولا ربطَ بالاسم.**»). `null` يفكّ.
   *
   * **على مستوى المنشأة بحقّها**: الحسابُ المربوطُ بموظّفٍ آخر يُبحث في المنشأة كلِّها لا في فروع الفاعل — فالفرادةُ للمنشأة،
   * والرفضُ يسمّي صاحبَه كي يُفكّ عنه أوّلاً (والفاعلُ المالكُ ونطاقُه الكلّ).
   */
  linkLoginAccount(companyId: string, actorType: string, allowedBranchIds: string[] | 'all', id: string, dto: LinkLoginAccountDto) {
    if (actorType !== 'COMPANY') throw new ForbiddenException(MSG.employee_login_account_forbidden);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.findVisible(tx, allowedBranchIds, id);
      if (dto.companyUserId !== null) {
        const account = await tx.companyUser.findUnique({ where: { id: dto.companyUserId }, select: { id: true } });
        if (!account) throw new NotFoundException(MSG.company_user_not_found);
        const holder = await tx.employee.findFirst({ where: { companyUserId: dto.companyUserId, id: { not: id } }, select: { fullName: true } });
        if (holder) throw new ConflictException(formatMessage(MSG.employee_login_account_taken, { employee: holder.fullName }));
      }
      const row = await tx.employee.update({ where: { id }, data: { companyUserId: dto.companyUserId } });
      return { ...publicEmployee(row), loginAccount: await this.loginAccountOf(tx, row.companyUserId) };
    });
  }

  /** ⚖️ **حسابُ الدخول المربوط كما يُعرض** (`ق-١٤٣٤`): معرّفُه واسمُه وفروعُه — أو `null`. ولا يُستنبط بالاسم. */
  private async loginAccountOf(tx: Prisma.TransactionClient, companyUserId: string | null) {
    if (!companyUserId) return null;
    const account = await tx.companyUser.findUnique({ where: { id: companyUserId }, select: { id: true, name: true, branches: { select: { branchId: true } } } });
    return account ? { id: account.id, name: account.name, branchIds: account.branches.map((b) => b.branchId).sort() } : null;
  }

  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.findVisible(tx, allowedBranchIds, id);
      await tx.employee.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
