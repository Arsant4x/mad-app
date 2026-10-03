import { createCipheriv, createHash, randomBytes } from 'crypto';
import { gcmDecipher } from '../common/crypto/gcm.util';

/**
 * تشفير مفاتيح المزوّدين (المستند: «التزم بتشفير أي مفاتيح API»).
 *
 * AES-256-GCM: authenticated encryption — tampered ciphertext fails loudly
 * instead of decrypting to garbage. The key derives from INTEGRATIONS_ENC_KEY
 * (hashed to exactly 32 bytes so any passphrase length works); the dev
 * fallback keeps local work running but production MUST set its own — the
 * same stance MailService takes for SMTP.
 *
 * Wire format: base64(iv).base64(tag).base64(ciphertext) — self-contained,
 * one column, no schema churn if the algorithm ever changes (prefix it then).
 */
const DEV_FALLBACK = 'dev-only-integrations-key-change-in-production';

/**
 * المفتاح الاحتياطي **للتطوير وحده**، ونصّه منشور في هذا الملف — فاستعماله في
 * الإنتاج يعني أن بيانات اعتماد بوابات الدفع للتجار «مشفَّرة» بمفتاح يعرفه كل
 * من قرأ المستودع، أي غير مشفَّرة عملياً.
 *
 * الرمي هنا شبكة أمان ثانية: حارس الإقلاع (production-secrets.ts) يرفض
 * التشغيل أصلاً بلا INTEGRATIONS_ENC_KEY. لكن الحارس قد يُلتفّ عليه (اختبار
 * يستورد هذه الوحدة مباشرة، أو سكربت يعمل خارج bootstrap)، والصمت في هذا
 * الموضع تحديداً يُنتج بيانات مشفَّرة بمفتاح خاطئ لا تُكتشف إلا عند أول دفعة.
 */
function key(): Buffer {
  const configured = process.env.INTEGRATIONS_ENC_KEY;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('INTEGRATIONS_ENC_KEY غير مضبوط — يشفّر بيانات اعتماد بوابات الدفع، ولا بديل افتراضي له في الإنتاج.');
  }
  return createHash('sha256').update(configured ?? DEV_FALLBACK).digest();
}

export function encryptCredentials(plain: Record<string, string>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

export function decryptCredentials(stored: string): Record<string, string> {
  const [iv, tag, ciphertext] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
  // ⚖️ الوسمُ بطوله الكامل وحدَه (`ق-١٥٨٦`) — المدخلُ الواحد يرفض المقصوص.
  const decipher = gcmDecipher(key(), iv, tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as Record<string, string>;
}

/** قناع للعرض: «•••• آخر 4» — القيم الكاملة لا تغادر الخادم أبداً. */
export function maskCredentials(plain: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(plain)) {
    masked[k] = v.length <= 4 ? '••••' : `••••${v.slice(-4)}`;
  }
  return masked;
}
