import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformDecision, PlatformDecisionAction, PlatformDecisionStatus, Prisma } from '@prisma/client';
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
      include: { requestedBy: { select: { displayName: true } }, decidedBy: { select: { displayName: true } } },
    });
  }

  /** **الطلبُ يحمل ملخّصَ أثره** — فالمُقرُّ يوافق على ما قُرئ لا على معرّفٍ مجرَّد. */
  async request(action: PlatformDecisionAction, targetId: string, summary: string, requestedById: string) {
    if (!summary.trim()) throw new BadRequestException(MSG.decision_summary_required);
    const open = await this.prisma.platformDecision.findFirst({ where: { action, targetId, status: { in: ['PENDING', 'APPROVED'] } }, select: { id: true, status: true } });
    if (open) throw new ConflictException(formatMessage(MSG.decision_already_open, { status: open.status }));
    return this.prisma.platformDecision.create({ data: { action, targetId, summary: summary.trim(), requestedById } });
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
   * 🔴 **الاستهلاك — يُنادى من داخل معاملة الفعل نفسِه**: فإن سقط الفعلُ سقط الاستهلاك معه،
   * ولا يبقى قرارٌ «مُنفَّذ» على فعلٍ لم يقع.
   *
   * **ويرمي إن لم يوجد إقرارٌ صالح** — فالمسارُ الحرج لا يمضي بلا يدين.
   */
  async consumeWithinTx(tx: Prisma.TransactionClient, action: PlatformDecisionAction, targetId: string): Promise<PlatformDecision> {
    const approved = await tx.platformDecision.findFirst({ where: { action, targetId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
    if (!approved) throw new ConflictException(formatMessage(MSG.decision_required, { action: PLATFORM_ACTION_LABEL[action] }));
    return tx.platformDecision.update({ where: { id: approved.id }, data: { status: 'EXECUTED', executedAt: new Date() } });
  }

  /** نظيرُه خارج معاملة — للمسارات التي لا معاملةَ لها. */
  consume(action: PlatformDecisionAction, targetId: string) {
    return this.prisma.$transaction((tx) => this.consumeWithinTx(tx, action, targetId));
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

/** تسميةُ الفعل في رسالة الرفض — **فيُعرف ما ينقص**، لا أنه رُدّ. */
export const PLATFORM_ACTION_LABEL: Record<PlatformDecisionAction, string> = {
  ACCOUNT_ERASURE: 'محو بيانات منشأة',
  SUBSCRIPTION_CHANGE: 'تعديل اشتراك',
  REFUND: 'ردّ مال',
};
