import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@mad-app/db';
import { branchFilter, warehouseFilter } from '../branches/branch-scope.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { MSG, formatMessage } from '../common/i18n/messages';
import { RowRetention, retentionOf } from './trash-retention.util';
import { SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';

/** How long a deleted record stays recoverable (gap-analysis §1). Long enough
 * to notice the mistake, short enough that the trash doesn't become a second
 * database nobody maintains. */
export const RETENTION_DAYS = 30;

/**
 * The entities the trash covers, with the Arabic label a user recognises and
 * the field that identifies a row to them — "عميل «مؤسسة النخيل»" reads far
 * better than a uuid when deciding what to restore.
 */
const TRASHED_ENTITIES = [
  { key: 'customers', label: 'العملاء', delegate: 'customer', model: 'Customer', nameField: 'name' },
  { key: 'suppliers', label: 'الموردون', delegate: 'supplier', model: 'Supplier', nameField: 'name' },
  { key: 'products', label: 'المنتجات', delegate: 'product', model: 'Product', nameField: 'name' },
  { key: 'employees', label: 'الموظفون', delegate: 'employee', model: 'Employee', nameField: 'fullName' },
  { key: 'banks', label: 'البنوك والصناديق', delegate: 'bank', model: 'Bank', nameField: 'name' },
  { key: 'warehouses', label: 'المستودعات', delegate: 'warehouse', model: 'Warehouse', nameField: 'name' },
  { key: 'scripts', label: 'قوالب الرسائل', delegate: 'messageScript', model: 'MessageScript', nameField: 'title' },
  { key: 'properties', label: 'العقارات', delegate: 'property', model: 'Property', nameField: 'name' },
  { key: 'units', label: 'الوحدات', delegate: 'unit', model: 'Unit', nameField: 'unitNo' },
] as const satisfies ReadonlyArray<{ key: string; label: string; delegate: string; model: Prisma.ModelName; nameField: string }>;

/**
 * كياناتُ السلّة التي تحمل عمودَ الفرع — **من المخطّط** (`Prisma.dmmf`) لا من قائمة (`ق-١٤٤٠`): اليومَ الموظّفون
 * والبنوك، وكيانٌ يدخل السلّةَ غداً بفرعٍ يُحرَس بلا لمس هذا الموضع. وسائرُها للمنشأة كلِّها فلا مرشِّحَ عليها.
 *
 * 🔴 **وقائمةُ السلّة نفسُها مرشَّحةٌ بها** (`ق-١٤٥٢`) لا الوصولُ بالمعرّف وحدَه — قِيس: موظّفٌ مقيَّدٌ بالشمال كان يرى في
 * القائمة موظّفَ الجنوب وصندوقَه المحذوفَين.
 */
const BRANCH_BEARING_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models.filter((m) => m.fields.some((f) => f.name === 'branchId')).map((m) => m.name),
);

/**
 * 🔴 **نطاقُ الفاعل لكلِّ كيانٍ في السلّة** (توجيه ٢٧٧ · ٢أ · `ق-١٦١٩`، بالقاعدة ٣٧): المستودعُ لا يحمل عمودَ فرع، وفرعُه الفرعُ الذي
 * يشير إليه (`warehouseFilter`، تعريفُ «مستودعاته» نفسُه في الأرصدة)؛ فكان خارج المرشِّح، ويرى المقيَّدُ مستودعَ فرعٍ آخر محذوفاً
 * ويستعيده أو يمحوه. والمحذوفُ الذي بلا فرعٍ ظاهرٌ للجميع كما كان.
 */
function trashScope(model: string, allowedBranchIds: string[] | 'all'): Record<string, unknown> {
  if (BRANCH_BEARING_MODELS.has(model)) return branchFilter(allowedBranchIds);
  if (model === 'Warehouse') return warehouseFilter(allowedBranchIds);
  return {};
}

type DelegateLike = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

const DAY_MS = 86400000;

/** أوّلُ يومٍ يجوز فيه المحو: نافذةُ الثلاثين، أو أجلُ الحفظ النظاميّ إن كان أبعد. */
function purgeEligibleAt(deletedAt: Date, retention: RowRetention | undefined): Date {
  const windowEnd = new Date(deletedAt);
  windowEnd.setDate(windowEnd.getDate() + RETENTION_DAYS);
  const until = retention?.retainedUntil;
  return until && until > windowEnd ? until : windowEnd;
}

