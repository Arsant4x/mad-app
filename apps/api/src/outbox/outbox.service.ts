import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@mad-app/db';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { events, type DomainEvent } from '../shared/events/event-bus';
// ⚖️ سببٌ يُخزَّن ويُقرأ (`ق-٩٧١`) — كان هنا، وصار المصدرَ الواحدَ لكلّ نصٍّ خارجيٍّ يُكتب (`ق-٩٨٢`).
import { storableError, storableText } from '../common/i18n/storable-text';

/** Attempts before a row is declared FAILED and left to be seen. An unanswered delivery never reaches this limit. */
export const MAX_ATTEMPTS = 6;

/**
 * A dispatch failure in which the receiving side gave no answer on the event (no connection, a timeout,
 * or a reply that is not a verdict). Such a row is retried on the capped backoff with no terminal state,
 * because waiting is what heals it; every other failure still ends FAILED after MAX_ATTEMPTS.
 */
export interface UnansweredDelivery {
  readonly unanswered: true;
}

export function isUnansweredDelivery(e: unknown): e is UnansweredDelivery {
  return typeof e === 'object' && e !== null && (e as Partial<UnansweredDelivery>).unanswered === true;
}

/**
 * ⭐ **`FAILED` لا يعني انتهاءً** (`ق-١٨٢`/٣): صفوفٌ استُنفدت محاولاتها تعود إلى
 * الطابور حين يزول سببُ فشلها — كربطِ منشأةٍ كانت تُصدر بلا شهادة، فتعود كل
 * فواتيرها إلى الإرسال **ولا فاتورة تُنسى**.
 *
 * دالةٌ خالصة على معاملةٍ يملكها المستدعي (سياق المنشأة نفسه الذي كتب الشهادة):
 * فالربطُ والإعادةُ يقعان معاً أو لا يقعان. تُعيد عددَ ما أُعيد — رقمٌ يُقاس لا
 * يُفترَض.
 */
export async function requeueFailedWithinTx(tx: Prisma.TransactionClient, type: string, now = new Date()): Promise<number> {
  const result = await tx.outboxEvent.updateMany({
    where: { type, status: 'FAILED' },
    data: { status: 'PENDING', attempts: 0, availableAt: now, lastError: null },
  });
  return result.count;
}

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

/** الصفُّ كما قُرئ للحجز — ومعه عددُ محاولاته **نسخةً** يُشترط عليها الحجز. */
export interface OutboxRowRead extends OutboxRow {
  attempts: number;
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
 * ## 🔴 والإرسالُ خارج معاملة القاعدة (`ق-١٤٦٤`)
 *
 * كانت الدورةُ معاملةً واحدة: تحجز الصفَّ **ثم تنادي المرسِل وهي مفتوحة** — ومرسِلُ الهيئة (`deliverIssued`) نداءٌ شبكيّ
 * مهلتُه `30 s` في معاملةٍ مهلتُها `5 s`. فإرسالٌ أبطأُ منها يُسقط كتابةَ «أُرسل» («`Transaction already closed`») **ويُرجِع
 * الحجزَ معها** — فيعود الصفُّ بلا أثرٍ ولا زيادةٍ في محاولاته، ويُرسَل ثانيةً في الدورة التالية ولا يبلغ حدَّ الفشل أبداً؛
 * واتصالٌ يُحبس طوالَ النداء. **قِيس حيّاً** (`test/outbox-dispatch-outside-tx.e2e-spec.ts`).
 *
 * فصار ثلاثةَ أطوار: **① حجزٌ في معاملةٍ تُلتزم** (المحاولةُ تُحسب والموعدُ يُؤجَّل بالتراجع — فهو إيجارٌ للصفّ) ·
 * **② الإرسالُ خارجها** · **③ معاملةٌ ثانيةٌ تكتب النتيجة**. وسقوطٌ بين الثاني والثالث يترك الصفَّ مستحقّاً بعد تراجعه —
 * «مرّةً على الأقلّ» كما كان، والمرسِلُ يتخطّى ما قُضي فيه (`deliverIssued`).
 *
 * ## ⚠️ ولماذا يمرّ الموزّع بكل منشأة على حدة
 *
 * `outbox_events` has FORCE row level security, so a read with the unscoped client returns no rows and no
 * error, and the dispatcher would look alive while seeing nothing. The sweep therefore lists every company
 * with the unscoped client (companies has no row level security), whatever its subscription status, and then
 * enters each company's own context.
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

