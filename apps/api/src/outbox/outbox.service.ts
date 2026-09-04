import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { events, type DomainEvent } from '../shared/events/event-bus';

/** كم محاولة قبل أن يُعلَن الصفّ فاشلاً ويبقى ليُرى. */
export const MAX_ATTEMPTS = 6;

/**
 * تراجعٌ أُسّي بحدٍّ أعلى: دقيقة · دقيقتان · أربع … حتى ساعة.
 *
 * ولا عشوائيةَ هنا عمداً: الموزّع واحد والصفوف تُلتقط دفعةً — فالتشتيت لا يمنع
 * تصادماً، وحتميّةُ التوقيت تجعل السقوط قابلاً لإعادة الإنتاج.
 */
export function nextDelayMs(attempts: number): number {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), 3_600_000);
}

export interface OutboxRow {
  id: string;
  companyId: string;
  type: string;
  payload: unknown;
}

/** ما يُنفِّذ الإرسال فعلاً — يُسجَّل من وحدةٍ تعرف الجهة، لا من هنا. */
export type OutboxDispatcher = (row: OutboxRow) => Promise<void>;

export interface DispatchResult {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
}

const EMPTY: DispatchResult = { claimed: 0, sent: 0, retried: 0, failed: 0 };

/**
 * ⭐ **الطابور الذي يمنع «تُنشأ وتُنسى»** (`ق-٤٩` · `ق-١٢٨`).
 *
 * ## الكتابة — حدثُ امتثال
 *
 * `enqueueWithinTx` مسجَّلٌ مستمعاً **امتثالياً** على الناقل، فيجري **داخل معاملة
 * المستند**. وإن تعذّرت كتابة الصفّ **تُلغى المعاملة كلها**: لا فاتورة بلا
 * طابورها. وهذا ما يجعل الطابور ضمانةً لا رجاءً.
 *
 * ## ⚠️ ولماذا يمرّ الموزّع بكل منشأة على حدة
 *
 * `outbox_events` عليه `FORCE ROW LEVEL SECURITY`. فقراءةٌ بالعميل غير المنطاق
 * **تعيد صفر صفوفٍ بلا خطأ ولا تحذير** — وهو الفخّ الذي عُضّ به المشروع أربع
 * مرات، وأخطر ما فيه أن الموزّع يبدو عاملاً وهو لا يرى شيئاً. فالكنسة تقرأ
 * المنشآت النشطة بالعميل غير المنطاق (وجدول `companies` بلا RLS)، **ثم تدخل
 * سياق كل منشأة** — نفس نمط كنسة التنبيهات اليومية.
 *
 * 📌 **وحدّه معلَن**: استعلامٌ لكل منشأة في كل دورة. مقبولٌ بعشرات المنشآت،
 * ويحتاج عند الآلاف موزّعاً في عمليةٍ مستقلة وفهرساً جزئياً — **وهي العلامة
 * التي عُلِّق عليها بناء `worker`** (`ق-٤٠`). والمطالبة المشروطة أدناه هي ما
 * يجعل ذلك النقل **آمناً بلا تغيير منطق**.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly dispatchers = new Map<string, OutboxDispatcher>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /** يربط نوع حدثٍ بمن يرسله. صريحٌ لا اكتشافٌ تلقائي (`ق-٤٢`). */
  register(type: string, dispatcher: OutboxDispatcher): void {
    this.dispatchers.set(type, dispatcher);
    events.onCompliance(type, (tx, event) => this.enqueueWithinTx(tx, event));
  }

  /** يكتب الصفّ **في معاملة المُصدِر** — فشلُه يُسقطها. */
  async enqueueWithinTx(tx: Prisma.TransactionClient, event: DomainEvent): Promise<void> {
    await tx.outboxEvent.create({
      data: { companyId: event.companyId, type: event.type, payload: event.payload as Prisma.InputJsonValue },
    });
  }

  /** دورةٌ واحدة عبر المنشآت النشطة. */
  async dispatchDue(batchSize = 20, now = new Date()): Promise<DispatchResult> {
    const companies = await this.prisma.company.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    let total = { ...EMPTY };
    for (const c of companies) {
      try {
        total = add(total, await this.dispatchForCompany(c.id, batchSize, now));
      } catch (e) {
        // منشأةٌ تفشل لا توقف البقية — نفس قاعدة الكنسة اليومية.
        this.logger.error(`Outbox sweep failed for company ${c.id}`, e instanceof Error ? e.stack : String(e));
      }
    }
    return total;
  }

  /**
   * دورةٌ لمنشأةٍ واحدة **داخل سياقها** — وهي وحدة العمل القابلة للاختبار.
   *
   * والمطالبة بـ`updateMany` مشروطاً بـ`status: PENDING`: من يفوز بالتحديث يملك
   * الصفّ. **وهو ما يمنع إرسالاً مزدوجاً، لا ترتيبُ القراءة** — فيبقى صحيحاً لو
   * عمل موزّعان معاً.
   */
  dispatchForCompany(companyId: string, batchSize = 20, now = new Date()): Promise<DispatchResult> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const due = await tx.outboxEvent.findMany({
        where: { status: 'PENDING', availableAt: { lte: now } },
        orderBy: { availableAt: 'asc' },
        take: batchSize,
        select: { id: true, companyId: true, type: true, payload: true, attempts: true },
      });

      let result = { ...EMPTY, claimed: due.length };

      for (const row of due) {
        const claimed = await tx.outboxEvent.updateMany({
          where: { id: row.id, status: 'PENDING' },
          data: { attempts: { increment: 1 }, availableAt: new Date(now.getTime() + nextDelayMs(row.attempts + 1)) },
        });
        if (claimed.count === 0) {
          result = { ...result, claimed: result.claimed - 1 };
          continue;
        }

        const dispatcher = this.dispatchers.get(row.type);
        if (!dispatcher) {
          // نوعٌ بلا مرسِل يُعلَن فاشلاً **صراحةً** ولا يبقى يدور إلى الأبد.
          await tx.outboxEvent.update({ where: { id: row.id }, data: { status: 'FAILED', lastError: `لا مرسِل مسجَّل للنوع ${row.type}` } });
          result = { ...result, failed: result.failed + 1 };
          continue;
        }

        try {
          await dispatcher({ id: row.id, companyId: row.companyId, type: row.type, payload: row.payload });
          await tx.outboxEvent.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } });
          result = { ...result, sent: result.sent + 1 };
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const exhausted = row.attempts + 1 >= MAX_ATTEMPTS;
          await tx.outboxEvent.update({ where: { id: row.id }, data: { status: exhausted ? 'FAILED' : 'PENDING', lastError: message.slice(0, 500) } });
          if (exhausted) {
            result = { ...result, failed: result.failed + 1 };
            this.logger.error(`Outbox ${row.type} ${row.id} استُنفدت محاولاته: ${message}`);
          } else {
            result = { ...result, retried: result.retried + 1 };
          }
        }
      }

      return result;
    });
  }
}

function add(a: DispatchResult, b: DispatchResult): DispatchResult {
  return { claimed: a.claimed + b.claimed, sent: a.sent + b.sent, retried: a.retried + b.retried, failed: a.failed + b.failed };
}
