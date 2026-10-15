import { randomBytes } from 'node:crypto';

/**
 * **رمزُ مفتاح النظام** (`ق-١٢٩١` · ي/⑫A3) — `mk_<prefix>_<secret>`.
 *
 * ## لماذا ثلاثةُ أجزاء لا سرٌّ واحد
 *
 * The prefix finds the row with one indexed lookup, and it is random rather than the row id.
 * The rate limiter does not count by it: a prefix is not verified before the global guard runs,
 * so a request with a key is counted by address (tenant-tracker.ts).
 *
 * **والسرُّ مهشَّمٌ بـ`argon2`** كما كلماتُ المرور (`CLAUDE §6.5`) — فلا يُقرأ من قاعدةٍ
 * مسرَّبة، **ولا يُعرض إلا مرّةً واحدةً لحظةَ الإنشاء**.
 *
 * ⚠️ **والسابقةُ `mk_` تُعرَّف هنا مرّةً واحدة** — يقرؤها المقنِّنُ والحارسُ والشاشة،
 * فلا تُكتب في ثلاثة مواضع تختلف يوماً.
 */
export const API_KEY_SCHEME = 'mk';
/**
 * طولُ البادئة بالحروف — **ستّ عشرةَ خانةً ستّ عشريّة** (`64` بتّاً) فلا تُخمَّن.
 *
 * 🔴 **ولماذا ستّ عشريّةٌ لا `base64url`**: أبجديةُ `base64url` تضمّ الشرطةَ **والشرطةَ
 * السفلية** — وهي فاصلُنا. فأوّلُ صياغةٍ ولّدت البادئةَ والسرَّ بها، **فكلُّ رمزٍ فيه
 * شرطةٌ سفليةٌ في سرّه انقسم إلى أكثر من ثلاثة أجزاء فرُدّ `401`**. أمسكه أوّلُ تشغيلٍ
 * للحزمة (`5` مراحلَ حمراء)، **ولم تمسكه القراءة**.
 *
 * ⚠️ **والسرُّ يبقى `base64url`** — وهو ما بعد الفاصل الثاني، فلا يُقسَّم بعده.
 */
const PREFIX_CHARS = 16;
/** طولُ السرّ بالبايتات قبل الترميز. */
const SECRET_BYTES = 32;

const b64url = (n: number) => randomBytes(n).toString('base64url');

export interface GeneratedApiKey {
  prefix: string;
  secret: string;
  token: string;
}

/** يُولّد بادئةً وسرّاً ورمزاً — والرمزُ هو ما يُعطى للتاجر مرّةً واحدة. */
export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(PREFIX_CHARS / 2).toString('hex');
  const secret = b64url(SECRET_BYTES);
  return { prefix, secret, token: `${API_KEY_SCHEME}_${prefix}_${secret}` };
}

/**
 * يقرأ البادئةَ والسرَّ من رمزٍ مقدَّم — **ويُعيد `null` لما ليس على الشكل**.
 *
 * ولا يتحقّق من وجود المفتاح ولا من صحّة السرّ: **القراءةُ شكلٌ، والتحقّقُ استعلامٌ
 * وهاش** — والفصلُ بينهما هو ما يسمح للمقنِّن أن يقرأ بلا قاعدة.
 */
export function parseApiKeyToken(token: string): { prefix: string; secret: string } | null {
  const head = `${API_KEY_SCHEME}_`;
  if (!token.startsWith(head)) return null;
  const prefix = token.slice(head.length, head.length + PREFIX_CHARS);
  // **البادئةُ ستّ عشريّةٌ بطولٍ ثابت** — فالفاصلُ الثاني موضعُه معروف، **والسرُّ كلُّ ما
  // بعده ولو حمل شرطةً سفلية**. والقسمةُ على الفاصل تكسر ذلك (انظر أعلاه).
  if (!/^[0-9a-f]+$/.test(prefix) || prefix.length !== PREFIX_CHARS) return null;
  if (token[head.length + PREFIX_CHARS] !== '_') return null;
  const secret = token.slice(head.length + PREFIX_CHARS + 1);
  if (secret.length < 20) return null;
  return { prefix, secret };
}

/**
 * الرمزُ المقدَّم في الطلب — من `Authorization: ApiKey <token>` أو `X-Api-Key`.
 *
 * **ولا يُقرأ من `Bearer`**: فذاك رمزُ الجلسة، وخلطُهما يجعل رمزاً منتهياً يُجرَّب
 * مفتاحاً ويُجرَّب مفتاحٌ رمزاً — فيصير سببُ الرفض غامضاً على من يتكامل.
 */
export function presentedApiKey(headers: Record<string, unknown>): string | null {
  const direct = headers['x-api-key'];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const auth = headers.authorization;
  if (typeof auth === 'string' && /^ApiKey\s+\S+$/i.test(auth)) return auth.replace(/^ApiKey\s+/i, '').trim();
  return null;
}
