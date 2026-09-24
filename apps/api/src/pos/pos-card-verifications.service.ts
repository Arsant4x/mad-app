import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../auth/types';
import { branchFilter } from '../branches/branch-scope.util';
import { money } from '../common/money/text';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { localDateOf, SCHEDULE_TIME_ZONE } from '../common/wall-clock.util';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

/** ما يُسأل عنه: المفتوحُ (لم تطالب به تسوية) · ما تجاوز المهلة · ما طابقته تسوية · الكلّ. */
export type CardVerificationState = 'open' | 'overdue' | 'matched' | 'all';

const DAY_MS = 86_400_000;

/**
 * ⭐ **دفعاتُ البطاقة التي لم تمرّ بالمزوّد — غيرُ متحقَّقةٍ حتى تطالب بها تسويةُ الشبكة** (`ق-١٣٩٧` · `ق-١٣٩٩`).
 *
 * بنصّ المالك (س١): «**ويُعلَّم «غيرَ متحقَّق» حتى يُطابَق بتسوية الشبكة المبنيّة · وما لا يُطابَق بعد مهلة التسوية يُرفع
 * للمراجعة باسم الكاشير. ⇒ فليس تخميناً: الدفعُ وقع، والتحقّقُ يتأخّر ويقع بالتسوية.**» · و(س٣): «**ولا يُعدّ نهائياً حتى
 * تطابقه التسوية، فإن خالفته رُفع.**»
 *
 * **والمطابقةُ مشتقّةٌ لا مخزَّنة**: صفُّ البطاقة يعلن بمَ ثبت (`DEVICE_REFERENCE` · `MANUAL_EVIDENCE`)، وتطابقه التسويةُ حين
 * تطالب بسند قبض الشبكة لفاتورته (`Payment.networkSettlementId` — `ق-١٢٦١` ج). فإلغاءُ التسوية يُعيده «غيرَ مطابَق» بلا كتابة.
 * **والمهلةُ إعدادُ المنشأة** (`posCardSettlementDays`) — ودورةُ التسوية تختلف بالمستحوذ.
 *
 * ⚠️ **حدودٌ معلَنة**: (١) **اليومُ يومُ `UTC`** — منطقةُ المنشأة الزمنية «تُكتب ولا تُقرأ بعد» (`ق-١٣٦٨`)، فالرفعُ قد يتأخّر
 * ساعاتٍ عن منتصف ليل التاجر ولا يتقدّم. (٢) المطابقةُ **بالسند كلِّه** لا بالعملية: التسويةُ تطالب بسندات القبض لا بمرجع
 * الجهاز — فلا تقول إن مرجعَ الجهاز نفسَه هو الذي حُوِّل، بل إن المبلغَ دخل التسوية. (٣) صفوفُ «أكّده الكاشير» (بلا ربط)
 * خارج هذا الرفع — لم يُحكم فيها (سؤالٌ في التقرير).
 */
