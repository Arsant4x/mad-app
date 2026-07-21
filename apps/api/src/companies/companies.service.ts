import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Company } from '@prisma/client';
import * as argon2 from 'argon2';
import { evaluateCompanyStatus } from '../common/tenant/company-status.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const COMPANY_INCLUDE = { permissionTemplate: true } as const;

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const companies = await this.prisma.company.findMany({ include: COMPANY_INCLUDE, orderBy: { createdAt: 'asc' } });
    return Promise.all(companies.map((c) => this.refreshStatus(c)));
  }

  /** Matches the mockup's renderDeveloperPanel calling checkSubscriptionStatus
   * on every render — the panel must show a company as FROZEN/STOPPED as soon
   * as its subscription lapses, not only after that company's next login
   * (which is the only other place evaluateCompanyStatus normally runs). */
  private async refreshStatus<T extends Company>(company: T): Promise<T> {
    const evaluated = evaluateCompanyStatus(company);
    if (evaluated.status === company.status && evaluated.frozenAt?.getTime() === company.frozenAt?.getTime()) {
      return company;
    }
    return this.prisma.company.update({
      where: { id: company.id },
      data: { status: evaluated.status, frozenAt: evaluated.frozenAt },
      include: COMPANY_INCLUDE,
    }) as Promise<T>;
  }

  async create(dto: CreateCompanyDto) {
    const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId } });
    if (!template) throw new NotFoundException('قالب الصلاحيات غير موجود');

    const existing = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException(`اسم المستخدم "${dto.username}" مستخدَم بالفعل`);

    const identity = await this.prisma.loginIdentity.create({
      data: {
        username: dto.username,
        passwordHash: await argon2.hash(dto.password),
        actorType: 'COMPANY',
        company: {
          create: {
            orgName: dto.orgName,
            permissionTemplateId: dto.permissionTemplateId,
            subStart: dto.subStart ? new Date(dto.subStart) : undefined,
            subEnd: dto.subEnd ? new Date(dto.subEnd) : undefined,
          },
        },
      },
      include: { company: { include: COMPANY_INCLUDE } },
    });

    return identity.company!;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الشركة غير موجودة');

    if (dto.permissionTemplateId) {
      const template = await this.prisma.permissionTemplate.findUnique({ where: { id: dto.permissionTemplateId } });
      if (!template) throw new NotFoundException('قالب الصلاحيات غير موجود');
    }

    if (dto.username) {
      const clash = await this.prisma.loginIdentity.findUnique({ where: { username: dto.username } });
      if (clash && clash.id !== existing.loginIdentityId) throw new ConflictException(`اسم المستخدم "${dto.username}" مستخدَم بالفعل`);
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { username: dto.username } });
    }
    if (dto.password) {
      await this.prisma.loginIdentity.update({ where: { id: existing.loginIdentityId }, data: { passwordHash: await argon2.hash(dto.password) } });
    }

    const newSubEnd = dto.subEnd ? new Date(dto.subEnd) : existing.subEnd;
    // Editing subEnd forward is this app's only "renew" lever (matches the
    // mockup — no separate activate/unfreeze button): if the new end date is
    // in the future, treat it as a manual reactivation rather than leaving a
    // frozen/stopped company stuck (evaluateCompanyStatus only ever moves
    // ACTIVE -> FROZEN -> STOPPED forward, it never un-freezes on its own).
    const reactivate = dto.subEnd && existing.status !== 'ACTIVE' && newSubEnd! > new Date();

    return this.prisma.company.update({
      where: { id },
      data: {
        orgName: dto.orgName,
        permissionTemplateId: dto.permissionTemplateId,
        subStart: dto.subStart ? new Date(dto.subStart) : undefined,
        subEnd: dto.subEnd ? new Date(dto.subEnd) : undefined,
        ...(reactivate ? { status: 'ACTIVE', frozenAt: null } : {}),
      },
      include: COMPANY_INCLUDE,
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('الشركة غير موجودة');
    // Cascades through every business table via Company's onDelete: Cascade
    // relations — deleting a company wipes all of its data, matching the
    // mockup's deleteUserAccount (no confirmation short-circuit server-side;
    // the frontend is responsible for a confirm dialog before calling this).
    await this.prisma.loginIdentity.delete({ where: { id: existing.loginIdentityId } });
  }
}