  /**
   * One cycle across every company. Delivering a document already issued is an obligation on the document, not a
   * write by the merchant, so a company that turned read only or stopped still has its due events sent.
   */
  async dispatchDue(batchSize = 20, now = new Date()): Promise<DispatchResult> {
    const companies = await this.prisma.company.findMany({ select: { id: true } });
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
   * **① الحجز** — داخل معاملة المستدعي، وتُلتزم قبل أيّ إرسال.
   *
   * مشروطٌ بـ`status: PENDING` **وبعدد المحاولات كما قُرئ**: الحجزُ يزيده، فمن قرأ الصفَّ قبل أن يحجزه غيرُه يحمل عدداً أقدم
   * **فلا يحجز شيئاً** — وهو ما يمنع إرسالاً مزدوجاً بعد أن صار الحجزُ يُلتزم قبل الإرسال (كان قفلُ الصفّ في المعاملة الواحدة
   * يمنعه). **والموعدُ يُؤجَّل بالتراجع** فالصفُّ المحجوزُ لا يُقرأ مستحقّاً حتى ينقضي إيجارُه.
   */
  async claimWithinTx(tx: Prisma.TransactionClient, rows: OutboxRowRead[], now: Date): Promise<OutboxRowRead[]> {
    const claimed: OutboxRowRead[] = [];
    for (const row of rows) {
      const result = await tx.outboxEvent.updateMany({
        where: { id: row.id, status: 'PENDING', attempts: row.attempts },
        data: { attempts: { increment: 1 }, availableAt: new Date(now.getTime() + nextDelayMs(row.attempts + 1)) },
      });
      if (result.count === 1) claimed.push(row);
    }
    return claimed;
  }

  /**
   * دورةٌ لمنشأةٍ واحدة **داخل سياقها** — وهي وحدة العمل القابلة للاختبار.
   *
   * **① حجزٌ في معاملة** (`claimWithinTx`) · **② الإرسالُ خارجها** · **③ معاملةٌ ثانيةٌ لكلِّ صفٍّ تكتب نتيجتَه** (`ق-١٤٦٤`).
   */
  async dispatchForCompany(companyId: string, batchSize = 20, now = new Date()): Promise<DispatchResult> {
    const claimed = await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const due = await tx.outboxEvent.findMany({
        where: { status: 'PENDING', availableAt: { lte: now } },
        orderBy: { availableAt: 'asc' },
        take: batchSize,
        select: { id: true, companyId: true, type: true, payload: true, attempts: true },
      });
      return this.claimWithinTx(tx, due, now);
    });

    let result = { ...EMPTY, claimed: claimed.length };

    for (const row of claimed) {
      const dispatcher = this.dispatchers.get(row.type);
      if (!dispatcher) {
        // نوعٌ بلا مرسِل يُعلَن فاشلاً **صراحةً** ولا يبقى يدور إلى الأبد.
        await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
          tx.outboxEvent.update({ where: { id: row.id }, data: { status: 'FAILED', lastError: storableText(`لا مرسِل مسجَّل للنوع ${row.type}`) } }),
        );
        result = { ...result, failed: result.failed + 1 };
        continue;
      }

      // ② خارج أيّ معاملة — النداءُ الشبكيّ لا يحبس اتصالاً ولا يسابق مهلةَ معاملة.
      let failure: unknown = null;
      let sent = false;
      try {
        await dispatcher({ id: row.id, companyId: row.companyId, type: row.type, payload: row.payload });
        sent = true;
      } catch (e) {
        failure = e;
      }

      // ③ معاملةٌ ثانية تكتب النتيجة.
      if (sent) {
        await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
          tx.outboxEvent.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } }),
        );
        result = { ...result, sent: result.sent + 1 };
        continue;
      }
      const exhausted = !isUnansweredDelivery(failure) && row.attempts + 1 >= MAX_ATTEMPTS;
      // النداءُ في موضع الكتابة نفسِه — فحارسُ الأعمدة المعلَنة يقرأ الشكلَ لا المتغيّر.
      await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.outboxEvent.update({ where: { id: row.id }, data: { status: exhausted ? 'FAILED' : 'PENDING', lastError: storableError(failure) } }),
      );
      if (exhausted) {
        result = { ...result, failed: result.failed + 1 };
        this.logger.error(`Outbox ${row.type} ${row.id} استُنفدت محاولاته: ${storableError(failure)}`);
      } else {
        result = { ...result, retried: result.retried + 1 };
      }
    }

    return result;
  }
}

function add(a: DispatchResult, b: DispatchResult): DispatchResult {
  return { claimed: a.claimed + b.claimed, sent: a.sent + b.sent, retried: a.retried + b.retried, failed: a.failed + b.failed };
}
