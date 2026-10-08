import { randomUUID } from 'node:crypto';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';

/**
 * ⚖️ **مزوّدُ الرسائل القصيرة ومزوّدُ التحقّق من الهويّة: كلٌّ خلف واجهةٍ واحدة، وتنفيذُها للتطوير والاختبار** (توجيه ٢٨٧ ⑩ · القاعدة الدائمة ١٩ ·
 * `ق-٨٨` · `ق-١٥٤٦`: «والرمزُ عبر واجهةٍ موحّدة تُختبر بمزوّدٍ وهميّ»).
 *
 * لم يُتعاقد مع مزوّدٍ بعد، فلا محوّلَ حقيقيّاً هنا؛ ويُركَّب حين يُتعاقد سطراً في السجلّ تحت دون تغييرٍ في المسار. **والتجريبيُّ مصنَّفٌ**
 * (`TEST_ONLY_*`) **ومحجوزٌ في الإنتاج عند الإقلاع وعند كلِّ استعمال**، والرفضُ بالرمي لا بإرجاع فراغ (درسُ `MockTerminalAdapter`: محوّلٌ
 * يوافق على كلِّ شيءٍ بلا حاجزٍ ثغرة). **ولا قيمةَ افتراضيةَ للمزوّد**: غيابُ الإعداد يُرفض باسمه، ولا ينزل إلى التجريبيّ (فخُّ `?? MOCK`).
 *
 * **والتحقّقُ من الرمز في خدمة النواة لا في المحوّل** (`otp-challenges.service.ts`): المحوّلُ يحمل النصَّ إلى الجوال وحدَه، فلا محوّلَ
 * «يوافق» على رمز.
 */

export interface SmsMessage {
  /** الجوالُ بالصيغة الدولية `+…` بعد تطبيعه بإقليم المنشأة. */
  to: string;
  text: string;
}

export interface SmsChannel {
  readonly provider: string;
  send(message: SmsMessage): Promise<{ providerRef: string }>;
}

export type IdentityDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

/** مزوّدُ التحقّق من الهويّة (نفاذ في إقليم المنصّة): يُطلب برقم الهويّة، ويُسأل عن حكمه بمعرّف المعاملة. */
export interface IdentityProvider {
  readonly provider: string;
  start(request: { nationalId: string }): Promise<{ transactionId: string; displayCode: string }>;
  status(transactionId: string): Promise<{ decision: IdentityDecision; nationalId: string | null }>;
}

/** التجريبيّان — ممنوعان في الإنتاج بالإقلاع وبالاستعمال. */
export const TEST_ONLY_SMS_PROVIDERS: ReadonlySet<string> = new Set(['MOCK']);
export const TEST_ONLY_IDENTITY_PROVIDERS: ReadonlySet<string> = new Set(['MOCK']);

const isProduction = () => process.env.NODE_ENV === 'production';

/**
 * **مزوّدُ الرسائل للتطوير والاختبار**: لا يتّصل بشيء، ويحفظ ما «أرسله» لتقرأه الاختبارات (`outbox`). وخارجَ الإنتاج يكتب في سجلّ الخادم أن
 * رسالةً أُرسلت وإلى أيّ جوالٍ مقنَّع، **ولا يكتب نصَّها** — فالرمزُ لا يُطبع في سجلٍّ أبداً (توجيه ٢٨٧ ⑪).
 */
export class MockSmsChannel implements SmsChannel {
  readonly provider = 'MOCK';
  readonly outbox: Array<SmsMessage & { providerRef: string; at: Date }> = [];
  private readonly logger = new Logger('MockSmsChannel');

  async send(message: SmsMessage): Promise<{ providerRef: string }> {
    if (isProduction()) throw new ServiceUnavailableException(MSG.sms_test_provider_in_production);
    const providerRef = `mock-${randomUUID()}`;
    this.outbox.push({ ...message, providerRef, at: new Date() });
    this.logger.log(`رسالةٌ تجريبية ${providerRef} (${message.text.length} حرفاً)`);
    return { providerRef };
  }

  /** آخرُ رسالةٍ إلى جوالٍ — للاختبارات وحدَها. */
  lastTo(to: string): (SmsMessage & { providerRef: string }) | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i--) if (this.outbox[i].to === to) return this.outbox[i];
    return undefined;
  }
}