function daysUntil(at: Date, now: Date): number {
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private entity(key: string) {
    const found = TRASHED_ENTITIES.find((e) => e.key === key);
    if (!found) throw new NotFoundException(MSG.trash_entity_unknown);
    return found;
  }

  /**
   * 🔴 **الصفُّ المحذوفُ بفروع الفاعل** (`ق-١٤٤٠`): كانت الاستعادةُ والمحوُ تقرآن بالمعرّف وحدَه، فموظّفٌ مقيَّدٌ بفرعٍ
   * استعاد موظّفَ فرعٍ آخر وصندوقَه أو محاهما نهائياً. ⟸ ما يحمل الفرعَ يُقرأ بـ`branchFilter` (وما للمنشأة كلِّها
   * `branchId: null` مرئيٌّ للجميع)، وصفُّ فرعٍ آخر **غيرُ موجودٍ له** (`404`) — قبل الحفظ النظاميّ وقبل أيّ كتابة.
   */
  private async findTrashedVisible(delegate: DelegateLike, model: Prisma.ModelName, allowedBranchIds: string[] | 'all', id: string) {
    const scope = trashScope(model, allowedBranchIds);
    const row = await delegate.findFirst({ where: { id, deletedAt: { not: null }, ...scope } });
    if (!row) throw new NotFoundException(MSG.trash_item_not_found);
    return row;
  }

  /**
   * Everything currently recoverable, grouped by kind, soonest-to-purge first.
   *
   * كلُّ صفٍّ يحمل حالَه أمام الحفظ النظاميّ (`ق-١٢٧١`/أ): ما يشير إليه سجلٌّ يُعلَن
   * «محفوظٌ نظاماً حتى …» بأسماء ما يحفظه — فلا يقرأ التاجر «٣ أيام» على ما لن يُمحى.
   */
  list(companyId: string, allowedBranchIds: string[] | 'all') {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const now = new Date();
      const groups = await Promise.all(
        TRASHED_ENTITIES.map(async (e) => {
          const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
          const rows = await delegate.findMany({
            // `not: null` is what tells the tenant extension to stop hiding
            // these — every other read gets deletedAt: null injected.
            where: { deletedAt: { not: null }, ...trashScope(e.model, allowedBranchIds) },
            orderBy: { deletedAt: 'desc' },
            take: 200,
          });
          const retention = await retentionOf(tx, e.model, rows.map((r) => ({ id: r.id as string, deletedAt: r.deletedAt as Date })));
          return {
            entity: e.key,
            label: e.label,
            items: rows.map((r) => {
              const ret = retention.get(r.id as string);
              const deletedAt = r.deletedAt as Date;
              return {
                id: r.id as string,
                name: (r[e.nameField] as string) ?? '—',
                deletedAt: deletedAt.toISOString(),
                daysLeft: daysUntil(purgeEligibleAt(deletedAt, ret), now),
                retainedUntil: ret?.retainedUntil ? isoDay(ret.retainedUntil) : null,
                retainedBy: ret?.retainedBy ?? [],
              };
            }),
          };
        }),
      );
      return { retentionDays: RETENTION_DAYS, groups: groups.filter((g) => g.items.length > 0) };
    });
  }

  /** Puts a record back. Clearing the stamp is all it takes — nothing was ever
   * removed, which is the whole reason soft delete is worth the columns. */
  restore(companyId: string, allowedBranchIds: string[] | 'all', entityKey: string, id: string) {
    const e = this.entity(entityKey);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
      // ق-١٤٤٠: صفُّ فرعٍ آخر غيرُ موجودٍ للفاعل — 404 لا 403، فلا يُستعاد ما لا يراه.
      await this.findTrashedVisible(delegate, e.model, allowedBranchIds, id);
      await delegate.update({ where: { id }, data: { deletedAt: null } });
      return { restored: true, entity: e.key, id };
    });
  }

  /**
   * Deletes for real, on the owner's explicit instruction — **إلا ما تحت الحفظ**: يُردّ `409`
   * مسمّىً بالأجل وبما يحفظه، لا خطأَ قاعدةٍ خاماً ولا محواً يجرّ سجلاتٍ معه.
   */
  async purge(companyId: string, allowedBranchIds: string[] | 'all', entityKey: string, id: string): Promise<void> {
    const e = this.entity(entityKey);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
      // ق-١٤٤٠: صفُّ فرعٍ آخر غيرُ موجودٍ للفاعل — 404 قبل الحفظ النظاميّ (فلا يكشفه 409) وقبل المحو.
      const row = await this.findTrashedVisible(delegate, e.model, allowedBranchIds, id);
      const ret = (await retentionOf(tx, e.model, [{ id, deletedAt: row.deletedAt as Date }])).get(id);
      if (ret?.retainedUntil && ret.retainedUntil > new Date()) {
        throw new ConflictException(formatMessage(MSG.trash_retained_by_law, { until: isoDay(ret.retainedUntil), by: ret.retainedBy.join(' · ') }));
      }
      await delegate.delete({ where: { id } });
    });
  }

  /**
   * Nightly sweep clearing anything past the retention window.
   *
   * **منشأةً منشأةً داخل سياقها**: الجداولُ تحت `FORCE ROW LEVEL SECURITY`، والعميلُ غيرُ المقيَّد
   * يقرؤها **فارغةً بنجاح** — وهكذا كان الكنسُ منذ بُني: يعمل كلَّ ليلة ولا يرى صفّاً (مقيسٌ 2026-09-22:
   * عميلٌ في السلّة منذ أربعين يوماً، `rawSees: 0 · purged: 0`). فالعميلُ الخام يعبر المنشآت ليدخل
   * سياقَ كلٍّ (نمطُ `rent-accrual`)، وما تحت الحفظ النظاميّ يُترك بعدٍّ وتُذكر منشأتُه.
   *
   * A row whose real delete is refused by a foreign key is left in place and
   * logged rather than failing the sweep — it simply stays recoverable, which
   * is the safer of the two wrong answers.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: SCHEDULE_TIME_ZONE })
  async purgeExpired(): Promise<{ companies: number; purged: number; retained: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
    // العميلُ غيرُ المقيَّد عمداً: هذا الموضعُ يعبر المستأجرين ليدخل سياقَ كلٍّ.
    const companies = await this.prisma.company.findMany({ select: { id: true } });

    let purged = 0;
    let retained = 0;
    for (const c of companies) {
      try {
        const r = await this.purgeExpiredForCompany(c.id, cutoff);
        purged += r.purged;
        retained += r.retained;
      } catch (err) {
        this.logger.error(`Trash sweep failed for company ${c.id}: ${(err as Error).message}`);
      }
    }

    if (purged > 0 || retained > 0) {
      this.logger.log(`Trash sweep: permanently removed ${purged} record(s) past ${RETENTION_DAYS} days across ${companies.length} companies; ${retained} kept under statutory retention`);
    }
    return { companies: companies.length, purged, retained };
  }

  /**
   * كنسُ منشأةٍ واحدة — داخل سياقها؛ يُعيد ما مُحي وما بقي محفوظاً نظاماً.
   *
   * القراءةُ والتصنيفُ في معاملةٍ، **وكلُّ محوٍ في معاملته**: حذفٌ ترفضه القاعدة (`P2003`) يُفسد
   * معاملةَ Postgres التي وقع فيها فتسقط بقيةُ العبارات — فلا يُشارك الصفوفَ الأخرى معاملتَه.
   */
  async purgeExpiredForCompany(companyId: string, cutoff: Date): Promise<{ purged: number; retained: number }> {
    const now = new Date();
    const plan = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const deletable: Array<{ entity: (typeof TRASHED_ENTITIES)[number]; id: string }> = [];
      let retained = 0;
      for (const e of TRASHED_ENTITIES) {
        const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
        const stale = await delegate.findMany({ where: { deletedAt: { lt: cutoff } }, take: 500 });
        const retention = await retentionOf(tx, e.model, stale.map((r) => ({ id: r.id as string, deletedAt: r.deletedAt as Date })));
        for (const row of stale) {
          const ret = retention.get(row.id as string);
          if (ret?.retainedUntil && ret.retainedUntil > now) retained += 1;
          else deletable.push({ entity: e, id: row.id as string });
        }
      }
      return { deletable, retained };
    });

    let purged = 0;
    for (const { entity, id } of plan.deletable) {
      try {
        await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
          await (tx as unknown as Record<string, DelegateLike>)[entity.delegate].delete({ where: { id } });
        });
        purged += 1;
      } catch (err) {
        const reason = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : (err as Error).message;
        this.logger.warn(`Kept ${entity.key} ${id} of company ${companyId} in the trash — real delete refused (${reason})`);
      }
    }
    if (plan.retained > 0) this.logger.warn(`Trash sweep: ${plan.retained} record(s) of company ${companyId} kept under statutory retention`);
    return { purged, retained: plan.retained };
  }
}
