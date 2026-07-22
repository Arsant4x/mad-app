import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.permissionTemplate.findMany({ orderBy: { createdAt: 'asc' } });
  }
async create(dto: CreateTemplateDto) {
    const name = dto.name?.trim();
    if (!name) throw new ConflictException('اسم النموذج مطلوب');

    const duplicate = await this.prisma.permissionTemplate.findUnique({ where: { name } });
    if (duplicate) throw new ConflictException(`يوجد نموذج بالاسم "${name}" بالفعل`);

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
    if (!existing) throw new NotFoundException('القالب غير موجود');
    if (existing.isSystem) throw new ForbiddenException('نموذج المطوّر ثابت ولا يمكن تعديله');
    const newName = dto.name?.trim();
    if (newName && newName !== existing.name) {
      const duplicate = await this.prisma.permissionTemplate.findUnique({ where: { name: newName } });
      if (duplicate) throw new ConflictException(`يوجد نموذج بالاسم "${newName}" بالفعل`);
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
    if (!existing) throw new NotFoundException('القالب غير موجود');
    if (existing.isSystem) throw new ForbiddenException('نموذج المطوّر ثابت ولا يمكن حذفه');

    const [companyCount, companyUserCount] = await Promise.all([
      this.prisma.company.count({ where: { permissionTemplateId: id } }),
      this.prisma.companyUser.count({ where: { permissionTemplateId: id } }),
    ]);
    if (companyCount + companyUserCount > 0) {
      throw new ConflictException('لا يمكن حذف قالب مستخدَم من قِبل شركة أو حساب موظف');
    }

    await this.prisma.permissionTemplate.delete({ where: { id } });
  }
}
