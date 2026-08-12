/**
 * استخراج رسالة الخادم من خطأ axios — مصدرٌ واحد لكل الشاشات.
 *
 * **الحادثة:** اثنا عشر موضعاً كانت تكتب `} catch {` بلا معامل، أي **ترمي
 * كائن الخطأ كله** وتعرض نصاً ثابتاً («تعذّر حفظ بيانات الموظف»). والخادم
 * كان قد قال السبب بالضبط — لكن أحداً لم يقرأه. والسجل لا يحويه أيضاً
 * (NestJS لا يسجّل 4xx)، فكان العطل **غير مرئي من الطرفين معاً**.
 *
 * **ولماذا دالة لا نسخ ولصق:** النمط الصحيح كان موجوداً في
 * `CompanyUserModal` وحده، وفيه عيبٌ خفيّ — رسالة التحقّق تعود **مصفوفة**
 * (سطرٌ لكل قاعدة أخفقت)، و`setError(message)` بمصفوفة يعرض عناصرها ملتصقة
 * بلا فواصل. فنسخُ ذلك النمط كان سينشر العيب على اثني عشر موضعاً.
 */

/** شكل ردّ الخطأ من NestJS كما يصل عبر axios. */
interface ApiErrorShape {
  response?: { data?: { message?: unknown } };
  message?: unknown;
}

/**
 * يعيد رسالةً جاهزة للعرض: رسالة الخادم إن وُجدت، وإلا `fallback`.
 *
 * المصفوفة تُسطَّح بفاصلٍ عربي مقروء («الراتب الأساسي يجب أن يكون رقماً ·
 * تاريخ المباشرة مطلوب») لا بالتصاقٍ صامت.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const raw = (error as ApiErrorShape)?.response?.data?.message;

  if (Array.isArray(raw)) {
    const parts = raw.map((m) => String(m).trim()).filter(Boolean);
    if (parts.length) return parts.join(' · ');
  } else if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }

  // انقطاع شبكة أو انهيار قبل الردّ: لا `response` أصلاً. رسالة axios نفسها
  // إنجليزية تقنية (`Network Error`) فلا تُعرض — الاحتياطي العربي أصدق.
  return fallback;
}
