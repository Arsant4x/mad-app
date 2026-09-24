import { toHalalas } from '../common/money/rounding';

/**
 * عقد بوابة/جهاز الدفع (مستند §4): «طبقة تجريد تدعم أكثر من جهاز».
 *
 * The POS knows ONLY this interface. Wiring a real provider (Geidea, مدى
 * via a PSP, PayTabs…) means implementing it against its SDK and registering
 * it in ADAPTERS — no POS, drawer, or invoice code changes.
 *
 * ⭐ **والشحنُ خارج كلِّ معاملة** (`ق-١٤٠١`): النواةُ تنادي `charge` بين معاملتين قصيرتين بمهلة **المحوّل** لا بمهلتها،
 * وما لم يُجب في مهلته **معلّقٌ لا يُخمَّن** — يحسمه `status` بمرجع المحاولة نفسِه، أو دليلٌ مسجَّل (`ق-١٣٩٩`).
 */
export interface TerminalChargeRequest {
  /** بالهللة تُجنَّب أخطاء الفاصلة؟ لا — نبقيها ريالات ككل النظام، والمحوّل يكيّف لمزوّده. */
  amount: number;
  /** عملةُ المستند — من المنشأة لا حرفاً (`§3.8`). */
  currency: string;
  /** **معرّفُ محاولة الدفع** — مفتاحُ عدم التكرار عند المزوّد، وبه يُستعلم عن الحال (`ق-١٤٠١`). */
  reference: string;
}

export interface TerminalChargeResult {
  approved: boolean;
  /** رقم المرجع لدى المزوّد — يُختم على صف الدفعة عند الموافقة. */
  providerRef?: string;
  /** رمزُ الموافقة إن أعاده المزوّد. */
  approvalCode?: string;
  /** سبب الرفض إن وُجد (يظهر للكاشير كما هو). */
  declineReason?: string;
}

/**
 * جوابُ المزوّد عن عمليةٍ بمرجعها — **وحدَه يحسم المعلّق** (`ق-١٣٩٩`: «جوابُ المزوّد أوّلاً»).
 *
 * - `APPROVED` · `DECLINED` — جوابٌ قاطع.
 * - `NOT_FOUND` — لا أثرَ للمرجع لدى المزوّد: الطلبُ لم يبلغه؛ والنواةُ لا تعدّه رفضاً إلا بعد انقضاء مهلة الشحن.
 * - `PENDING` — لا جوابَ قاطعاً بعد (أو مرجعٌ يطابق أكثرَ من عملية — وثيقةُ Geidea المقروءة تُجيزه): يبقى معلّقاً.
 */
export type TerminalStatusState = 'APPROVED' | 'DECLINED' | 'NOT_FOUND' | 'PENDING';

export interface TerminalStatusResult {
  state: TerminalStatusState;
  providerRef?: string;
  approvalCode?: string;
  declineReason?: string;
}

export interface PaymentTerminalAdapter {
  /**
   * ⚖️ **مهلةُ انتظار الجهاز قبل «معلّق» — يعلنها كلُّ محوّلٍ لنفسه لا النواة** (`ق-١٣٩٨`).
   * بنصّ المالك: «**تسعون ثانية، ثم معلّق. ⚠️ وتُعلَن في محوّل كلِّ مزوّدٍ لا في النواة، فلكلِّ مزوّدٍ حدُّه.**»
   */
  readonly chargeDeadlineMs: number;
  /** يبدأ العملية على الجهاز/البوابة وينتظر النتيجة. */
  charge(credentials: Record<string, string>, request: TerminalChargeRequest): Promise<TerminalChargeResult>;
  /** حالُ عمليةٍ بمرجعها — جوابُ المزوّد الذي يحسم المعلّق (`ق-١٣٩٩`). */
  status(credentials: Record<string, string>, reference: string): Promise<TerminalStatusResult>;
}

/**
 * المزوّد التجريبي: سلوك حتمي قابل للاختبار دون أي جهاز —
 * يرفض أي مبلغ هللاته 13 («.13» عُرفاً للرفض في بيئة التجربة) ويوافق على
 * ما سواه برقم مرجع مشتق من الطلب. صالح للعرض على العملاء ولتطوير الواجهة.
 *
 * **ويتذكّر ما أجاب به** بمرجعه — فيجيب `status` كما يجيب مزوّدٌ حقيقيّ عن عمليةٍ رآها، و`NOT_FOUND` عمّا لم يره.
 * الذاكرةُ في العملية وحدَها (تجريبيّ؛ ممنوعٌ في الإنتاج — `TEST_ONLY_PROVIDERS`).
 */
export class MockTerminalAdapter implements PaymentTerminalAdapter {
  /** ⚖️ `ق-١٣٩٨`: تسعون ثانية — حدُّ هذا المحوّل. */
  chargeDeadlineMs = 90_000;

  private readonly seen = new Map<string, TerminalStatusResult>();

  async charge(_credentials: Record<string, string>, request: TerminalChargeRequest): Promise<TerminalChargeResult> {
    // بالسياسة المركزية لا بـ`Math.round` الخام: `1.13 * 100` في IEEE-754 ليس 113 دائماً.
    const halalas = Math.abs(toHalalas(request.amount)) % 100;
    if (halalas === 13) {
      const declined = { approved: false, declineReason: 'رفض تجريبي: المبلغ ينتهي بـ .13' };
      this.remember(request.reference, { state: 'DECLINED', declineReason: declined.declineReason });
      return declined;
    }
    const approved = { approved: true, providerRef: `MOCK-${request.reference}`, approvalCode: `A${request.reference.replace(/[^0-9]/g, '').slice(0, 6).padEnd(6, '0')}` };
    this.remember(request.reference, { state: 'APPROVED', providerRef: approved.providerRef, approvalCode: approved.approvalCode });
    return approved;
  }

  async status(_credentials: Record<string, string>, reference: string): Promise<TerminalStatusResult> {
    return this.seen.get(reference) ?? { state: 'NOT_FOUND' };
  }

  /** ما يعرفه المزوّدُ التجريبيّ عن مرجع — يُسجَّل عند الإجابة (وتستعمله الاختباراتُ لمحاكاة «وافق ثم انقطع الجواب»). */
  remember(reference: string, result: TerminalStatusResult): void {
    this.seen.set(reference, result);
  }
}

/** سجل المزوّدين — إضافة مزوّد حقيقي = سطر هنا + ملف adapter له. */
export const TERMINAL_ADAPTERS: Record<string, PaymentTerminalAdapter> = {
  MOCK: new MockTerminalAdapter(),
};
