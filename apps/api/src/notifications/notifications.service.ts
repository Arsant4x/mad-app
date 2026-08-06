import { Injectable, NotFoundException } from '@nestjs/common';
import { ActorType, NotificationKind, Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';

/**
 * In-system notifications.
 *
 * ⚠️ **Inside the platform only.** No email, SMS or push is wired up, so a
 * manager who never opens the app never learns anything from this. That is a
 * real limit and the screen says so rather than implying the message went out.
 *
 * Unlike the reminder queue — which is recomputed on every read — a
 * notification is a stored row. It has to survive being ignored, and it has to
 * remember whether anyone actually looked at it.
 */

/** One page of the bell. Older notifications stay in the table; nobody scrolls
 * to notification 300, and an unbounded list is how this screen gets slow. */
const PAGE = 100;

@Injectable()
export class NotificationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * Who may see which notification.
   *
   * The owner sees everything in the company — they carry the account, and a
   * notification nobody can see is worse than no notification. An employee sees
   * only what was addressed to them, so escalating "the manager isn't chasing
   * this" doesn't broadcast it to the person being escalated past.
   */
  private visibilityFilter(tenant: TenantContext): Prisma.NotificationWhereInput {
    if (tenant.actorType === ActorType.COMPANY_USER) {
      return { targetUserId: tenant.profileId };
    }
    return {};
  }

  list(tenant: TenantContext, unreadOnly = false) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const where: Prisma.NotificationWhereInput = {
        ...this.visibilityFilter(tenant),
        ...(unreadOnly ? { readAt: null } : {}),
      };

      const [notifications, unread] = await Promise.all([
        tx.notification.findMany({
          where,
          // Unread first, then newest: the point of the screen is what still
          // needs attention, not a chronology.
          orderBy: [{ readAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
          take: PAGE,
        }),
        tx.notification.count({ where: { ...this.visibilityFilter(tenant), readAt: null } }),
      ]);

      return { notifications, unread };
    });
  }

  /** Just the badge number — called often enough that it shouldn't drag the
   * whole list across with it. */
  unreadCount(tenant: TenantContext) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => ({
      unread: await tx.notification.count({ where: { ...this.visibilityFilter(tenant), readAt: null } }),
    }));
  }

  markRead(tenant: TenantContext, id: string) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      // Found *through the visibility filter*, so an employee can't mark a
      // colleague's notification read by guessing its id.
      const found = await tx.notification.findFirst({ where: { id, ...this.visibilityFilter(tenant) } });
      if (!found) throw new NotFoundException(MSG.notification_not_found);
      // Already-read keeps its original timestamp: when it was first seen is
      // the answer to "how long did this sit there".
      if (found.readAt) return found;

      return tx.notification.update({ where: { id }, data: { readAt: new Date() } });
    });
  }

  markAllRead(tenant: TenantContext) {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const result = await tx.notification.updateMany({
        where: { ...this.visibilityFilter(tenant), readAt: null },
        data: { readAt: new Date() },
      });
      return { marked: result.count };
    });
  }

  /**
   * Raises a notification, unless one with the same `dedupeKey` already exists.
   *
   * The unique index on (companyId, dedupeKey) is the actual guarantee — not
   * this method. A check-then-insert loses to a second process running the same
   * job at the same second, so the duplicate is caught at the database and
   * swallowed here.
   *
   * Takes a `tx` rather than opening its own: raising a notification is part of
   * whatever transaction decided it was warranted, and must roll back with it.
   */
  static async raise(
    tx: Prisma.TransactionClient,
    companyId: string,
    input: {
      kind: NotificationKind;
      dedupeKey: string;
      title: string;
      body: string;
      targetUserId?: string | null;
      linkScreen?: string;
      linkId?: string;
    },
  ): Promise<boolean> {
    try {
      await tx.notification.create({
        data: {
          companyId,
          kind: input.kind,
          dedupeKey: input.dedupeKey,
          title: input.title,
          body: input.body,
          targetUserId: input.targetUserId ?? null,
          linkScreen: input.linkScreen ?? null,
          linkId: input.linkId ?? null,
        } as unknown as Prisma.NotificationUncheckedCreateInput,
      });
      return true;
    } catch (e) {
      // P2002 = unique violation, i.e. this exact thing was already raised.
      // Anything else is a real failure and must not be hidden.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false;
      throw e;
    }
  }
}
