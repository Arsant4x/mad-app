import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { MSG } from '../common/i18n/messages';

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
  { key: 'customers', label: 'العملاء', delegate: 'customer', nameField: 'name' },
  { key: 'suppliers', label: 'الموردون', delegate: 'supplier', nameField: 'name' },
  { key: 'products', label: 'المنتجات', delegate: 'product', nameField: 'name' },
  { key: 'employees', label: 'الموظفون', delegate: 'employee', nameField: 'fullName' },
  { key: 'banks', label: 'البنوك والصناديق', delegate: 'bank', nameField: 'name' },
  { key: 'warehouses', label: 'المستودعات', delegate: 'warehouse', nameField: 'name' },
  { key: 'scripts', label: 'قوالب الرسائل', delegate: 'messageScript', nameField: 'title' },
  { key: 'properties', label: 'العقارات', delegate: 'property', nameField: 'name' },
  { key: 'units', label: 'الوحدات', delegate: 'unit', nameField: 'unitNo' },
] as const;

type EntityKey = (typeof TRASHED_ENTITIES)[number]['key'];

type DelegateLike = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

function daysLeft(deletedAt: Date, now: Date): number {
  const purgeAt = new Date(deletedAt);
  purgeAt.setDate(purgeAt.getDate() + RETENTION_DAYS);
  return Math.max(0, Math.ceil((purgeAt.getTime() - now.getTime()) / 86400000));
}

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

  /** Everything currently recoverable, grouped by kind, soonest-to-purge first. */
  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const now = new Date();
      const groups = await Promise.all(
        TRASHED_ENTITIES.map(async (e) => {
          const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
          const rows = await delegate.findMany({
            // `not: null` is what tells the tenant extension to stop hiding
            // these — every other read gets deletedAt: null injected.
            where: { deletedAt: { not: null } },
            orderBy: { deletedAt: 'desc' },
            take: 200,
          });
          return {
            entity: e.key,
            label: e.label,
            items: rows.map((r) => ({
              id: r.id as string,
              name: (r[e.nameField] as string) ?? '—',
              deletedAt: (r.deletedAt as Date).toISOString(),
              daysLeft: daysLeft(r.deletedAt as Date, now),
            })),
          };
        }),
      );
      return { retentionDays: RETENTION_DAYS, groups: groups.filter((g) => g.items.length > 0) };
    });
  }

  /** Puts a record back. Clearing the stamp is all it takes — nothing was ever
   * removed, which is the whole reason soft delete is worth the columns. */
  restore(companyId: string, entityKey: string, id: string) {
    const e = this.entity(entityKey);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
      const row = await delegate.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!row) throw new NotFoundException(MSG.trash_item_not_found);
      await delegate.update({ where: { id }, data: { deletedAt: null } });
      return { restored: true, entity: e.key, id };
    });
  }

  /** Deletes for real, on the owner's explicit instruction. */
  async purge(companyId: string, entityKey: string, id: string): Promise<void> {
    const e = this.entity(entityKey);
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const delegate = (tx as unknown as Record<string, DelegateLike>)[e.delegate];
      const row = await delegate.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!row) throw new NotFoundException(MSG.trash_item_not_found);
      await delegate.delete({ where: { id } });
    });
  }

  /**
   * Nightly sweep clearing anything past the retention window.
   *
   * Runs on the unscoped client on purpose: this is a housekeeping job across
   * every tenant, and each row still carries its own companyId. A row whose
   * real delete is refused by a foreign key is left in place and logged rather
   * than failing the sweep — it simply stays recoverable, which is the safer
   * of the two wrong answers.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpired(): Promise<{ purged: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    let purged = 0;
    for (const e of TRASHED_ENTITIES) {
      const delegate = (this.prisma as unknown as Record<string, DelegateLike>)[e.delegate];
      try {
        const stale = await delegate.findMany({ where: { deletedAt: { lt: cutoff } }, take: 500 });
        for (const row of stale) {
          try {
            await delegate.delete({ where: { id: row.id as string } });
            purged += 1;
          } catch (err) {
            const reason = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : (err as Error).message;
            this.logger.warn(`Kept ${e.key} ${row.id as string} in the trash — real delete refused (${reason})`);
          }
        }
      } catch (err) {
        this.logger.error(`Trash sweep failed for ${e.key}: ${(err as Error).message}`);
      }
    }

    if (purged > 0) this.logger.log(`Trash sweep permanently removed ${purged} record(s) past ${RETENTION_DAYS} days`);
    return { purged };
  }
}
