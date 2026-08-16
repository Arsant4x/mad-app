import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';
import { formatMessage, MSG } from '../common/i18n/messages';

/** `branches` is the join rows only — deliberately not `include: { branch: true }`.
 * This service runs on the raw PrismaService (its own tables carry no RLS), and
 * `branches` *is* RLS-protected, so nesting it here makes every read of a
 * company user fail. The client already loads the branch list for its picker
 * and can resolve the names from these ids. */
const COMPANY_USER_INCLUDE = { permissionTemplate: true, branches: { select: { branchId: true } } } as const;

/** Sub-accounts are managed only by the company owner itself (actorType
 * COMPANY), not by another employee sub-account — matches the mockup's
 * single-level parentAccountId model, and keeps this from becoming a
 * multi-level hierarchy the schema doesn't represent. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.company_users_owner_only);
  }
}

@Injectable()
export class CompanyUsersService {
  private readonly logger = new Logger(CompanyUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string, actorType: string) {
    assertIsCompanyOwner(actorType);
    return this.prisma.companyUser.findMany({ where: { companyId }, include: COMPANY_USER_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async create(companyId: string, actorType: string, dto: CreateCompanyUserDto, actor?: { id: string; name: string }) {
    assertIsCompanyOwner(actorType);

    const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId }, select: { companyId: true, isSystem: true } });
      // Global preset or this company's own — a guessed id must never smuggle
      // in another company's template (actor rule, §3.5).
      if (!template || (template.companyId !== null && template.companyId !== companyId)) throw new NotFoundException(MSG.template_not_found);
    if (template.isSystem) throw new ForbiddenException(MSG.template_system_not_assignable);

    // قبل إنشاء أي شيء — فرع مرفوض بعد إنشاء الحساب كان سيترك حساباً
    // نصف مُنشأ، وإعادة المحاولة تصطدم بـusername_taken.
    if (dto.branchIds?.length) await this.assertBranchIdsBelongToCompany(companyId, dto.branchIds);

    const existing = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
    if (existing) {
      /**
       * ⚠️ **الاصطدام يُسجَّل — وهو الإشارة الوحيدة على التعداد.**
       *
       * `AuditInterceptor` يسجّل بـ`tap((result) => …)` — **مسار النجاح
       * وحده**. فالإخفاقات لا تترك أثراً إطلاقاً، و«تعدادُ الأسماء» **كلّه
       * إخفاقات**: من يجرّب مئة اسم ليعرف أيّها موجود لا يُنشئ حساباً واحداً.
       *
       * أي أن الهجوم كان **غير مرئي بنيوياً** لا «غير ملحوظ».
       *
       * 📌 ولا يُسجَّل الاسم المطلوب في `details`: تسجيله يجعل سجل التدقيق
       * نفسه **نسخةً ثانية من التسريب** يقرأها من يملك صلاحية التدقيق. فيُسجَّل
       * **وقوع** الاصطدام لا موضوعه — والغرض كشف النمط لا حفظ المحاولة.
       */
      await this.audit
        .record({
          companyId,
          actorType,
          actorId: actor?.id ?? 'unknown',
          actorName: actor?.name ?? 'unknown',
          screen: 'users',
          action: 'add',
          entity: 'CompanyUser',
          entityId: null,
          method: 'POST',
          path: '/company-users',
          details: { outcome: 'username_conflict' },
          ip: null,
        })
        .catch((e) => this.logger.error(`تعذّر تسجيل اصطدام اسم المستخدم: ${String(e)}`));

      throw new ConflictException(formatMessage(MSG.username_taken, { username: dto.username }));
    }

    const identity = await this.prisma.loginIdentity.create({
      data: {
        username: dto.username,
        passwordHash: await argon2.hash(dto.password),
        actorType: 'COMPANY_USER',
        companyUser: { create: { companyId, name: dto.name, permissionTemplateId: dto.permissionTemplateId } },
      },
      include: { companyUser: { include: COMPANY_USER_INCLUDE } },
    });

    if (dto.branchIds?.length) {
      await this.replaceBranchAssignments(identity.companyUser!.id, dto.branchIds);
      return this.prisma.companyUser.findUniqueOrThrow({ where: { id: identity.companyUser!.id }, include: COMPANY_USER_INCLUDE });
    }
    return identity.companyUser!;
  }

  async update(companyId: string, actorType: string, id: string, dto: UpdateCompanyUserDto) {
    assertIsCompanyOwner(actorType);

    const existing = await this.prisma.companyUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) throw new NotFoundException(MSG.company_user_not_found);

    if (dto.permissionTemplateId) {
      const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId }, select: { companyId: true, isSystem: true } });
      // Global preset or this company's own — a guessed id must never smuggle
      // in another company's template (actor rule, §3.5).
      if (!template || (template.companyId !== null && template.companyId !== companyId)) throw new NotFoundException(MSG.template_not_found);
      if (template.isSystem) throw new ForbiddenException(MSG.template_system_not_assignable);
    }

    if (dto.username) {
      const clash = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
      if (clash && clash.id !== existing.loginIdentityId) throw new ConflictException(formatMessage(MSG.username_taken, { username: dto.username }));
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { username: dto.username } });
    }
    if (dto.password) {
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { passwordHash: await argon2.hash(dto.password) } });
    }

    if (dto.branchIds !== undefined) {
      await this.assertBranchIdsBelongToCompany(companyId, dto.branchIds);
      await this.replaceBranchAssignments(id, dto.branchIds);
    }

    return this.prisma.companyUser.update({
      where: { id },
      data: { name: dto.name, permissionTemplateId: dto.permissionTemplateId, status: dto.status, canEditMasterData: dto.canEditMasterData },
      include: COMPANY_USER_INCLUDE,
    });
  }

  /** Every id must belong to this company — a branch id from elsewhere would
   * otherwise be stored and then silently widen this employee's visibility.
   * Same re-validation rule as any foreign id off a request body (see the
   * journal cross-tenant lesson).
   *
   * Read via the *tenant-scoped* client: `branches` is RLS-protected, and the
   * raw PrismaService this service otherwise uses (its own tables,
   * company_users/login_identities, carry no RLS) would see zero rows here and
   * reject every valid id. */
  private async assertBranchIdsBelongToCompany(companyId: string, branchIds: string[]): Promise<void> {
    if (branchIds.length === 0) return;
    const valid = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true } }),
    );
    if (valid.length !== branchIds.length) throw new NotFoundException(MSG.branch_not_found);
  }

  /** Replace-all: the payload is the complete desired set, so diffing would
   * only add a way for the two to drift apart. Empty = unrestricted. */
  private async replaceBranchAssignments(companyUserId: string, branchIds: string[]): Promise<void> {
    await this.prisma.companyUserBranch.deleteMany({ where: { companyUserId } });
    if (branchIds.length > 0) {
      await this.prisma.companyUserBranch.createMany({ data: branchIds.map((branchId) => ({ companyUserId, branchId })) });
    }
  }

  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);

    const existing = await this.prisma.companyUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) throw new NotFoundException(MSG.company_user_not_found);

    await this.prisma.loginIdentity.delete({ where: { id: existing.loginIdentityId } });
  }
}
