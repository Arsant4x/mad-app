import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { gcmDecipher } from './gcm.util';

/**
 * ⚖️ **تشفيرُ الحقول الحسّاسة في التطبيق من أوّل حقل** (`ق-١٣٤٥` · الحزمة م①).
 *
 * بنصّ المالك: «هويّةُ الموظف ورقمُ حسابه ورقمُ تأميناته: تُشفَّر في التطبيق من أوّل حقل … ⚠️ والأثقل: عندنا حادثةُ
 * مقلبٍ تسرّب، والمقالبُ على المضيف كانت مكشوفة. ⇒ فالنصُّ الصريح في القاعدة يصل كلَّ نسخةٍ ومقلب، والتشفيرُ لاحقاً
 * لا يستعيد ما خرج.»
 *
 * ## الشكل — بنصّه
 * - «**مفتاحُ المنصّة خارج القاعدة الآن، ومعرّفُ المفتاح يُحفظ مع كلِّ قيمةٍ مشفَّرة** ⇒ فالانتقالُ إلى خزنة أوراكل
 *   بالرياض تدويرُ مفتاحٍ لا إعادةُ تشفير.» — القيمةُ `f1:<معرّفُ المفتاح>:<iv>:<tag>:<ciphertext>`، والمفاتيحُ حلقةٌ
 *   (`PII_ENCRYPTION_KEYS`) يُكتب الجديدُ بنشيطها (`PII_ENCRYPTION_KEY_ID`) ويُقرأ القديمُ بمعرّفه.
 * - «**وبصمةٌ ثانيةٌ بمفتاحٍ منفصل للبحث برقم الهويّة**» — `HMAC-SHA256` بمفتاحٍ آخر (`PII_BLIND_INDEX_KEY`)، **ومجالُها
 *   المنشأة**: الرقمُ نفسُه في منشأتين بصمتان مختلفتان، فلا تُربط الشخصيّةُ عبر المستأجرين من القاعدة.
 * - «⛔ **ومفتاحٌ لكلِّ منشأةٍ ليس الآن، والشكلُ لا يمنعه لاحقاً**» — معرّفُ المفتاح في القيمة يكفي لذلك يومَ يُقرَّر.
 *
 * ## الربطُ بالموضع (`AAD`)
 * كلُّ قيمةٍ مربوطةٌ بمنشأتها وحقلها وصفّها — فنسخُ نصٍّ مشفَّرٍ إلى صفٍّ آخر أو حقلٍ آخر **يفشل فكُّه** بدل أن يُقرأ
 * بياناً لشخصٍ آخر. و`GCM` يوثّق النصَّ فالعبثُ به يفشل كذلك.
 *
 * ## حدودُه المعلَنة
 * - يحمي **النسخَ والمقالبَ وقراءةَ القاعدة** — لا من يملك المفتاحَ والقاعدةَ معاً (التطبيقُ نفسُه يفكّ).
 * - **البصمةُ تكشف التساويَ داخل المنشأة** (من يرى القاعدةَ يعرف أن صفّين برقمٍ واحد) — وهو ثمنُ البحث، معلَن.
 * - **تدويرُ مفتاح البصمة إعادةُ حساب** لا حلقة: البصمةُ لا تُفكّ — فمعرّفُه يُحفظ في قيمتها ليُعرف ما يُعاد.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const FORMAT = 'f1';
const BLIND_FORMAT = 'b1';

export class FieldCipherConfigError extends Error {}

interface Keyring {
  activeId: string;
  keys: Map<string, Buffer>;
}

/** «مُعرِّفٌ:مفتاحٌ» — المفتاحُ `base64` لاثنين وثلاثين بايتاً بالضبط؛ لا تجزئةَ لعبارةٍ تُكتب بيد. */
function parsePair(raw: string, envName: string): [string, Buffer] {
  const at = raw.indexOf(':');
  const id = raw.slice(0, at).trim();
  const key = Buffer.from(raw.slice(at + 1).trim(), 'base64');
  if (at <= 0 || !/^[A-Za-z0-9_-]{1,16}$/.test(id)) throw new FieldCipherConfigError(`${envName}: كلُّ مدخلٍ «مُعرِّفٌ:مفتاح» — والمعرّفُ حروفٌ وأرقامٌ حتى ١٦`);
  if (key.length !== 32) throw new FieldCipherConfigError(`${envName}: المفتاحُ «${id}» ليس ٣٢ بايتاً بـbase64 (وُجد ${key.length})`);
  return [id, key];
}

