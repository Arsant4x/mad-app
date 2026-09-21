import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateScriptDto } from './dto/create-script.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — العنوانُ والنصّ. */
const SCRIPT_SEARCH_FIELDS = ['title', 'text'] as const;

@Injectable()
export class ScriptsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, includeArchived = false, query?: PagedQueryDto) {
    const where: Prisma.MessageScriptWhereInput = { ...(includeArchived ? {} : { archived: false }), ...searchWhere(searchTerm(query), SCRIPT_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => pagedFindMany(query, tx.messageScript, { where, orderBy: { createdAt: 'desc' } }));
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
