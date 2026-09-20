import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { listItems, pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { suggestSector } from './sectors';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — اسمُ النشاط ونوعُه. */
const ACTIVITY_SEARCH_FIELDS = ['name', 'activityType'] as const;

/** Same rule as branches: what lines of business a company runs is an
 * owner-level decision, not something an employee redefines. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.branch_forbidden);
  }
}

@Injectable()
export class ActivitiesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** Readable by any tenant actor — the list feeds the activity picker on the
   * branches and products screens. */
  list(companyId: string, query?: PagedQueryDto) {
    const where: Prisma.BusinessActivityWhereInput = { ...searchWhere(searchTerm(query), ACTIVITY_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const result = await pagedFindMany(query, tx.businessActivity, { where, orderBy: { createdAt: 'asc' } });

      // The counts are what make the delete guard understandable *before* the
      // owner presses delete rather than after it fails — computed for the rows
      // returned (the whole list, or the page), never for rows outside it.
      const withCounts = await Promise.all(
        listItems(result).map(async (activity) => ({
          ...activity,
          branchCount: await tx.branch.count({ where: { activityId: activity.id } }),
          productCount: await tx.product.count({ where: { activityId: activity.id } }),
        })),
      );
      return Array.isArray(result) ? withCounts : { ...result, items: withCounts };
    });
  }

  create(companyId: string, actorType: string, dto: CreateActivityDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const name = dto.name.trim();
      // No DB unique constraint here — the name is descriptive, not an
      // identifier — so duplicate prevention is a service-level courtesy.
      const clash = await tx.businessActivity.findFirst({ where: { name } });
      if (clash) throw new ConflictException(formatMessage(MSG.activity_name_taken, { name }));

      return tx.businessActivity.create({
        data: {
          name,
          activityType: dto.activityType?.trim() || null,
          // ما أكّده المالك صراحةً — أو لا شيء.
          sector: dto.sector ?? null,
          /**
           * ⚠️ **الاقتراح يُكتب هنا ولا يُكتب في `sector` أبداً.**
           *
           * المطابقة الآلية تقرأ نصّاً حرّاً ككلمة «متجر» أو «مؤسسة» — وهي
           * لا تُطابق بثقة. وخطأٌ واحد **يُخفي شاشةً يعمل عليها تاجر**،
           * فالمالك يؤكّد. ودمجُ الحقلين يمحو الفرق بين «رشّحه الحاسوب»
           * و«أكّده الإنسان» — فلا يُعرف بعدها أيّهما جرى.
           */
          sectorSuggested: dto.sector ? null : suggestSector(dto.activityType),
        } as unknown as Prisma.BusinessActivityUncheckedCreateInput,
      });
    });
  }

  update(companyId: string, actorType: string, id: string, dto: UpdateActivityDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.businessActivity.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.activity_not_found);

      const data: Prisma.BusinessActivityUncheckedUpdateInput = {};
      if (dto.name !== undefined) {
        const name = dto.name.trim();
        const clash = await tx.businessActivity.findFirst({ where: { name, id: { not: id } } });
        if (clash) throw new ConflictException(formatMessage(MSG.activity_name_taken, { name }));
        data.name = name;
      }
      if (dto.activityType !== undefined) {
        data.activityType = dto.activityType.trim() || null;
        // نصٌّ جديد ⇒ اقتراحٌ جديد — **ما لم يكن المالك قد أكّد قطاعاً**.
        // وإعادة الاقتراح فوق تأكيدٍ قائم تنقض قراره بلا أن يطلب.
        if (dto.sector === undefined && !existing.sector) data.sectorSuggested = suggestSector(dto.activityType);
      }
      /**
       * ⚠️ التأكيد **يمحو الاقتراح**: بقاؤهما معاً يجعل الشاشة تعرض
       * ترشيحاً لقطاعٍ مؤكَّد بالفعل — فيظنّ المالك أنه لم يؤكّد.
       */
      if (dto.sector !== undefined) {
        data.sector = dto.sector;
        data.sectorSuggested = null;
      }

      /**
       * التعطيل لا الحذف — والبيانات تبقى كما هي.
       *
       * ⚠️ ولا صفّ يُحذف: عقودُ منشأةٍ عطّلت «عقارات» تبقى في التقارير،
       * وتختفي شاشتها فقط. وإخفاؤها من التقارير يجعل ميزان المراجعة يكذب.
       */
      if (dto.disabled !== undefined) data.disabledAt = dto.disabled ? new Date() : null;

      return tx.businessActivity.update({ where: { id }, data });
    });
  }

  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.businessActivity.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.activity_not_found);

      // Both FKs are ON DELETE SET NULL, so deleting would quietly detach
      // branches and products instead of failing — refuse while anything
      // still points here.
      const [branches, products] = await Promise.all([
        tx.branch.count({ where: { activityId: id } }),
        tx.product.count({ where: { activityId: id } }),
      ]);
      if (branches + products > 0) throw new ConflictException(MSG.activity_in_use);

      // Branch creation falls back to the first activity when none is chosen
      // (BranchesService.resolveActivityId), so an activity-less company would
      // silently start producing unassigned branches.
      const total = await tx.businessActivity.count();
      if (total <= 1) throw new ConflictException(MSG.activity_last_one);

      await tx.businessActivity.delete({ where: { id } });
    });
  }
}
