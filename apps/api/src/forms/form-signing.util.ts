import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@mad-app/db';

type Tx = Prisma.TransactionClient;

/**
 * ⚖️ **أدواتُ مسار التوقيع المشتركة** (توجيه ٢٨٧): الرمزُ العشوائيّ وبصمتُه، ونصوصُ الرسائل، وسجلُّ الأحداث.
 *
 * **ونصوصُ الرسائل لا تحمل اسماً ولا مبلغاً ولا اسمَ منشأة** (`ق-١٦٢٠`: «لا يظهر في الرابط أيُّ تفصيلٍ قبل الدخول»؛ والنموذجُ المرئيُّ المُقرّ:
 * «نصُّ الرسالة لا يذكر اسماً ولا مبلغاً: لديك نموذجٌ ينتظر توقيعك، ورابط»).
 */

/** رمزٌ لا يُخمَّن: اثنان وثلاثون بايتاً عشوائية (`base64url`). */
export const newOpaqueToken = (): string => randomBytes(32).toString('base64url');

/** الرمزُ يُخزَّن بصمةً لا نصّاً (توجيه ٢٨٧ ⑪) — كرمز استعادة كلمة المرور. */
export const opaqueTokenHash = (token: string): string => createHash('sha256').update(token, 'utf8').digest('hex');

/** بصمةُ ملفٍّ مرفوع (صورةُ الرسم أو الاعتراض أو الورقة). */
export const bytesSha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

/** رابطُ النموذج في الواجهة — العنوانُ من إعداد التشغيل، والرمزُ في المسار. */
export const formLinkUrl = (token: string): string => `${(process.env.WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/+$/, '')}/f/${token}`;

export const SMS_TEXT = {
  sign: (url: string) => `لديك نموذجٌ ينتظر توقيعك: ${url}`,
  reminder: (url: string) => `تذكير: لديك نموذجٌ ينتظر توقيعك قبل انقضاء مدّته: ${url}`,
  otp: (code: string) => `رمز التحقق: ${code}. صالحٌ خمس دقائق، فلا تشاركه أحداً.`,
  finalCopy: (url: string) => `نسختك النهائية من النموذج الموقَّع: ${url}`,
  substituteConsent: (url: string) => `طُلب أن يستلم شخصٌ آخر عنك نموذجاً ينتظر توقيعك؛ راجِع الطلب: ${url}`,
} as const;

/** أحداثُ سجلّ التوقيع (`ق-١٦٢٠`: «وسجلٌّ بالإرسال والتذكيرات»). */
export type FormSigningEventKind =
  | 'STAFF_SIGNED'
  | 'LINK_SENT'
  | 'LINK_SEND_FAILED'
  | 'LINK_OPENED'
  | 'OTP_SENT'
  | 'OTP_SEND_FAILED'
  | 'OTP_FAILED'
  | 'OTP_LOCKED'
  | 'LOGIN'
  | 'NAFATH_STARTED'
  | 'NAFATH_REJECTED'
  | 'SIGNED'
  | 'OBJECTED'
  | 'REVISED'
  | 'SEALED'
  | 'FINAL_SENT'
  | 'FINAL_SEND_FAILED'
  | 'EXPIRED'
  | 'DISPUTED'
  | 'REMINDER_MID'
  | 'REMINDER_LAST'
  | 'SUBSTITUTE_REQUESTED'
  | 'SUBSTITUTE_APPROVED'
  | 'SUBSTITUTE_REJECTED'
  | 'PAPER_UPLOADED';

/** الفاعلُ في سجلّ الأحداث نصّاً: الموظّفُ باسمه، أو «العميل عبر الرابط»، أو «النظام». */
export const LINK_ACTOR = 'العميل عبر الرابط';
export const SYSTEM_ACTOR = 'النظام';

/** يُلحق حدثاً بسجلّ النموذج (ملحقٌ فقط، والوقتُ من الخادم، والجوالُ مقنَّع). */
export async function recordFormEvent(
  tx: Tx,
  input: { companyId: string; instanceId: string; kind: FormSigningEventKind; actor: string; recipientMasked?: string | null; note?: string | null },
): Promise<void> {
  await tx.formSigningEvent.create({
    data: {
      companyId: input.companyId,
      instanceId: input.instanceId,
      kind: input.kind,
      actor: input.actor,
      recipientMasked: input.recipientMasked ?? null,
      note: input.note ?? null,
    },
  });
}

/** موعدُ الانقضاء من أوّل إرسالٍ بمدّة النوع (`ق-١٦٧١`). */
export const deadlineFrom = (sentAt: Date, days: number): Date => new Date(sentAt.getTime() + days * 24 * 60 * 60 * 1000);