/**
 * **مزوّدُ الهويّة للتطوير والاختبار**: يبدأ معاملةً ويُجيب بحكمٍ تضبطه الاختبارات (`decide`)، وبلا ضبطٍ يقبل برقم الهويّة الذي بدأت به —
 * فهو «يوافق»، ولذلك هو ممنوعٌ في الإنتاج عند الإقلاع وعند كلِّ استعمال كالجهاز التجريبيّ.
 */
export class MockIdentityProvider implements IdentityProvider {
  readonly provider = 'MOCK';
  private readonly transactions = new Map<string, { nationalId: string; decision: IdentityDecision | null }>();

  async start(request: { nationalId: string }): Promise<{ transactionId: string; displayCode: string }> {
    if (isProduction()) throw new ServiceUnavailableException(MSG.identity_test_provider_in_production);
    const transactionId = `mock-${randomUUID()}`;
    this.transactions.set(transactionId, { nationalId: request.nationalId, decision: null });
    return { transactionId, displayCode: String(10 + (this.transactions.size % 90)) };
  }

  async status(transactionId: string): Promise<{ decision: IdentityDecision; nationalId: string | null }> {
    if (isProduction()) throw new ServiceUnavailableException(MSG.identity_test_provider_in_production);
    const tx = this.transactions.get(transactionId);
    if (!tx) return { decision: 'EXPIRED', nationalId: null };
    const decision = tx.decision ?? 'APPROVED';
    return { decision, nationalId: decision === 'APPROVED' ? tx.nationalId : null };
  }

  /** للاختبارات وحدَها: حكمُ معاملةٍ بعينها. */
  decide(transactionId: string, decision: IdentityDecision): void {
    const tx = this.transactions.get(transactionId);
    if (tx) tx.decision = decision;
  }
}

/** سجلّا المحوّلات — يُضاف المزوّدُ الحقيقيّ سطراً هنا حين يُتعاقد معه (ومعه شروطُ تشغيله في `docs/licensing-and-operations.md`). */
export const SMS_CHANNEL_FACTORIES: Readonly<Record<string, () => SmsChannel>> = Object.freeze({
  MOCK: () => new MockSmsChannel(),
});
export const IDENTITY_PROVIDER_FACTORIES: Readonly<Record<string, () => IdentityProvider>> = Object.freeze({
  MOCK: () => new MockIdentityProvider(),
});

/**
 * المزوّدُ المختار في البيئة (`SMS_PROVIDER` · `IDENTITY_PROVIDER`)، أو `null` إن لم يُضبط — **ولا افتراض**. والمستدعي يرفض الغيابَ باسمه عند
 * الاستعمال، فلا يُرسل شيءٌ بلا مزوّد ولا يُختم توقيعٌ بلا رمز.
 */
export function chosenProvider(kind: 'SMS' | 'IDENTITY', env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = (kind === 'SMS' ? env.SMS_PROVIDER : env.IDENTITY_PROVIDER)?.trim().toUpperCase();
  return raw ? raw : null;
}

/**
 * **لحارس الإقلاع** (`production-secrets.ts`): مزوّدٌ مضبوطٌ في الإنتاج يجب أن يكون محوّلاً مسجَّلاً وغيرَ تجريبيّ؛ والغيابُ جائز (المسارُ يُرفض
 * باسمه حين يُستعمل، والتعاقدُ شرطُ تشغيل).
 */
export function providerProblem(kind: 'SMS' | 'IDENTITY', name: string): string | null {
  const factories = kind === 'SMS' ? SMS_CHANNEL_FACTORIES : IDENTITY_PROVIDER_FACTORIES;
  const testOnly = kind === 'SMS' ? TEST_ONLY_SMS_PROVIDERS : TEST_ONLY_IDENTITY_PROVIDERS;
  const key = name.trim().toUpperCase();
  if (testOnly.has(key)) return 'مزوّدٌ تجريبيٌّ لا يُرسل شيئاً ولا يتحقّق من أحد';
  if (!factories[key]) return `لا محوّلَ مسجَّلاً باسم «${key}»`;
  return null;
}
