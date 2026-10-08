import type { FormInstance } from '../../api/forms';

/**
 * ⚖️ **حالاتُ النموذج في مسار التوقيع** (توجيه ٢٨٧): المسوّدةُ تُعبّأ، ثم «ينتظر التوقيع» بعد توقيع الموظّف وإرساله، ثم «مختوم» حين
 * يوقّع الطرف؛ أو «معترَضٌ عليه» فتليه نسخةٌ معدّلة، أو «انقضت مدّتُه» بلا موافقة، أو «خلافٌ قائم» لاعتراضٍ بقي عند الموعد.
 */
export const FORM_STATUS: Record<FormInstance['status'], { label: string; badge: string }> = {
  DRAFT: { label: 'مسوّدة', badge: 'draft' },
  AWAITING_SIGNATURE: { label: 'ينتظر التوقيع', badge: 'due' },
  OBJECTED: { label: 'معترَضٌ عليه', badge: 'overdue' },
  SEALED: { label: 'مختوم', badge: 'paid' },
  EXPIRED: { label: 'انقضت مدّتُه', badge: 'overdue' },
  DISPUTED: { label: 'خلافٌ قائم', badge: 'overdue' },
};

export const statusOf = (s: FormInstance['status']) => FORM_STATUS[s] ?? { label: s, badge: 'due' };

/** مستوى التوقيع بفعله لا برمزه. */
export const SIGNATURE_LEVEL: Record<string, string> = {
  DRAWN_STAFF_SESSION: 'مرسومٌ بجلسة الموظّف',
  DRAWN_OTP: 'مرسومٌ بعد رمزٍ إلى الجوال',
  DRAWN_NAFATH: 'مرسومٌ بعد التحقّق عبر نفاذ',
  PAPER_WITNESSED: 'ورقيٌّ بشهادة الموظّف',
};

export const SIGNER_ROLE: Record<string, string> = {
  STAFF: 'الموظّف',
  COUNTERPARTY: 'المستأجر',
  REPRESENTATIVE: 'ممثّلُ المستأجر',
  SUBSTITUTE: 'المستلمُ البديل',
};

export const SIGNATURE_CHANNEL: Record<string, string> = {
  LINK: 'برابطٍ على جواله',
  STAFF_DEVICE: 'على جهاز الموظّف',
  PAPER: 'على الورق',
};

export const AUTHORITY_TYPE: Record<string, string> = {
  CR_MANAGER: 'مديرٌ مقيّدٌ في السجلّ التجاريّ',
  NAJIZ_POA: 'وكالةٌ من ناجز',
};

/** أحداثُ سجلّ النموذج بأسمائها. */
export const EVENT_LABEL: Record<string, string> = {
  STAFF_SIGNED: 'وقّع الموظّف',
  LINK_SENT: 'أُرسل الرابط',
  LINK_SEND_FAILED: 'تعذّر إرسالُ الرابط',
  LINK_OPENED: 'فُتح الرابط',
  OTP_SENT: 'أُرسل رمزُ الدخول',
  OTP_SEND_FAILED: 'تعذّر إرسالُ الرمز',
  OTP_FAILED: 'رمزٌ خاطئ',
  OTP_LOCKED: 'قُفل الرمز بعد ثلاث محاولات',
  LOGIN: 'دخل الطرف',
  NAFATH_STARTED: 'بدأ التحقّق عبر نفاذ',
  NAFATH_REJECTED: 'رُفض التحقّق عبر نفاذ',
  SIGNED: 'وقّع الطرف',
  OBJECTED: 'اعترض الطرف',
  REVISED: 'نسخةٌ معدّلة',
  SEALED: 'خُتم النموذج',
  FINAL_SENT: 'أُرسلت النسخةُ النهائية',
  FINAL_SEND_FAILED: 'تعذّر إرسالُ النسخة النهائية',
  EXPIRED: 'انقضت المدّة',
  DISPUTED: 'خلافٌ قائم',
  REMINDER_MID: 'تذكيرُ منتصف المدّة',
  REMINDER_LAST: 'تذكيرُ اليوم الأخير',
  PAPER_UPLOADED: 'رُفعت الورقةُ الموقَّعة',
  REPRESENTATIVE_DESIGNATED: 'عُيّن ممثّلُ الطرف',
  DEVICE_LINK: 'فُتح رابطٌ على جهاز الموظّف',
  SUBSTITUTE_REQUESTED: 'طُلب مستلمٌ بديل',
  SUBSTITUTE_APPROVED: 'وافق الطرفُ على البديل',
  SUBSTITUTE_REJECTED: 'رفض الطرفُ البديل',
};
