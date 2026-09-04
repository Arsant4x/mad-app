import type { Prisma } from '@prisma/client';

/**
 * ناقل الأحداث — **بسلوكَين لا بسلوكٍ واحد** (`ق-٣٩` · `ق-١٢٨`، قرار المالك).
 *
 * ## لماذا يوجد
 *
 * المسارات كانت تنادي ما يليها **بالاسم**: الفاتورة تنادي التدقيق، والإشعار
 * ينادي التنبيه. فصار المعترض يرى **شكل المسار لا معناه**، وكل مستندٍ يُنشأ تحت
 * معرّف أبيه يقع في العلّة نفسها. والعلاج أن يرفع المسار **حدثاً بمعناه**،
 * ويستمع من يعنيه.
 *
 * ## ولماذا سلوكان — وهو لبّ التصميم
 *
 * **حدثٌ غير متزامن يفشل بصمت يجعل عمليةً تنجح ولا تُدقَّق — وهو أسوأ من نسبةٍ
 * ناقصة.** فلا ناقلَ واحد بسلوكٍ واحد:
 *
 * | النوع | التنفيذ | الفشل |
 * |---|---|---|
 * | **`compliance`** | **متزامن داخل المعاملة نفسها** | **يُسقط العملية كلها** |
 * | **`operational`** | غير متزامن بعد المعاملة | يُسجَّل ولا يُسقط شيئاً |
 *
 * فقيدُ التدقيق وصفُّ الـOutbox امتثالٌ: إن لم يُكتبا فالفاتورة **لا يجوز أن
 * توجد**. والجرس والبريد تشغيلٌ: انقطاعُ المزوّد لا يمنع التاجر من البيع.
 *
 * ## والتسجيل صريحٌ لا اكتشافٌ تلقائي
 *
 * لا مسحَ مجلدات ولا `import()` ديناميكي (`ق-٤٢`): المستمع يُسجَّل بسطرٍ يُقرأ،
 * فحارس اتجاه الاستيراد يراه. و**هذا الملف لا يستورد من أحد** — رتبته `shared`،
 * ولو استورد من وحدةٍ لصار جزءاً منها لا ناقلاً بينها.
 */

/** حدثٌ بمعناه: نوعٌ ومنشأةٌ وحمولةٌ خاصة به. */
export interface DomainEvent<T = Record<string, unknown>> {
  type: string;
  companyId: string;
  payload: T;
}

export type ComplianceHandler = (tx: Prisma.TransactionClient, event: DomainEvent) => Promise<void>;
export type OperationalHandler = (event: DomainEvent) => Promise<void> | void;

/** ما يُسجَّل به فشلُ مستمعٍ تشغيليّ — يُحقَن ليُقاس في الاختبار. */
export type FailureSink = (event: DomainEvent, error: unknown) => void;

export class EventBus {
  private readonly compliance = new Map<string, ComplianceHandler[]>();
  private readonly operational = new Map<string, OperationalHandler[]>();
  private onFailure: FailureSink = () => {};

  /** يستمع لحدثٍ **بضمانة الامتثال**: يجري داخل المعاملة، وفشلُه يُسقطها. */
  onCompliance(type: string, handler: ComplianceHandler): void {
    this.compliance.set(type, [...(this.compliance.get(type) ?? []), handler]);
  }

  /** يستمع لحدثٍ **تشغيليّ**: بعد المعاملة، وفشلُه لا يمسّ العملية. */
  onOperational(type: string, handler: OperationalHandler): void {
    this.operational.set(type, [...(this.operational.get(type) ?? []), handler]);
  }

  setFailureSink(sink: FailureSink): void {
    this.onFailure = sink;
  }

  /**
   * يرفع حدث امتثالٍ **داخل معاملة المُصدِر**.
   *
   * ⚠️ **لا يبتلع خطأً**: أول مستمعٍ يرمي يُوقف البقية ويُصعِّد الخطأ، فتُلغى
   * المعاملة ولا يبقى مستندٌ بلا أثره. وهذا هو الفرق كلّه عن النوع الآخر.
   */
  async emitCompliance(tx: Prisma.TransactionClient, event: DomainEvent): Promise<number> {
    const handlers = this.compliance.get(event.type) ?? [];
    for (const handler of handlers) await handler(tx, event);
    return handlers.length;
  }

  /**
   * يرفع حدثاً تشغيلياً **بلا انتظار**.
   *
   * فشلُ مستمعٍ يُسجَّل ولا يُصعَّد — ولا يمنع بقية المستمعين، فلكلٍّ سببه.
   */
  emitOperational(event: DomainEvent): void {
    for (const handler of this.operational.get(event.type) ?? []) {
      void (async () => handler(event))().catch((e: unknown) => this.onFailure(event, e));
    }
  }

  /** للاختبار وحده: يُفرِغ المستمعين فلا تتسرّب حالةٌ بين حالات. */
  reset(): void {
    this.compliance.clear();
    this.operational.clear();
    this.onFailure = () => {};
  }
}

/** الناقل الواحد للعملية. */
export const events = new EventBus();