@Injectable()
export class PosCardVerificationsService {
  private readonly logger = new Logger(PosCardVerificationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * القائمةُ للمراجعة — باسم الكاشير وبحال المطابقة والمهلة.
   * **على مستوى المنشأة بحقّها**: مرشَّحةٌ بفروع القارئ عبر فرع الفاتورة.
   */
  list(tenant: TenantContext, state: CardVerificationState = 'open') {
    return this.tenantPrisma.runInTenantContext(tenant.companyId, async (tx) => {
      const { days, rows } = await this.rows(tx, tenant.companyId, tenant.allowedBranchIds, new Date());
      const items = state === 'all' ? rows : state === 'matched' ? rows.filter((r) => r.matched) : state === 'overdue' ? rows.filter((r) => r.overdue) : rows.filter((r) => !r.matched);
      return { settlementDays: days, items, unresolvedAttempts: await this.unresolvedAttempts(tx, tenant.allowedBranchIds) };
    });
  }

  /**
   * ⚖️ **المعلّقُ من مناوبةٍ مقفلة ينتقل إلى قائمة المطابقة** (`ق-١٤١٨` · التوجيه ٢٦٣ §٥): المناوبةُ أُقفلت وهو فيها مسمّىً
   * (`closeShift`)، **ويبقى هنا حتى يُحسم** — بجواب المزوّد (الكانس كلَّ عشر دقائق) أو بالدليل لصاحب المراجعة — **ولا يُخمَّن**:
   * لا بيعَ يُسجَّل له ولا يُرفض حتى يُجاب. وما اكتمل منه صار دفعةً في `items` كسائر البطاقة.
   * **على مستوى المنشأة بحقّها**: مرشَّحةٌ بفروع القارئ عبر فرع المناوبة.
   */
  private async unresolvedAttempts(tx: Tx, allowedBranchIds: string[] | 'all') {
    const rows = await tx.posPaymentAttempt.findMany({
      where: {
        status: { in: ['CHARGING', 'UNKNOWN', 'APPROVED'] },
        shift: { status: 'CLOSED', ...(branchFilter(allowedBranchIds) as Prisma.PosShiftWhereInput) },
      },
      select: { id: true, status: true, cardAmount: true, provider: true, createdAt: true, detail: true, shift: { select: { openedByName: true, closedAt: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return rows.map((a) => ({
      attemptId: a.id,
      status: a.status,
      amount: money(a.cardAmount),
      provider: a.provider,
      createdAt: a.createdAt.toISOString(),
      detail: a.detail,
      cashierName: a.shift.openedByName,
      shiftClosedAt: a.shift.closedAt?.toISOString() ?? null,
    }));
  }

  /**
   * ⚖️ **الرفعُ للمراجعة باسم الكاشير** — مرّةً لكلِّ دفعة (مفتاحُ التكرار بمعرّفها)، إلى المالك (يرى كلَّ شيءٍ في منشأته).
   * يُستدعى من المهمّة الدورية، ويعيد عددَ ما رُفع الآن.
   */
  async raiseOverdue(companyId: string, now = new Date()): Promise<number> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const { days, rows } = await this.rows(tx, companyId, 'all', now);
      let raised = 0;
      for (const r of rows.filter((x) => x.overdue)) {
        const how = r.verification === 'MANUAL_EVIDENCE' ? `حسمٌ يدويٌّ بدليل${r.resolvedByName ? ` (${r.resolvedByName})` : ''}` : 'بيعٌ دون اتصالٍ برقم مرجع الجهاز';
        const created = await NotificationsService.raise(tx, companyId, {
          kind: 'POS_CARD_UNMATCHED',
          dedupeKey: `pos-card-unmatched:${r.posPaymentId}`,
          title: `دفعةُ بطاقةٍ لم تطابقها التسوية — الكاشير ${r.cashierName ?? '—'}`,
          body: `الفاتورة ${r.invoiceNo} (${r.issueDate}) · ${r.amount} · ${how} · مرجعُ الجهاز ${r.deviceReference ?? '—'} — لم تطالب بها تسويةُ الشبكة بعد ${days} أيام من البيع. راجعها مع كشف المستحوذ.`,
          linkScreen: 'pos',
          linkId: r.invoiceId,
        });
        if (created) raised += 1;
      }
      return raised;
    });
  }

  /**
   * كلَّ ساعة لكلِّ منشأةٍ فعّالة. والمنطقةُ معلنةٌ بحارس `ق-١٢٧٩` (كلُّ جدولٍ غيرِ دقائقيٍّ يعلنها) — وهي منطقةُ الجدولة الثابتة
   * القائمة (دَينٌ معدود في مسح التوطين)، لا منطقةُ المنشأة؛ واليومُ في المقارنة يومُ `UTC` معلَناً أعلاه.
   */
  @Cron(CronExpression.EVERY_HOUR, { timeZone: SCHEDULE_TIME_ZONE })
  async raiseOverdueForAllCompanies(): Promise<{ companies: number; raised: number }> {
    // العميلُ غيرُ المقيَّد عمداً: هذا الموضعُ يعبر المستأجرين ليدخل سياقَ كلٍّ.
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    let raised = 0;
    for (const c of companies) {
      try {
        raised += await this.raiseOverdue(c.id);
      } catch (e) {
        this.logger.error(`رفعُ دفعات البطاقة غير المطابَقة أخفق للمنشأة ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }
    if (raised > 0) this.logger.log(`دفعاتُ بطاقةٍ غيرُ مطابَقة رُفعت للمراجعة: ${raised} عبر ${companies.length} منشأة`);
    return { companies: companies.length, raised };
  }

  /**
   * **على مستوى المنشأة بحقّها** في سندات القبض: تُقرأ بمعرّفات فواتير قُرئت مرشَّحةً بفروع القارئ في العبارة التي قبلها —
   * فلا يبلغ القارئَ سندُ فرعٍ لا يراه.
   */
  private async rows(tx: Tx, companyId: string, allowedBranchIds: string[] | 'all', now: Date) {
    const { posCardSettlementDays: days } = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { posCardSettlementDays: true } });
    const payments = await tx.posPayment.findMany({
      where: {
        method: 'CARD',
        verification: { in: ['DEVICE_REFERENCE', 'MANUAL_EVIDENCE'] },
        invoice: branchFilter(allowedBranchIds) as Prisma.InvoiceWhereInput,
      },
      select: {
        id: true,
        amount: true,
        verification: true,
        deviceReference: true,
        approvalCode: true,
        attempt: { select: { resolvedByName: true } },
        invoice: { select: { id: true, no: true, issueDate: true, posShift: { select: { openedByName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const invoiceIds = [...new Set(payments.map((p) => p.invoice.id))];
    // سندُ قبض الشبكة لكلِّ فاتورة — وبه تطالب التسوية (بالمعرّف: `§6.3`).
    const receipts = invoiceIds.length
      ? await tx.payment.findMany({
          where: { method: 'CARD', allocations: { some: { invoiceId: { in: invoiceIds } } } },
          select: { no: true, networkSettlementId: true, networkSettlement: { select: { no: true } }, allocations: { select: { invoiceId: true } } },
        })
      : [];
    const byInvoice = new Map<string, (typeof receipts)[number]>();
    for (const r of receipts) for (const a of r.allocations) byInvoice.set(a.invoiceId, r);

    const today = Date.parse(localDateOf(now, 0));
    const rows = payments.map((p) => {
      const receipt = byInvoice.get(p.invoice.id);
      const matched = Boolean(receipt?.networkSettlementId);
      const issueDate = p.invoice.issueDate.toISOString().slice(0, 10);
      const ageDays = Math.floor((today - Date.parse(issueDate)) / DAY_MS);
      return {
        posPaymentId: p.id,
        invoiceId: p.invoice.id,
        invoiceNo: p.invoice.no,
        issueDate,
        amount: money(p.amount),
        verification: p.verification,
        deviceReference: p.deviceReference,
        approvalCode: p.approvalCode,
        resolvedByName: p.attempt?.resolvedByName ?? null,
        cashierName: p.invoice.posShift?.openedByName ?? null,
        receiptNo: receipt?.no ?? null,
        settlementNo: receipt?.networkSettlement?.no ?? null,
        matched,
        ageDays,
        overdue: !matched && ageDays > days,
      };
    });
    return { days, rows };
  }
}