function keyring(): Keyring {
  const raw = process.env.PII_ENCRYPTION_KEYS?.trim();
  const activeId = process.env.PII_ENCRYPTION_KEY_ID?.trim();
  if (!raw || !activeId) throw new FieldCipherConfigError('PII_ENCRYPTION_KEYS و PII_ENCRYPTION_KEY_ID مطلوبان قبل حفظ أيّ حقلٍ حسّاس');
  const keys = new Map(raw.split(',').map((p) => parsePair(p, 'PII_ENCRYPTION_KEYS')));
  if (!keys.has(activeId)) throw new FieldCipherConfigError(`PII_ENCRYPTION_KEY_ID «${activeId}» ليس في الحلقة`);
  return { activeId, keys };
}

function blindKey(): [string, Buffer] {
  const raw = process.env.PII_BLIND_INDEX_KEY?.trim();
  if (!raw) throw new FieldCipherConfigError('PII_BLIND_INDEX_KEY مطلوبٌ قبل حفظ رقم هويّة');
  return parsePair(raw, 'PII_BLIND_INDEX_KEY');
}

const b64u = (b: Buffer) => b.toString('base64url');

/** يُشفّر قيمةً لموضعها (`aad`) بمفتاح الحلقة النشيط — والمعرّفُ في القيمة. */
export function encryptField(plaintext: string, aad: string): string {
  const { activeId, keys } = keyring();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keys.get(activeId)!, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [FORMAT, activeId, b64u(iv), b64u(cipher.getAuthTag()), b64u(data)].join(':');
}

