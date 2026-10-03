import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { SCREEN_ACTIONS, type ScreenAction, type ScreenActionMap } from './screens';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — اسمُ القالب. */
const TEMPLATE_SEARCH_FIELDS = ['name'] as const;

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

type Tx = Prisma.TransactionClient;

/**
 * ⚖️ **القالبان العامّان اللذان تقوم عليهما المنصّة يُحميان** (توجيه ٢٧٦ · `ق-١٦٠١`: «والقالبُ العامّ الشامل يُحمى»).
 *
 * العامُّ الشامل يركب عليه كلُّ صاحب منشأة (التسجيلُ الذاتيُّ يبحث عنه، ولوحةُ المدير لا تقبل غيرَه): تضييقُه يقصّ كلَّ موظّفي كلِّ
 * منشأةٍ عليه بصمت، وحذفُه يوقف التسجيلَ الذاتيَّ كلَّه (المسح ٣٣ الخطر ٣). و«بلا شاشات» اختيارُ الموظّف الجديد المسبق: توسيعُه
 * يعطي كلَّ موظّفٍ جديد ما لم يُعطَه. فالاسمُ يتغيّر، والنطاقُ لا، والحذفُ لا.
 */
function isLoadBearingGlobal(t: { companyId: string | null; isAllScreens: boolean; isNewUserDefault: boolean }): boolean {
  return t.companyId === null && (t.isAllScreens || t.isNewUserDefault);
}

