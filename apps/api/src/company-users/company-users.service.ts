import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  list(companyId: string, actorType: string) {
    assertIsCompanyOwner(actorType);
    return this.prisma.companyUser.findMany({ where: { companyId }, include: COMPANY_USER_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async create(companyId: string, actorType: string, dto: CreateCompanyUserDto) {
    assertIsCompanyOwner(actorType);

    const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId } });
    if (!template) throw new NotFoundException(MSG.template_not_found);
    if (template.isSystem) throw new ForbiddenException(MSG.template_system_not_assignable);

    const existing = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException(formatMessage(MSG.username_taken, { username: dto.username }));

    const identity = await this.prisma.loginIdentity.create({
      data: {
        username: dto.username,
        passwordHash: await argon2.hash(dto.password),
        actorType: 'COMPANY_USER',
        companyUser: { create: { companyId, name: dto.name, permissionTemplateId: dto.permissionTemplateId } },
      },
      include: { companyUser: { include: COMPANY_USER_INCLUDE } },
    });

    return identity.companyUser!;
  }

  async update(companyId: string, actorType: string, id: string, dto: UpdateCompanyUserDto) {
    assertIsCompanyOwner(actorType);

    const existing = await this.prisma.companyUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) throw new NotFoundException(MSG.company_user_not_found);

    if (dto.permissionTemplateId) {
      const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId } });
      if (!template) throw new NotFoundException(MSG.template_not_found);
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
      // Every id must belong to this company — a branch id from elsewhere
      // would otherwise be stored and then silently widen this employee's
      // visibility. Same re-validation rule as any foreign id off a request
      // body (see the journal cross-tenant lesson).
      //
      // Read via the *tenant-scoped* client: `branches` is RLS-protected, and
      // the raw PrismaService this service otherwise uses (its own tables,
      // company_users/login_identities, carry no RLS) would see zero rows here
      // and reject every valid id.
      const valid = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.branch.findMany({ where: { id: { in: dto.branchIds } }, select: { id: true } }),
      );
      if (valid.length !== dto.branchIds.length) throw new NotFoundException(MSG.branch_not_found);

      // Replace-all: the payload is the complete desired set, so diffing would
      // only add a way for the two to drift apart.
      await this.prisma.companyUserBranch.deleteMany({ where: { companyUserId: id } });
      if (dto.branchIds.length > 0) {
        await this.prisma.companyUserBranch.createMany({ data: dto.branchIds.map((branchId) => ({ companyUserId: id, branchId })) });
      }
    }

    return this.prisma.companyUser.update({
      where: { id },
      data: { name: dto.name, permissionTemplateId: dto.permissionTemplateId, status: dto.status, canEditMasterData: dto.canEditMasterData },
      include: COMPANY_USER_INCLUDE,
    });
  }

  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);

    const existing = await this.prisma.companyUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) throw new NotFoundException(MSG.company_user_not_found);

    await this.prisma.loginIdentity.delete({ where: { id: existing.loginIdentityId } });
  }
}