/** يفكّ قيمةً بمعرّف مفتاحها — ويرمي إن غاب المفتاحُ أو اختلف الموضعُ أو عُبث بالنصّ. */
export function decryptField(stored: string, aad: string): string {
  const [format, keyId, ivB, tagB, dataB] = stored.split(':');
  if (format !== FORMAT || !keyId || ivB === undefined || tagB === undefined || dataB === undefined) {
    throw new FieldCipherConfigError(`صيغةُ حقلٍ مشفَّرٍ غيرُ معروفة «${format}»`);
  }
  const key = keyring().keys.get(keyId);
  if (!key) throw new FieldCipherConfigError(`المفتاحُ «${keyId}» الذي شُفّرت به القيمةُ ليس في الحلقة — لا يُحذف مفتاحٌ ما دامت به قيمة`);
  // ⚖️ الوسمُ بطوله الكامل وحدَه (`ق-١٥٨٦`) — المدخلُ الواحد يرفض المقصوص.
  const decipher = gcmDecipher(key, Buffer.from(ivB, 'base64url'), Buffer.from(tagB, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
}

/**
 * ⚖️ **`ق-١٣٦٥` — غلافُ الملفّ: البايتاتُ بالحلقة نفسِها** (بنصّ المالك: «مرفقاتُ العقود حسّاسةٌ الآن … والحساسيةُ بالمخزن لا بسؤال
 * الرافع. والتنزيلُ من المخزن الحسّاس عبر الخادم يفكّ ويبثّ، لا برابطٍ موقَّع»).
 *
 * الشكلُ ثنائيٌّ لا نصّ (`base64` يُضخّم الملفَّ ثلثاً): `mfb1` · طولُ المعرّف (بايتٌ واحد) · المعرّف · `iv` (١٢) · `tag` (١٦) · النصّ.
 * **والمعرّفُ في الغلاف** كما في الحقل — فالتدويرُ إضافةُ مفتاحٍ لا إعادةُ تشفير. **والموضعُ (`aad`) مفتاحُ الكائن** في المخزن: نسخُ
 * الكائن إلى مفتاحٍ آخر يفشل فكُّه بدل أن يُقرأ مرفقاً لعقدٍ آخر.
 */
const BYTES_MAGIC = Buffer.from('mfb1', 'ascii');
const TAG_BYTES = 16;

export function encryptBytes(plain: Buffer, aad: string): Buffer {
  const { activeId, keys } = keyring();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keys.get(activeId)!, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const id = Buffer.from(activeId, 'utf8');
  return Buffer.concat([BYTES_MAGIC, Buffer.from([id.length]), id, iv, cipher.getAuthTag(), data]);
}

/** أهذه بايتاتٌ في الغلاف؟ — بالبصمة الأولى وحدَها، بلا فكّ. */
export function isEncryptedBytes(stored: Buffer): boolean {
  return stored.length > BYTES_MAGIC.length && stored.subarray(0, BYTES_MAGIC.length).equals(BYTES_MAGIC);
}

/** يفكّ الغلافَ بمعرّف مفتاحه — ويرمي إن لم يكن غلافاً أو غاب المفتاحُ أو اختلف الموضعُ أو عُبث بالبايتات. */
export function decryptBytes(stored: Buffer, aad: string): Buffer {
  if (!isEncryptedBytes(stored)) throw new FieldCipherConfigError('ليست بايتاتٍ مغلَّفة (mfb1)');
  let at = BYTES_MAGIC.length;
  const idLength = stored[at];
  at += 1;
  const keyId = stored.subarray(at, at + idLength).toString('utf8');
  at += idLength;
  const iv = stored.subarray(at, at + IV_BYTES);
  at += IV_BYTES;
  const tag = stored.subarray(at, at + TAG_BYTES);
  at += TAG_BYTES;
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new FieldCipherConfigError('غلافٌ مبتور');
  const key = keyring().keys.get(keyId);
  if (!key) throw new FieldCipherConfigError(`المفتاحُ «${keyId}» الذي غُلّف به الملفُّ ليس في الحلقة — لا يُحذف مفتاحٌ ما دام به ملفّ`);
  const decipher = gcmDecipher(key, iv, tag);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  return Buffer.concat([decipher.update(stored.subarray(at)), decipher.final()]);
}

/** بصمةُ البحث: `b1:<معرّفُ المفتاح>:<HMAC>` — مجالُها المنشأة (`scope`)، فلا تتطابق عبر المستأجرين. */
export function blindIndex(value: string, scope: string): string {
  const [id, key] = blindKey();
  const mac = createHmac('sha256', key).update(`${scope}\u001f${value}`, 'utf8').digest();
  return [BLIND_FORMAT, id, b64u(mac)].join(':');
}

/** معرّفُ المفتاح الذي شُفّرت به قيمة — للتدوير والعدّ، بلا فكّ. */
export function fieldKeyIdOf(stored: string): string | null {
  const [format, keyId] = stored.split(':');
  return format === FORMAT && keyId ? keyId : null;
}

/** مفتاحٌ من بايتٍ واحدٍ مكرَّر — قيمةُ اختبارٍ لا سرّ (مفاتيحُ `.env.test` كذلك عمداً). */
const isSingleByte = (key: Buffer) => key.every((b) => b === key[0]);

/**
 * **لحارس الإقلاع** (`production-secrets.ts`) — الفحصُ نفسُه الذي يرمي عند أوّل حقل، قبل الإقلاع لا بعده: `null` حين تصلح
 * الحلقة، ونصُّ الخلل حين لا تصلح. ولا يُطبع مفتاحٌ قطّ — المعرّفُ وحدَه.
 */
export function keyringProblem(raw: string, activeId: string | undefined): string | null {
  try {
    const keys = new Map(raw.split(',').map((p) => parsePair(p, 'PII_ENCRYPTION_KEYS')));
    for (const [id, key] of keys) if (isSingleByte(key)) return `المفتاحُ «${id}» بايتٌ واحدٌ مكرَّر — قيمةُ اختبارٍ لا سرّ`;
    if (!activeId?.trim() || !keys.has(activeId.trim())) return `PII_ENCRYPTION_KEY_ID «${activeId ?? ''}» ليس في الحلقة`;
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** **لحارس الإقلاع** — مفتاحُ البصمة صالحٌ و**منفصلٌ** عن كلِّ مفتاحٍ في حلقة التشفير («بمفتاحٍ منفصل» بنصّ المالك). */
export function blindKeyProblem(raw: string, ringRaw: string | undefined): string | null {
  try {
    const [id, key] = parsePair(raw, 'PII_BLIND_INDEX_KEY');
    if (isSingleByte(key)) return `المفتاحُ «${id}» بايتٌ واحدٌ مكرَّر — قيمةُ اختبارٍ لا سرّ`;
    const ring = (ringRaw ?? '').split(',').filter((p) => p.includes(':'));
    for (const p of ring) {
      const [ringId, ringKey] = parsePair(p, 'PII_ENCRYPTION_KEYS');
      if (ringKey.equals(key)) return `مفتاحُ البصمة هو مفتاحُ التشفير «${ringId}» نفسُه — والبصمةُ بمفتاحٍ منفصل`;
    }
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
