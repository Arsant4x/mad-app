import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { formatMessage, MSG } from '../common/i18n/messages';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.permissionTemplate.findMany({ orderBy: { createdAt: 'asc' } });
  }
async create(dto: CreateTemplateDto) {
    const name = dto.name?.trim();
    if (!name) throw new ConflictException(MSG.template_name_required);

    const duplicate = await this.prisma.permissionTemplate.findUnique({ where: { name } });
    if (duplicate) throw new ConflictException(formatMessage(MSG.template_name_taken, { name }));

    return this.prisma.permissionTemplate.create({
      data: {
        name,
        isAllScreens: dto.isAllScreens ?? false,
        allowedScreens: dto.isAllScreens ? [] : (dto.allowedScreens ?? []),
      },
    });
  }
  async update(id: string, dto: UpdateTemplateDto) {
    const existing = await this.prisma.permissionTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.template_not_found);
    if (existing.isSystem) throw new ForbiddenException(MSG.template_system_immutable);
    const newName = dto.name?.trim();
    if (newName && newName !== existing.name) {
      const duplicate = await this.prisma.permissionTemplate.findUnique({ where: { name: newName } });
      if (duplicate) throw new ConflictException(formatMessage(MSG.template_name_taken, { name: newName }));
    }

    const isAllScreens = dto.isAllScreens ?? existing.isAllScreens;
    return this.prisma.permissionTemplate.update({
      where: { id },
      data: {
       name: newName ?? existing.name,
        isAllScreens,
        allowedScreens: isAllScreens ? [] : (dto.allowedScreens ?? existing.allowedScreens),
      },
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.permissionTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.template_not_found);
    if (existing.isSystem) throw new ForbiddenException(MSG.template_system_undeletable);

    const [companyCount, companyUserCount] = await Promise.all([
      this.prisma.company.count({ where: { permissionTemplateId: id } }),
      this.prisma.companyUser.count({ where: { permissionTemplateId: id } }),
    ]);
    if (companyCount + companyUserCount > 0) {
      throw new ConflictException(MSG.template_in_use);
    }

    await this.prisma.permissionTemplate.delete({ where: { id } });
  }
}
