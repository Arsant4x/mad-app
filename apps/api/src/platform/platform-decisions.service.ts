import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformDecision, PlatformDecisionAction, PlatformDecisionStatus, Prisma } from '@mad-app/db';
import { PrismaService } from '../prisma/prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * **الفعلُ الحرجُ على المنصّة بيدين لا بيد** (`ق-١٣١٨` · ⑪A1 — باب `⑪ تشغيلُ المنصّة`).
 *
 * «**محوُ بيانات منشأةٍ أو تغييرُ اشتراكها بيدٍ واحدة يقع مرّةً ولا يُردّ**»
 * (`docs/domain-scan/11` · A1).
 *
 * ## الدورة
 *
 * **يُطلب** بملخّصِ أثرٍ يُكتب لحظتَه · **ويُقرّه مديرٌ آخر** (والقاعدةُ ترفض المساواة، لا
 * الخدمةُ وحدَها) · **ثم يُستهلك مرّةً واحدة** عند التنفيذ فيصير `EXECUTED`.
 *
 * ⚠️ **والإقرارُ ليس تنفيذاً**: قرارٌ أُقرّ ولم يُنفَّذ يبقى صالحاً **مرّةً واحدة** — فمن
 * أقرّ محوَ منشأةٍ لا يُقرّ محوَها مرّتين بإقرارٍ واحد.
 *
 * ## ⛔ وحدٌّ معلَن: لا تعمل بحسابٍ منصّيٍّ واحد
 *
 * **وهو المقصود لا عطل**: بحسابٍ واحدٍ يُردّ كلُّ إقرار، فلا يقع الفعلُ الحرج. **والحسابُ
 * الثاني شرطُ تشغيلٍ لا شرطُ بناء** (`ق-٣١٠`) — يُبنى المسارُ ويُعلَن أنه ينتظر حساباً.
 *
 * ## وما ليس محروساً يُعلَن
 *
 * `REFUND` قيمةٌ في التعداد **بلا مستهلكٍ في المنتج** — لا مسارَ ردِّ مالٍ بعد. فهي معلَنةٌ
 * ولا يُدَّعى أنها محروسة، **ويُحرَس أوّلُ مسارٍ يُبنى لها** (حارسُ الكتالوج يمسك نسيانَه).
 */
