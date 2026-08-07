import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SCREEN_ACTIONS, type ScreenAction, type ScreenActionMap } from './screens';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * Who is operating on templates. Employee permissions are the OWNER's decision
 * in the owner's UI (actor rule, CLAUDE.md §3.5): a company owner manages the
 * templates of their own company; the platform admin manages only the global
 * presets every company can start from.
 */
export interface TemplateScope {
  /** null for the platform admin — operates on global presets. */
  companyId: string | null;
}

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

  /** What this caller may see: a company gets the global presets PLUS its own
   * templates — never a neighbour's. The platform admin sees everything. */
  list(scope?: TemplateScope) {
    if (!scope || scope.companyId === null) {
      return this.prisma.permissionTemplate.findMany({ orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }] });
    }
    return this.prisma.permissionTemplate.findMany({
      where: { OR: [{ companyId: null }, { companyId: scope.companyId }] },
      orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateTemplateDto, scope: TemplateScope) {
    const name = dto.name?.trim();
    if (!name) throw new ConflictException(MSG.template_name_required);

    // Two-layer uniqueness (6.6) within the caller's own scope: an owner's
    // names can't clash with each other, but CAN match another company's —
    // scopes never see one another.
    const duplicate = await this.prisma.permissionTemplate.findFirst({ where: { name, companyId: scope.companyId } });
    if (duplicate) throw new ConflictException(formatMessage(MSG.template_name_taken, { name }));

    const isAllScreens = dto.isAllScreens ?? false;
    const allowedScreens = isAllScreens ? [] : (dto.allowedScreens ?? []);
    const screenActions = sanitizeScreenActions(dto.screenActions, allowedScreens, isAllScreens);
    return this.prisma.permissionTemplate.create({
      data: {
        name,
        companyId: scope.companyId,
        isAllScreens,
        allowedScreens,
        screenActions: screenActions ?? Prisma.DbNull,
      },
    });
  }

  async update(id: string, dto: UpdateTemplateDto, scope: TemplateScope) {
    const existing = await this.getOwned(id, scope);
    if (existing.isSystem) throw new ForbiddenException(MSG.template_system_immutable);

    const newName = dto.name?.trim();
    if (newName && newName !== existing.name) {
      const duplicate = await this.prisma.permissionTemplate.findFirst({ where: { name: newName, companyId: scope.companyId } });
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

  async remove(id: string, scope: TemplateScope): Promise<void> {
    const existing = await this.getOwned(id, scope);
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

  /** A template usable by this company when assigning an employee: a global
   * preset, or one of its own — never another company's (guessing an id must
   * not smuggle in a foreign template). */
  async assertAssignable(templateId: string, companyId: string): Promise<void> {
    const template = await this.prisma.permissionTemplate.findUnique({ where: { id: templateId }, select: { companyId: true } });
    if (!template || (template.companyId !== null && template.companyId !== companyId)) {
      throw new NotFoundException(MSG.template_not_found);
    }
  }

  /** The caller's own scope only: an owner reaches its company's templates,
   * the admin reaches global ones. Anything else reads as "not found" — the
   * same non-enumeration stance the rest of the app takes. */
  private async getOwned(id: string, scope: TemplateScope) {
    const existing = await this.prisma.permissionTemplate.findUnique({ where: { id } });
    if (!existing || existing.companyId !== scope.companyId) throw new NotFoundException(MSG.template_not_found);
    return existing;
  }
}
