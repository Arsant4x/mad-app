import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SCREEN_ACTIONS, type ScreenAction, type ScreenActionMap } from './screens';
import { formatMessage, MSG } from '../common/i18n/messages';

/** Keeps only known screens the template actually grants, and known actions —
 * so a stray key from the client can't smuggle in a permission for a screen the
 * template doesn't include. `isAllScreens` needs no map (it grants everything). */
function sanitizeScreenActions(input: Record<string, string[]> | undefined, allowedScreens: string[], isAllScreens: boolean): ScreenActionMap | null {
  if (isAllScreens || !input) return null;
  const out: ScreenActionMap = {};
  for (const [screen, actions] of Object.entries(input)) {
    if (!allowedScreens.includes(screen) || !Array.isArray(actions)) continue;
    const valid = [...new Set(actions.filter((a): a is ScreenAction => (SCREEN_ACTIONS as readonly string[]).includes(a)))];
    if (valid.length) out[screen] = valid;
  }
  return Object.keys(out).length ? out : null;
}

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

    const isAllScreens = dto.isAllScreens ?? false;
    const allowedScreens = isAllScreens ? [] : (dto.allowedScreens ?? []);
    const screenActions = sanitizeScreenActions(dto.screenActions, allowedScreens, isAllScreens);
    return this.prisma.permissionTemplate.create({
      data: {
        name,
        isAllScreens,
        allowedScreens,
        screenActions: screenActions ?? Prisma.DbNull,
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
    const allowedScreens = isAllScreens ? [] : (dto.allowedScreens ?? existing.allowedScreens);
    // Re-sanitize against the (possibly new) screen set so an action for a
    // screen just removed from the template doesn't linger.
    const sourceActions = dto.screenActions ?? ((existing.screenActions as Record<string, string[]> | null) ?? undefined);
    const screenActions = sanitizeScreenActions(sourceActions, allowedScreens, isAllScreens);
    return this.prisma.permissionTemplate.update({
      where: { id },
      data: {
        name: newName ?? existing.name,
        isAllScreens,
        allowedScreens,
        screenActions: screenActions ?? Prisma.DbNull,
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
