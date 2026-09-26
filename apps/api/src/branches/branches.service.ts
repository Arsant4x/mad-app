import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';
import { CreateBranchDto } from './dto/create-branch.dto';
import { branchClosingReasons, branchContentReasons, branchHistoryCount } from './branch-references';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسمُ والنوع. */
const BRANCH_SEARCH_FIELDS = ['name', 'type'] as const;
import { UpdateBranchDto } from './dto/update-branch.dto';

const BRANCH_INCLUDE = { activity: true, property: true, warehouse: true } as const;

/** Creating and reshaping branches is an owner-level act — an employee working
 * inside a branch must not be able to invent new ones or move themselves into
 * another. Same pattern as CompanyUsersService/CompanyProfileService. */
function assertIsCompanyOwner(actorType: string): void {
  if (actorType !== 'COMPANY') {
    throw new ForbiddenException(MSG.branch_forbidden);
  }
}

@Injectable()
export class BranchesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** An employee sees only the branches assigned to them; the owner sees all.
   * This is the list the branch picker on other screens is built from, so the
   * filter has to live here rather than in the UI. */
  list(companyId: string, allowedBranchIds: string[] | 'all', query?: PagedQueryDto) {
    const where: Prisma.BranchWhereInput = { ...(allowedBranchIds === 'all' ? {} : { id: { in: allowedBranchIds } }), ...searchWhere(searchTerm(query), BRANCH_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => pagedFindMany(query, tx.branch, { where, include: BRANCH_INCLUDE, orderBy: { name: 'asc' } }));
  }

  create(companyId: string, actorType: string, dto: CreateBranchDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const activityId = await this.resolveActivityId(tx, dto.activityId);

      try {
        const created = await tx.branch.create({
          data: {
            name: dto.name.trim(),
            type: dto.type,
            activityId,
            propertyId: dto.propertyId,
            warehouseId: dto.warehouseId,
            hours: dto.hours,
          } as unknown as Prisma.BranchUncheckedCreateInput,
        });
        return tx.branch.findUniqueOrThrow({ where: { id: created.id }, include: BRANCH_INCLUDE });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.branch_name_taken, { name: dto.name.trim() }));
        }
        throw e;
      }
    });
  }

  update(companyId: string, actorType: string, id: string, dto: UpdateBranchDto) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.branch.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.branch_not_found);

      const data: Prisma.BranchUncheckedUpdateInput = {};
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.type !== undefined) data.type = dto.type;
      if (dto.hours !== undefined) data.hours = dto.hours;
      if (dto.propertyId !== undefined) data.propertyId = dto.propertyId || null;
      if (dto.warehouseId !== undefined) data.warehouseId = dto.warehouseId || null;
      if (dto.activityId !== undefined) data.activityId = await this.resolveActivityId(tx, dto.activityId);

      try {
        await tx.branch.update({ where: { id }, data });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException(formatMessage(MSG.branch_name_taken, { name: dto.name!.trim() }));
        }
        throw e;
      }
      return tx.branch.findUniqueOrThrow({ where: { id }, include: BRANCH_INCLUDE });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: العدُّ على الفرع المحذوف نفسِه لا على فروع
   * القارئ — والحذفُ فعلُ مالكٍ نطاقُه الكلّ، ومنعُه يقوم على تاريخ الفرع
   * كاملاً وإن حُجب عن غيره.
   *
   * 🔴 **ولا يُفرغه صامتاً** (`ق-١٤٣٥`): مفاتيحُ الفرع `SET NULL` كانت تُخرج ما فيه إلى «المنشأة كلِّها» بلا أثر، وإسنادُ
   * حساب الدخول `CASCADE` يترك الحسابَ بلا فرعٍ **فيرى الفروعَ كلَّها**. فكلُّ ما يشير إليه مصنَّفٌ في `BRANCH_REFERENCES`:
   * **التاريخُ لا يُنقل** فذو التاريخ لا يُحذف · **وما فيه والمفتوحُ من مستنداته** يوقف الحذفَ **في رفضٍ واحد** — سببٌ لكلِّ
   * صنفٍ بأسمائه، ويدلّ على النقل أو الإغلاق. **وصفُّ الفرع يُقفل أوّلاً** (`FOR UPDATE`): إدراجٌ يشير إليه يأخذ قفلَ المفتاح
   * على الصفّ نفسِه، فلا يقع بين الفحص والحذف ثم يُفرَغ بصمت.
   */
  async remove(companyId: string, actorType: string, id: string): Promise<void> {
    assertIsCompanyOwner(actorType);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.branch.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.branch_not_found);
      await tx.$queryRaw`SELECT "id" FROM "branches" WHERE "id" = ${id} FOR UPDATE`;

      // ⚖️ `ق-١٤٥٣`: «**والحذف: لفرعٍ لا أثرَ له إطلاقاً ولا في التاريخ، وما عداه يُدلّ على الإغلاق.**»
      const history = await branchHistoryCount(tx, id);
      if (history > 0) {
        const key = existing.closedAt ? MSG.branch_delete_history_closed : MSG.branch_delete_history;
        throw new ConflictException(formatMessage(key, { name: existing.name, count: history }));
      }
      const reasons = await branchContentReasons(tx, id);
      if (reasons.length > 0) throw new ConflictException([...reasons, formatMessage(MSG.branch_delete_suggest_close, { name: existing.name })]);

      await tx.branch.delete({ where: { id } });
    });
  }

  /**
   * ⚖️ **الإغلاق** (`ق-١٤٥٣`) بنصّ المالك: «**لا مستندَ جديدٌ فيه · ويبقى في التقارير والتاريخ · ويُعاد فتحُه بصلاحية. وشرطُه:
   * صناديقُه نُقلت أو أُقفلت · وموظّفوه نُقلوا · ومستنداتُه المفتوحة سُوّيت. والرفضُ يسمّي ما بقي ويدلّ على النقل.**»
   *
   * **فعلُ مالكٍ** كإنشاء الفرع وحذفه (`assertIsCompanyOwner`) — وهو «الصلاحيةُ» هنا. **وصفُّ الفرع يُقفل `FOR UPDATE`** قبل
   * الفحص: كلُّ مستندٍ جديدٍ يقرأ فرعَه بقفل المفتاح المشترك (`resolveBranchId`)، فلا يقع بين الفحص والإغلاق ثم يُكتب في مغلق.
   */
  close(companyId: string, actorType: string, id: string) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.lockBranch(tx, id);
      if (existing.closedAt) throw new ConflictException(formatMessage(MSG.branch_already_closed, { name: existing.name }));

      const reasons = await branchClosingReasons(tx, id);
      if (reasons.length > 0) throw new ConflictException(reasons);

      await tx.branch.update({ where: { id }, data: { closedAt: new Date() } });
      return tx.branch.findUniqueOrThrow({ where: { id }, include: BRANCH_INCLUDE });
    });
  }

  /** يُعاد فتحُه بيد المالك — فيقبل المستندات من جديد، وتاريخُه كما هو. */
  reopen(companyId: string, actorType: string, id: string) {
    assertIsCompanyOwner(actorType);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await this.lockBranch(tx, id);
      if (!existing.closedAt) throw new ConflictException(formatMessage(MSG.branch_not_closed, { name: existing.name }));

      await tx.branch.update({ where: { id }, data: { closedAt: null } });
      return tx.branch.findUniqueOrThrow({ where: { id }, include: BRANCH_INCLUDE });
    });
  }

  private async lockBranch(tx: Prisma.TransactionClient, id: string) {
    const existing = await tx.branch.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.branch_not_found);
    await tx.$queryRaw`SELECT "id" FROM "branches" WHERE "id" = ${id} FOR UPDATE`;
    return tx.branch.findUniqueOrThrow({ where: { id } });
  }

  /** Falls back to the company's default (first) activity when none is given,
   * which is what keeps activities invisible until a company actually runs
   * more than one line of business. */
  private async resolveActivityId(tx: Prisma.TransactionClient, activityId: string | undefined): Promise<string | null> {
    if (activityId) {
      const activity = await tx.businessActivity.findUnique({ where: { id: activityId } });
      if (!activity) throw new NotFoundException(MSG.activity_not_found);
      return activity.id;
    }
    const fallback = await tx.businessActivity.findFirst({ orderBy: { createdAt: 'asc' } });
    return fallback?.id ?? null;
  }
}
