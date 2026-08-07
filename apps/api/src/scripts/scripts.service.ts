import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateScriptDto } from './dto/create-script.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { MSG } from '../common/i18n/messages';

@Injectable()
export class ScriptsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.messageScript.findMany({ ...{ orderBy: { createdAt: 'desc' } }, ...(includeArchived ? {} : { where: { archived: false } }) }));
  }

  create(companyId: string, dto: CreateScriptDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.messageScript.create({
        data: { audience: dto.audience, title: dto.title, text: dto.text } as unknown as Prisma.MessageScriptUncheckedCreateInput,
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateScriptDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.messageScript.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.template_not_found);
      return tx.messageScript.update({ where: { id }, data: dto });
    });
  }

  /** Hidden from day-to-day lists while staying in the books — archiving
   * is presentation, deletion is the trash. */
  setArchived(companyId: string, id: string, archived: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.messageScript.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.template_not_found);
      return tx.messageScript.update({ where: { id }, data: { archived } });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.messageScript.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.template_not_found);
      await tx.messageScript.update({ where: { id }, data: { deletedAt: new Date() } });
    });
  }
}
