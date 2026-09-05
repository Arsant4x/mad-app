import { round2 } from './money';
import { qrTimestamp, type WallClock } from './wallClock';

/**
 * رمزُ الهيئة للمرحلة الأولى **على الجهاز، بلا مفاتيح** (`ق-١٨٨`) — نسخةُ
 * المتصفّح من `apps/api/src/zatca/qr.util.ts`، للإيصال الأوفلاين وحده؛ الإيصال
 * المتصل يأخذ رمزه من الخادم (`ق-١٨٦`).
 *
 * الملحق (١) من قرار التنفيذ: `QR` إلزاميٌّ **توليداً وطباعةً** على المبسّطة.
 * وسيناريو الانقطاع في §10 يفترض جهازاً يولّد الرمز أوفلاين — والوسوم الخمسة لا
 * تحتاج مفتاحاً: الاسم · الرقم الضريبي · الطابع الزمني · الإجمالي · الضريبة.
 *
 * ⚠️ **طولُ كل وسمٍ بالبايتات لا بالحروف** — الاسم عربيٌّ، والحرف بايتان؛ وعدُّ
 * الحروف يُنتج رمزاً يُقرأ ولا يصحّ (العطل المعروف في الخادم قبل أن يُصلَح).
 * مُثبَتٌ بالعكس في `zatcaQr.test.ts` بنصٍّ عربي.
 *
 * `null` حين يغيب الاسم القانوني أو الرقم الضريبي (ملفٌ ناقص أو لم يُخبَّأ قبل
 * الانقطاع): رمزٌ يُقرأ ولا يصحّ أسوأ من غيابه — والواجهة تُنبّه الكاشير.
 */

export interface Phase1QrInput {
  sellerName: string | null | undefined;
  vatNumber: string | null | undefined;
  issued: WallClock;
  total: number;
  vatAmount: number;
}

const encoder = new TextEncoder();

/** وسمٌ + طولٌ **بالبايتات** + القيمة. */
export function tlv(tag: number, value: string): Uint8Array {
  const bytes = encoder.encode(value);
  if (bytes.length > 255) throw new Error(`وسم ${tag}: القيمة أطول من ٢٥٥ بايتاً`);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = tag;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** base64 لبايتاتٍ خام — `btoa` يقبل سلسلةَ بايتاتٍ لا نصاً مفكوكاً. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** المبلغ كما تكتبه الهيئة: منزلتان بعد التدوير بسياسة المنتج نفسها. */
const amount = (value: number) => round2(value).toFixed(2);

export function buildPhase1Qr(input: Phase1QrInput): string | null {
  const sellerName = input.sellerName?.trim();
  const vatNumber = input.vatNumber?.trim();
  if (!sellerName || !vatNumber) return null;
  return bytesToBase64(
    concat([tlv(1, sellerName), tlv(2, vatNumber), tlv(3, qrTimestamp(input.issued)), tlv(4, amount(input.total)), tlv(5, amount(input.vatAmount))]),
  );
}

/** فكُّ الرمز إلى وسومه — للاختبار ولتشخيص إيصالٍ مرفوض. */
export function decodePhase1Qr(base64: string): Record<number, string> {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const decoder = new TextDecoder();
  const fields: Record<number, string> = {};
  for (let at = 0; at < bytes.length; ) {
    const tag = bytes[at];
    const len = bytes[at + 1];
    fields[tag] = decoder.decode(bytes.slice(at + 2, at + 2 + len));
    at += 2 + len;
  }
  return fields;
}
