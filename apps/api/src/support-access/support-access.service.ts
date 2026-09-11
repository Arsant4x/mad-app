import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupportAccessGrant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { MSG } from '../common/i18n/messages';

/** أقصى نافذة يُسمح بطلبها: يوم واحد — الدعم زيارة، لا إقامة. */
const MAX_DURATION_MINUTES = 24 * 60;

export function isGrantActive(grant: SupportAccessGrant, now = new Date()): boolean {
  return grant.status === 'APPROVED' && !!grant.expiresAt && grant.expiresAt > now;
}

/**
 * وضع الدعم الفني (احتياجات §1.10).
 *
 * Two halves, two actors: the PLATFORM ADMIN requests (unscoped reads via
 * PrismaService — the deletion-requests pattern), the OWNER decides and
 * watches (tenant-scoped via runInTenantContext). Enforcement itself lives
 * in TenantGuard; this service only manages the grant lifecycle and the log.
 */
@Injectable()
export class SupportAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  // ---------- جانب مدير المنصة ----------

  /** `screens`: نطاقُ ما يُرى — يُخزَّن كما اختاره الطالب ليقرأه المالكُ قبل قراره (`ق-٥٢٧`). */
  async request(admin: { id: string; username: string }, companyId: string, reason: string, durationMinutes: number, screens: string[]) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true, orgName: true } });
    if (!company) throw new NotFoundException(MSG.company_not_found);

    const duration = Math.min(Math.max(Math.trunc(durationMinutes), 5), MAX_DURATION_MINUTES);

    // طلب معلّق واحد أو نافذة فعّالة واحدة لكل منشأة — لا تكديس طلبات.
    const existing = await this.prisma.supportAccessGrant.findFirst({
      where: { companyId, OR: [{ status: 'PENDING' }, { status: 'APPROVED', expiresAt: { gt: new Date() } }] },
    });
    if (existing) throw new ConflictException(MSG.support_request_exists);

    return this.prisma.supportAccessGrant.create({
      data: {
        companyId,
        // يُحفظ لأن صفَّ المنشأة يزول بحذفها والإذنُ يبقى (ق-٥٣١).
        companyName: company.orgName,
        requestedById: admin.id,
        requestedByName: admin.username,
        reason,
        durationMinutes: duration,
        // بلا تكرارٍ وبترتيب القائمة المعتمدة — فما يراه المالك هو ما يُنفَذ حرفياً.
        screens: [...new Set(screens)],
      } as unknown as Prisma.SupportAccessGrantUncheckedCreateInput,
    });
  }

  /** كل الطلبات عبر المنشآت — للوحة المطوّر. **والاسمُ من الإذن نفسِه**: منشأةٌ حُذفت تبقى مسمّاةً هنا (`ق-٥٣١`). */
  adminList() {
    return this.prisma.supportAccessGrant.findMany({
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
  }

  /** النافذة الفعّالة لمنشأة — يستعملها الحارس على كل طلب دعم. */
  activeGrantFor(companyId: string) {
    return this.prisma.supportAccessGrant.findFirst({
      where: { companyId, status: 'APPROVED', expiresAt: { gt: new Date() } },
    });
  }

  /**
   * سطر السجل — unscoped عمداً: يُكتب أثناء طلبِ مديرٍ لا يملك سياق مستأجر.
   * **و`actor` هو الداخلُ نفسُه** (`ق-٥٢٨`) — لا طالبُ الإذن الذي يُقرأ من `grant`.
   */
  logAccess(grantId: string, companyId: string, method: string, path: string, actor: { id: string; name: string }) {
    return this.prisma.supportAccessLog.create({
      data: { grantId, companyId, method, path, actorId: actor.id, actorName: actor.name } as unknown as Prisma.SupportAccessLogUncheckedCreateInput,
    });
  }

  // ---------- جانب مالك المنشأة ----------

  /** ما يعرضه إعداد المالك: المعلّق + الفعّال + آخر المحسومة. */
  ownerOverview(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const grants = await tx.supportAccessGrant.findMany({ orderBy: { requestedAt: 'desc' }, take: 20 });
      const now = new Date();
      return grants.map((g) => ({ ...g, active: isGrantActive(g, now) }));
    });
  }

  decide(companyId: string, grantId: string, approve: boolean) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const grant = await tx.supportAccessGrant.findUnique({ where: { id: grantId } });
      if (!grant) throw new NotFoundException(MSG.support_grant_not_found);
      if (grant.status !== 'PENDING') throw new ConflictException(MSG.support_grant_not_pending);

      return tx.supportAccessGrant.update({
        where: { id: grantId },
        data: approve
          ? { status: 'APPROVED', decidedAt: new Date(), expiresAt: new Date(Date.now() + grant.durationMinutes * 60_000) }
          : { status: 'DENIED', decidedAt: new Date() },
      });
    });
  }

  /** المالك يقطع النافذة متى شاء — بلا انتظار انقضائها. */
  revoke(companyId: string, grantId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const grant = await tx.supportAccessGrant.findUnique({ where: { id: grantId } });
      if (!grant) throw new NotFoundException(MSG.support_grant_not_found);
      if (!isGrantActive(grant)) throw new ConflictException(MSG.support_grant_not_active);
      return tx.supportAccessGrant.update({ where: { id: grantId }, data: { status: 'REVOKED', expiresAt: new Date() } });
    });
  }

  /** «سجل الوصول»: كل ما فعله الدعم، بطلبه وسببه — أمام عينَي المالك. */
  ownerLog(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.supportAccessLog.findMany({
        orderBy: { at: 'desc' },
        take: 500,
        include: { grant: { select: { requestedByName: true, reason: true } } },
      }),
    );
  }
}