function sameScope(
  t: { isAllScreens: boolean; allowedScreens: string[]; screenActions: unknown },
  next: { isAllScreens: boolean; allowedScreens: string[]; screenActions: ScreenActionMap | null },
): boolean {
  const screens = (xs: string[]) => [...xs].sort().join('|');
  const actions = (m: unknown) =>
    JSON.stringify(
      Object.entries((m ?? {}) as Record<string, string[]>)
        .map(([s, a]) => [s, [...a].sort()] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  return t.isAllScreens === next.isAllScreens && screens(t.allowedScreens) === screens(next.allowedScreens) && actions(t.screenActions) === actions(next.screenActions);
}

/**
 * 🔴 **كلُّ عمليةٍ هنا في معاملة نطاقها** (`ق-٦٧٥` · المرحلة ③).
 *
 * `permission_templates` تحت `FORCE` بصياغةٍ فريدة: **العامُّ** (`companyId IS NULL`)
 * يُرى من كلّ سياقٍ ومن غير سياق (التسجيلُ يقرؤه قبل أيّ سياق)، **والخاصُّ** لصاحبه
 * وحدَه؛ **والكتابةُ**: المنشأةُ على قوالبها، **ومسنَدُ الإدارة** وحدَه على العامّ.
 *
 *   · نطاقُ منشأة ⇒ `runInTenantContext(companyId)` — ترى العامَّ وقوالبَها.
 *   · نطاقُ المنصّة ⇒ `runAsPlatformAdmin()` — تكتب العامَّ وترى الكلَّ (إشرافاً).
 *
 * **القياسُ الحيّ**: تحت الطُّعم قبل النقل `23/54` حمراء (`new row violates
 * row-level security policy for table "permission_templates"`) — وبعده خضراء.
 */
@Injectable()
export class TemplatesService {
  // لا `PrismaService` خامٌ هنا بعد المرحلة ③: كلُّ نداءٍ في معاملة نطاقه.
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** معاملةُ النطاق: منشأةٌ تحت سياقها، أو المنصّةُ بمسنَدها. */
  private inScope<T>(scope: TemplateScope | undefined, work: (tx: Tx) => Promise<T>): Promise<T> {
    return scope?.companyId ? this.tenantPrisma.runInTenantContext(scope.companyId, work) : this.tenantPrisma.runAsPlatformAdmin(work);
  }

  /** What this caller may see: a company gets the global presets PLUS its own
   * templates — never a neighbour's. The platform admin sees everything. */
  list(scope?: TemplateScope, query?: PagedQueryDto) {
    const search = searchWhere(searchTerm(query), TEMPLATE_SEARCH_FIELDS);
    return this.inScope(scope, (tx) => {
      // الرؤيةُ شرطٌ في `AND` مع البحث — فلا يوسّع البحثُ ما تراه المنشأة.
      const visibility: Prisma.PermissionTemplateWhereInput = !scope || scope.companyId === null ? {} : { OR: [{ companyId: null }, { companyId: scope.companyId }] };
      const where: Prisma.PermissionTemplateWhereInput = search ? { AND: [visibility, search] } : visibility;
      return pagedFindMany(query, tx.permissionTemplate, { where, orderBy: [{ companyId: 'asc' }, { createdAt: 'asc' }] });
    });
  }

  async create(dto: CreateTemplateDto, scope: TemplateScope) {
    const name = dto.name?.trim();
    if (!name) throw new ConflictException(MSG.template_name_required);

    return this.inScope(scope, async (tx) => {
      // Two-layer uniqueness (6.6) within the caller's own scope: an owner's
      // names can't clash with each other, but CAN match another company's —
      // scopes never see one another.
      const duplicate = await tx.permissionTemplate.findFirst({ where: { name, companyId: scope.companyId } });
      if (duplicate) throw new ConflictException(formatMessage(MSG.template_name_taken, { name }));

      const isAllScreens = dto.isAllScreens ?? false;
      const allowedScreens = isAllScreens ? [] : (dto.allowedScreens ?? []);
      const screenActions = sanitizeScreenActions(dto.screenActions, allowedScreens, isAllScreens);
      return tx.permissionTemplate.create({
        data: {
          name,
          companyId: scope.companyId,
          isAllScreens,
          allowedScreens,
          screenActions: screenActions ?? Prisma.DbNull,
        },
      });
    });
  }

  async update(id: string, dto: UpdateTemplateDto, scope: TemplateScope) {
    return this.inScope(scope, async (tx) => {
      const existing = await this.getOwned(tx, id, scope);
      if (existing.isSystem) throw new ForbiddenException(MSG.template_system_immutable);

      const newName = dto.name?.trim();
      if (newName && newName !== existing.name) {
        const duplicate = await tx.permissionTemplate.findFirst({ where: { name: newName, companyId: scope.companyId } });
        if (duplicate) throw new ConflictException(formatMessage(MSG.template_name_taken, { name: newName }));
      }

      const isAllScreens = dto.isAllScreens ?? existing.isAllScreens;
      const allowedScreens = isAllScreens ? [] : (dto.allowedScreens ?? existing.allowedScreens);
      // Re-sanitize against the (possibly new) screen set so an action for a
      // screen just removed from the template doesn't linger.
      const sourceActions = dto.screenActions ?? ((existing.screenActions as Record<string, string[]> | null) ?? undefined);
      const screenActions = sanitizeScreenActions(sourceActions, allowedScreens, isAllScreens);
      // الاسمُ يتغيّر، والنطاقُ لا (توجيه ٢٧٦ · ق-١٦٠١).
      if (isLoadBearingGlobal(existing) && !sameScope(existing, { isAllScreens, allowedScreens, screenActions })) {
        throw new ForbiddenException(MSG.template_global_protected);
      }
      return tx.permissionTemplate.update({
        where: { id },
        data: {
          name: newName ?? existing.name,
          isAllScreens,
          allowedScreens,
          screenActions: screenActions ?? Prisma.DbNull,
        },
      });
    });
  }

  async remove(id: string, scope: TemplateScope): Promise<void> {
    await this.inScope(scope, async (tx) => {
      const existing = await this.getOwned(tx, id, scope);
      if (existing.isSystem) throw new ForbiddenException(MSG.template_system_undeletable);
      if (isLoadBearingGlobal(existing)) throw new ForbiddenException(MSG.template_global_protected);

      /**
       * 🔴 **عدُّ ما يركب على القالب في معاملة نطاقه** (`ق-٦٥٧` · `ق-٦٦٢`).
       *
       * قالبُ منشأةٍ لا يُسنَد إلا لحساباتها (`assertAssignable`) — فعدُّه داخل
       * سياقها يعطي الجوابَ نفسَه، **ويبقى صادقاً يوم يُغلق `company_users`**.
       *
       * ⚠️ **والقالبُ العامّ**: مدير المنصّة يحذف قالباً عامّاً قد تركبه حساباتٌ في
       * **كلّ** المنشآت — فيُعدّ **بمسنَد الإدارة** (`runAsPlatformAdmin`): اليومَ
       * `company_users` بلا سياسة فالعدُّ يرى الكلَّ؛ ويوم يُغلق في ④ **تُقرأ سياستُه
       * مسنَدَ الإدارة** فيبقى العدُّ صادقاً — لا صفراً يُخفي قالباً مستعمَلاً.
       */
      const [companyCount, companyUserCount] = await Promise.all([
        tx.company.count({ where: { permissionTemplateId: id } }),
        tx.companyUser.count({ where: { permissionTemplateId: id } }),
      ]);
      if (companyCount + companyUserCount > 0) {
        throw new ConflictException(MSG.template_in_use);
      }

      await tx.permissionTemplate.delete({ where: { id } });
    });
  }

  /** A template usable by this company when assigning an employee: a global
   * preset, or one of its own — never another company's (guessing an id must
   * not smuggle in a foreign template). */
  async assertAssignable(templateId: string, companyId: string): Promise<void> {
    const template = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.permissionTemplate.findUnique({ where: { id: templateId }, select: { companyId: true } }),
    );
    if (!template || (template.companyId !== null && template.companyId !== companyId)) {
      throw new NotFoundException(MSG.template_not_found);
    }
  }

  /** The caller's own scope only: an owner reaches its company's templates,
   * the admin reaches global ones. Anything else reads as "not found" — the
   * same non-enumeration stance the rest of the app takes. */
  private async getOwned(tx: Tx, id: string, scope: TemplateScope) {
    const existing = await tx.permissionTemplate.findUnique({ where: { id } });
    if (!existing || existing.companyId !== scope.companyId) throw new NotFoundException(MSG.template_not_found);
    return existing;
  }
}