@Injectable()
export class PlatformDecisionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: PlatformDecisionStatus) {
    return this.prisma.platformDecision.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: 'desc' },
      take: 200,
      include: {
        requestedBy: { select: { displayName: true } },
        decidedBy: { select: { displayName: true } },
        executedBy: { select: { displayName: true } },
      },
    });
  }

  /**
   * The request carries a summary of its effect and the values it will apply, written now: the
   * approver approves what was read, and applying requires those same values. A subscription
   * change carries its new end date; no other action carries one.
   */
  async request(action: PlatformDecisionAction, targetId: string, summary: string, requestedById: string, values: RequestedValues = {}) {
    if (!summary.trim()) throw new BadRequestException(MSG.decision_summary_required);
    const isSubscription = action === 'SUBSCRIPTION_CHANGE';
    if (isSubscription && !values.subEnd) throw new BadRequestException(MSG.decision_sub_end_required);
    if (!isSubscription && values.subEnd) throw new BadRequestException(MSG.decision_sub_end_not_applicable);
    // A subscription change requested before decisions carried their end can never be applied,
    // so it does not keep a new request out.
    const open = await this.prisma.platformDecision.findFirst({
      where: { action, targetId, status: { in: ['PENDING', 'APPROVED'] }, ...(isSubscription ? { requestedSubEnd: { not: null } } : {}) },
      select: { id: true, status: true },
    });
    if (open) throw new ConflictException(formatMessage(MSG.decision_already_open, { status: open.status }));
    return this.prisma.platformDecision.create({
      data: { action, targetId, summary: summary.trim(), requestedById, requestedSubEnd: isSubscription ? new Date(values.subEnd!) : null },
    });
  }

  /**
   * **المُقرُّ غيرُ الطالب** — يُردّ `409` مسمّىً، **والقاعدةُ تردّه كذلك** فمسارٌ آخر لا يلتفّ.
   */
  async decide(id: string, approve: boolean, decidedById: string, note?: string) {
    const existing = await this.prisma.platformDecision.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(MSG.decision_not_found);
    if (existing.status !== 'PENDING') throw new ConflictException(formatMessage(MSG.decision_not_pending, { status: existing.status }));
    if (existing.requestedById === decidedById) throw new ConflictException(MSG.decision_same_hand);

    return this.prisma.platformDecision.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById, decidedAt: new Date(), note: note?.trim() || null },
    });
  }

  /**
   * Spends an approved decision once, inside the transaction of the action it allows, so a failed
   * action leaves the decision unspent. Throws when no approved decision exists. A subscription
   * change is spent only for the end date it approved; any other date is refused naming the
   * approved one. The decision records who applied it.
   */
  async consumeWithinTx(
    tx: Prisma.TransactionClient,
    action: PlatformDecisionAction,
    targetId: string,
    executedById: string,
    values: AppliedValues = {},
  ): Promise<PlatformDecision> {
    const approved = await tx.platformDecision.findMany({ where: { action, targetId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
    if (approved.length === 0) throw new ConflictException(formatMessage(MSG.decision_required, { action: PLATFORM_ACTION_LABEL[action] }));
    const decision = action === 'SUBSCRIPTION_CHANGE' ? approvedForEnd(approved, values.subEnd ?? null) : approved[0];
    return tx.platformDecision.update({ where: { id: decision.id }, data: { status: 'EXECUTED', executedAt: new Date(), executedById } });
  }

  /** The same outside a transaction, for paths that have none. */
  consume(action: PlatformDecisionAction, targetId: string, executedById: string, values: AppliedValues = {}) {
    return this.prisma.$transaction((tx) => this.consumeWithinTx(tx, action, targetId, executedById, values));
  }

  /**
   * **يُتحقَّق قبل العمل، ويُستهلك بعده** — لمسارٍ فعلُه ليس معاملةً واحدة (نسخةٌ تُنتج ثم
   * حالاتٌ تُكتب). **فلا يقع فعلٌ مدمِّرٌ بلا إقرار**، **ولا يُختم قرارٌ «مُنفَّذ» على عملٍ سقط**.
   */
  async assertApproved(action: PlatformDecisionAction, targetId: string): Promise<void> {
    const approved = await this.prisma.platformDecision.findFirst({ where: { action, targetId, status: 'APPROVED' }, select: { id: true } });
    if (!approved) throw new ConflictException(formatMessage(MSG.decision_required, { action: PLATFORM_ACTION_LABEL[action] }));
  }
}

/** What a request asks for, as the client sent it. */
export interface RequestedValues {
  subEnd?: string;
}

/** What an action is about to apply. A subscription change with no end date applies none. */
export interface AppliedValues {
  subEnd?: Date | null;
}

/** A date at midnight UTC reads as the day; anything else as the full instant. */
function valueLabel(at: Date): string {
  const iso = at.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso;
}

/**
 * The approved subscription change whose end equals the one being applied. Instants are compared,
 * so the same day sent as a date or as midnight UTC matches.
 */
function approvedForEnd(approved: PlatformDecision[], subEnd: Date | null): PlatformDecision {
  const match = approved.find((d) => d.requestedSubEnd !== null && subEnd !== null && d.requestedSubEnd.getTime() === subEnd.getTime());
  if (match) return match;
  const bound = approved.find((d) => d.requestedSubEnd !== null);
  if (!bound) throw new ConflictException(MSG.decision_value_missing);
  throw new ConflictException(formatMessage(MSG.decision_value_mismatch, { approved: valueLabel(bound.requestedSubEnd!) }));
}

/** تسميةُ الفعل في رسالة الرفض — **فيُعرف ما ينقص**، لا أنه رُدّ. */
export const PLATFORM_ACTION_LABEL: Record<PlatformDecisionAction, string> = {
  ACCOUNT_ERASURE: 'محو بيانات منشأة',
  SUBSCRIPTION_CHANGE: 'تعديل اشتراك',
  REFUND: 'ردّ مال',
};
