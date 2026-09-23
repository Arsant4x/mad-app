import { apiClient } from './client';

/** **المصادقةُ المتعدّدة** (`ق-١٣١٨` · ⑨A1) — لكلِّ فاعلٍ على حسابه هو. */
export interface MfaStatus {
  enrolled: boolean;
  enrolledAt: string | null;
  recoveryCodesLeft: number;
  /** إلزاميٌّ لحسابات المنصّة حين يُشعَل العلَم — يُعرض كما هو، فمن يُطالَب يعرف قبل أن يُردّ. */
  required: boolean;
}

export const getMfaStatus = () => apiClient.get<MfaStatus>('/auth/mfa').then((r) => r.data);

/** يبدأ التسجيل — **السرُّ يُعرض مرّةً هنا ولا يُقرأ بعدها من أيّ مسار**. */
export const beginMfa = () => apiClient.post<{ secret: string; otpauth: string }>('/auth/mfa/begin').then((r) => r.data);

/** يُكمله برمزٍ من التطبيق — **ورموزُ الاسترداد تُعرض مرّةً واحدة**. */
export const confirmMfa = (code: string) => apiClient.post<{ recoveryCodes: string[] }>('/auth/mfa/confirm', { code }).then((r) => r.data);

/** يُلغيه **برمزٍ حيّ** — فلا يُلغيه من استولى على جلسةٍ مفتوحة. */
export const disableMfa = (code: string) => apiClient.post<{ enrolled: boolean }>('/auth/mfa/disable', { code }).then((r) => r.data);
