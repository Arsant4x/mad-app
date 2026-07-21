import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateScriptDto } from './dto/create-script.dto';
import { UpdateScriptDto } from './dto/update-script.dto';

@Injectable()
export class ScriptsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.messageScript.findMany({ orderBy: { createdAt: 'desc' } }));
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
      if (!existing) throw new NotFoundException('القالب غير موجود');
      return tx.messageScript.update({ where: { id }, data: dto });
    });
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.messageScript.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException('القالب غير موجود');
      await tx.messageScript.delete({ where: { id } });
    });
  }
}
