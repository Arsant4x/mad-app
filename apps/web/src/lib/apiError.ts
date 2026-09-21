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

/** شكل ردّ الخطأ من NestJS كما يصل عبر axios — مع رأس `x-request-id` وجسمٍ يحمل `requestId` (ق-١٢٣٧). */
interface ApiErrorShape {
  response?: { status?: number; data?: { message?: unknown; code?: unknown; requestId?: unknown }; headers?: Record<string, unknown> };
  message?: unknown;
}

/**
 * **معرِّفُ الطلب** كما أعاده الخادم (`ق-١٢٣٧`): من الرأس `x-request-id` (يُعلَن في `CORS` فيقرؤه
 * المتصفّح) أو من جسم الخطأ. يُبلَّغ به الدعمُ فيجد الطلبَ في السجلّ بلا تخمين — و`undefined` حين لا
 * ردَّ أصلاً (انقطاعُ شبكة) فلا يُخترَع.
 */
export function apiRequestId(error: unknown): string | undefined {
  const res = (error as ApiErrorShape)?.response;
  const fromHeader = res?.headers?.['x-request-id'];
  if (typeof fromHeader === 'string' && fromHeader) return fromHeader;
  const fromBody = res?.data?.requestId;
  return typeof fromBody === 'string' && fromBody ? fromBody : undefined;
}

/**
 * ⭐ **رمزُ الخطأ الثابت — لا نصُّه** (`ق-٣٣٩`).
 *
 * ⚠️ **ولماذا لا تُطابَق الرسالة**: الرسائلُ **مترجَمةٌ ومصاغةٌ للتاجر**،
 * فمطابقتُها **تنكسر بأول تحسينِ صياغةٍ أو بتبديل اللغة** — **وتنكسر صامتةً**:
 * يختفي الزرُّ ويبقى الرفضُ فيُقرأ منعاً لا يُتجاوَز وهو ليس كذلك.
 *
 * و`undefined` هو الغالب: أكثرُ الأخطاء لا رمزَ لها.
 */
export function apiErrorCode(error: unknown): string | undefined {
  const code = (error as ApiErrorShape)?.response?.data?.code;
  return typeof code === 'string' && code ? code : undefined;
}

/**
 * يعيد رسالةً جاهزة للعرض: رسالة الخادم إن وُجدت، وإلا `fallback`.
 *
 * المصفوفة تُسطَّح بفاصلٍ عربي مقروء («الراتب الأساسي يجب أن يكون رقماً ·
 * تاريخ المباشرة مطلوب») لا بالتصاقٍ صامت.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  const raw = (error as ApiErrorShape)?.response?.data?.message;
  // ⑧ خطأُ الخادم (`5xx`) يحمل معرِّفَ طلبه في الرسالة كي يُبلَّغ به الدعمُ (ق-١٢٣٧)؛ أمّا `4xx` فرسالتُه
  // تسمّي سببَها وحدَها — والمعرِّفُ متاحٌ لمن أراده بـ`apiRequestId`.
  const status = (error as ApiErrorShape)?.response?.status;
  const requestId = apiRequestId(error);
  const withId = (text: string) => (requestId && typeof status === 'number' && status >= 500 ? `${text} (رقم الطلب: ${requestId})` : text);

  if (Array.isArray(raw)) {
    const parts = raw.map((m) => String(m).trim()).filter(Boolean);
    if (parts.length) return withId(parts.join(' · '));
  } else if (typeof raw === 'string' && raw.trim()) {
    return withId(raw.trim());
  }

  // انقطاع شبكة أو انهيار قبل الردّ: لا `response` أصلاً. رسالة axios نفسها
  // إنجليزية تقنية (`Network Error`) فلا تُعرض — الاحتياطي العربي أصدق.
  return withId(fallback);
}
