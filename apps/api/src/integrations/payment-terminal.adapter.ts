/**
 * عقد بوابة/جهاز الدفع (مستند §4): «طبقة تجريد تدعم أكثر من جهاز».
 *
 * The POS knows ONLY this interface. Wiring a real provider (Geidea, مدى
 * via a PSP, PayTabs…) means implementing these two methods against its SDK
 * and registering it in ADAPTERS — no POS, drawer, or invoice code changes.
 */
export interface TerminalChargeRequest {
  /** بالهللة تُجنَّب أخطاء الفاصلة؟ لا — نبقيها ريالات ككل النظام، والمحوّل يكيّف لمزوّده. */
  amount: number;
  currency: string;
  /** مرجعنا الذي يظهر في لوحة المزوّد — رقم إيصال مؤقت أو معرف بيع. */
  reference: string;
}

export interface TerminalChargeResult {
  approved: boolean;
  /** رقم المرجع لدى المزوّد — يُختم على صف الدفعة عند الموافقة. */
  providerRef?: string;
  /** سبب الرفض إن وُجد (يظهر للكاشير كما هو). */
  declineReason?: string;
}

export interface PaymentTerminalAdapter {
  /** يبدأ العملية على الجهاز/البوابة وينتظر النتيجة. */
  charge(credentials: Record<string, string>, request: TerminalChargeRequest): Promise<TerminalChargeResult>;
}

/**
 * المزوّد التجريبي: سلوك حتمي قابل للاختبار دون أي جهاز —
 * يرفض أي مبلغ هللاته 13 («.13» عُرفاً للرفض في بيئة التجربة) ويوافق على
 * ما سواه برقم مرجع مشتق من الطلب. صالح للعرض على العملاء ولتطوير الواجهة.
 */
export class MockTerminalAdapter implements PaymentTerminalAdapter {
  async charge(_credentials: Record<string, string>, request: TerminalChargeRequest): Promise<TerminalChargeResult> {
    const halalas = Math.round(request.amount * 100) % 100;
    if (halalas === 13) {
      return { approved: false, declineReason: 'رفض تجريبي: المبلغ ينتهي بـ .13' };
    }
    return { approved: true, providerRef: `MOCK-${request.reference}` };
  }
}

/** سجل المزوّدين — إضافة مزوّد حقيقي = سطر هنا + ملف adapter له. */
export const TERMINAL_ADAPTERS: Record<string, PaymentTerminalAdapter> = {
  MOCK: new MockTerminalAdapter(),
};
