import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * **رمزٌ لمرّةٍ مبنيٌّ على الوقت — RFC 6238** (`ق-١٣١٨` · ⑨A1 — باب `⑨ الصلاحيات`، مُسح).
 *
 * «اختراقُ حسابٍ بكلمةٍ واحدة **يقع مرّةً ولا يُردّ**: مديرُ المنصّة يرى كلَّ المنشآت،
 * والمالكُ يرى دفترَ منشأته كلَّه؛ **وبياناتٌ سُرّبت لا تعود**» (`docs/domain-scan/09` · A1).
 *
 * ## لماذا يُكتب هنا ولا تُضاف مكتبة
 *
 * **الخوارزميةُ منشورةٌ بمتجهات اختبارٍ رسمية** (RFC 6238 §Appendix B) — فتُثبَت بها لا
 * بالثقة. وهي `HMAC` وقصٌّ ديناميّ: **لا تبادلَ مفاتيح ولا حشو**، فليس فيها ما يُخطئ فيه
 * التطبيقُ صامتاً. **ومكتبةٌ جديدة سطحُ اعتمادٍ يُدار** في مسار الدخول بعينه.
 *
 * ## ⚠️ وما يُحرَس صراحةً
 *
 * **المقارنةُ بزمنٍ ثابت** (`timingSafeEqual`) — فمقارنةُ نصٍّ عاديّة تُسرّب الرمزَ حرفاً
 * حرفاً بالتوقيت · **ونافذةُ انحراف** خطوةً واحدة قبل وبعد (ساعةُ الهاتف تنحرف) · **ولا
 * أوسع**: كلُّ خطوةٍ زائدة تضاعف سطحَ التخمين.
 */

/** ثلاثون ثانية — خطوةُ RFC 6238 الافتراضية، وهي ما تتوقّعه تطبيقاتُ المصادقة. */
export const TOTP_STEP_SECONDS = 30;
/** ستُّ خاناتٍ — الافتراضُ نفسُه. */
export const TOTP_DIGITS = 6;
/** خطوةٌ قبل وبعد: انحرافُ الساعة يقع فعلاً، **وأوسعُ من ذلك يوسّع التخمين**. */
export const TOTP_WINDOW = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** ترميزُ `base32` (RFC 4648 بلا حشو) — وهو ما تقرؤه تطبيقاتُ المصادقة. */
export function toBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** سرٌّ جديد — عشرون بايتاً (`160` بتاً) كما توصي RFC 4226. */
export function generateTotpSecret(): string {
  return toBase32(randomBytes(20));
}

/** الرمزُ لعدّادِ خطوةٍ بعينها — HOTP (RFC 4226) وهو نواةُ TOTP. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(buf).digest();
  // القصُّ الديناميّ: آخرُ نصفِ بايتٍ يختار الإزاحة (RFC 4226 §5.3).
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(secretBase32: string, atMs = Date.now(), digits = TOTP_DIGITS, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  return hotp(fromBase32(secretBase32), Math.floor(atMs / 1000 / TOTP_STEP_SECONDS), digits, algorithm);
}

/**
 * **التحقّق — بزمنٍ ثابتٍ وبنافذةٍ ضيّقة.**
 *
 * ⚠️ **ولا يمنع إعادةَ الاستعمال داخل الخطوة نفسِها**: ذاك حكمُ المُخزِّن لا الخوارزمية —
 * **ويُبنى حيث تُقرأ الحالة** (وقد بُني: آخرُ خطوةٍ قُبلت تُحفظ على الهويّة).
 */
export function verifyTotp(secretBase32: string, code: string, atMs = Date.now()): { ok: boolean; step: number } {
  const clean = code.replace(/\D/g, '');
  if (clean.length !== TOTP_DIGITS) return { ok: false, step: 0 };
  const current = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  const secret = fromBase32(secretBase32);
  for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift++) {
    const expected = hotp(secret, current + drift);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, step: current + drift };
  }
  return { ok: false, step: 0 };
}

/**
 * **رموزُ الاسترداد** — ثمانيةٌ، كلٌّ منها يُستعمل مرّةً.
 *
 * **بلا أحرفٍ متشابهة** (`0`/`O` · `1`/`I`): تُكتب بيدٍ عن ورقةٍ، **وخطأُ قراءةٍ يُقرأ رمزاً
 * خاطئاً** فيُستهلك عدّادُ المحاولات على لا شيء.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(10);
    let code = '';
    for (const byte of raw) code += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }
  return codes;
}

/** التطبيعُ قبل المقارنة — التاجرُ يكتبها بأحرفٍ صغيرة أو بلا شرطة. */
export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** رابطُ التسجيل الذي يقرؤه تطبيقُ المصادقة. */
export function otpauthUrl(secretBase32: string, account: string, issuer = 'mad-app'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
