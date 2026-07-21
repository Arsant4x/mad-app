import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';

const COMPANY_USER_INCLUDE = { permissionTemplate: true } as const;

/** Sub-accounts are managed only by the company owner itself (actorType
 * COMPANY), not by another employee sub-account — matches the mockup's
 * single-level parentAccountId model, and keeps this from becoming a
 * multi-level hierarchy the schema doesn't represent. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException('إدارة حسابات الموظفين متاحة لحساب الشركة الرئيسي فقط');
  }
}

@Injectable()
export class CompanyUsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, actorType: string) {
    assertIsCompanyOwner(actorType);
    return this.prisma.companyUser.findMany({ where: { companyId }, include: COMPANY_USER_INCLUDE, orderBy: { createdAt: 'asc' } });
  }

  async create(companyId: string, actorType: string, dto: CreateCompanyUserDto) {
    assertIsCompanyOwner(actorType);

    const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId } });
    if (!template) throw new NotFoundException('قالب الصلاحيات غير موجود');
    if (template.isSystem) throw new ForbiddenException('لا يمكن إسناد نموذج المطوّر لحساب موظف');

    const existing = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException(`اسم المستخدم "${dto.username}" مستخدَم بالفعل`);

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
    if (!existing || existing.companyId !== companyId) throw new NotFoundException('حساب الموظف غير موجود');

    if (dto.permissionTemplateId) {
      const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId } });
      if (!template) throw new NotFoundException('قالب الصلاحيات غير موجود');
      if (template.isSystem) throw new ForbiddenException('لا يمكن إسناد نموذج المطوّر لحساب موظف');
    }

    if (dto.username) {
      const clash = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
      if (clash && clash.id !== existing.loginIdentityId) throw new ConflictException(`اسم المستخدم "${dto.username}" مستخدَم بالفعل`);
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { username: dto.username } });
    }
    if (dto.password) {
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { passwordHash: await argon2.hash(dto.password) } });
    }

    return this.prisma.companyUser.update({
      where: { id },
      data: { name: dto.name, permissionTemplateId: dto.permissionTemplateId, status: dto.status },
      include: COMPANY_USER_INCLUDE,
    });
  }

  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);

    const existing = await this.prisma.companyUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) throw new NotFoundException('حساب الموظف غير موجود');

    await this.prisma.loginIdentity.delete({ where: { id: existing.loginIdentityId } });
  }
}
