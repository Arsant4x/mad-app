import { formatMoney } from '../common/money/rounding';
import { qrTimestamp, type WallClock } from '../common/wall-clock.util';
/**
 * ZATCA Phase 1 ("Generation") QR code.
 *
 * The authority specifies a base64-encoded **TLV** (tag-length-value) payload
 * with five mandatory fields, in this exact order and numbering:
 *
 *   1 seller name · 2 VAT registration number · 3 timestamp (ISO 8601)
 *   4 invoice total (VAT inclusive) · 5 VAT amount
 *
 * Length is the byte count of the **UTF-8 encoded** value, not the character
 * count — which matters here because seller names are Arabic, where one
 * character is two bytes. Getting that wrong produces a QR that scans but
 * fails ZATCA validation.
 */

export interface ZatcaQrInput {
  sellerName: string;
  vatNumber: string;
  /** يومُ الإصدار ووقتُه — **نفس** ما في `cbc:IssueDate`/`cbc:IssueTime` حرفاً (`ق-١٨٥`). */
  issued: WallClock;
  /** VAT-inclusive total. */
  total: number;
  vatAmount: number;
}

/** ZATCA expects amounts as plain decimal strings with 2 places. */
function amount(value: number): string {
  return formatMoney(value);
}

/**
 * **حدُّ قيمة الوسم: `255` بايتاً** — الطولُ في `TLV` الهيئة **بايتٌ واحدٌ** (معيارُ خصائص الأمان v1.2)،
 * ولا صيغةَ ممتدّةً في المواصفة — فقيمةٌ أطول **لا تُرمَّز** بل تُرفض باسمها (`ق-٧٣٥`).
 *
 * الواقعة (2026-09-14): `Buffer.from([tag, 256])` **يلفّ** الطولَ إلى `0` (و`300 → 44`) فتُقرأ بايتاتُ الاسم
 * وسوماً — **رمزٌ يُمسح ويُسلَّم ويُقرأ سليماً حتى يفحصه أحد**. والوسمُ الوحيدُ الذي يبلغه هو اسمُ البائع
 * (`companies.legalName` بلا حدٍّ): `128` حرفاً عربياً فأكثر = `256` بايتاً.
 */
export const ZATCA_QR_MAX_VALUE_BYTES = 255;

/** رفضٌ مسمّى — يحمل الوسمَ وعددَ البايتات ليصل الخطأُ من يقرؤه بحدّه لا بـ«فشل». */
export class ZatcaQrValueTooLongError extends Error {
  constructor(
    readonly tag: number,
    readonly bytes: number,
  ) {
    super(`ZATCA QR tag ${tag}: value is ${bytes} bytes — TLV length is a single byte (max ${ZATCA_QR_MAX_VALUE_BYTES})`);
    this.name = 'ZatcaQrValueTooLongError';
  }
}

/** One TLV field from raw bytes, shared by the phase 1 and phase 2 builders so both keep the one byte length limit. */
export function tlvBytes(tag: number, encoded: Buffer): Buffer {
  if (encoded.length > ZATCA_QR_MAX_VALUE_BYTES) throw new ZatcaQrValueTooLongError(tag, encoded.length);
  return Buffer.concat([Buffer.from([tag, encoded.length]), encoded]);
}

function tlv(tag: number, value: string): Buffer {
  return tlvBytes(tag, Buffer.from(value, 'utf8'));
}

/**
 * Returns the base64 TLV string to encode into the QR image, or `null` when
 * the company hasn't filled in the two fields ZATCA requires (legal name and
 * VAT number).
 *
 * Returning null rather than an empty-field QR is deliberate: a scannable but
 * invalid QR on a printed invoice is worse than none, because it looks
 * compliant while failing inspection.
 *
 * ⚠️ **ويرمي `ZatcaQrValueTooLongError`** لقيمةٍ فوق `255` بايتاً — لا `null` ولا رمزاً فاسداً: الغيابُ
 * حالٌ معلَنة (اسمٌ أو رقمٌ ناقص) والطولُ خطأٌ يُسمّى لمن يُصدر المستند (`ق-٧٣٥`).
 */
export function buildZatcaQr(input: ZatcaQrInput): string | null {
  const sellerName = input.sellerName?.trim();
  const vatNumber = input.vatNumber?.trim();
  if (!sellerName || !vatNumber) return null;

  return Buffer.concat([
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, qrTimestamp(input.issued)),
    tlv(4, amount(input.total)),
    tlv(5, amount(input.vatAmount)),
  ]).toString('base64');
}

/** Decodes a QR payload back into its tagged fields — used by the tests to
 * assert the structure, and handy for debugging a rejected invoice. */
export function decodeZatcaQr(base64: string): Record<number, string> {
  const buf = Buffer.from(base64, 'base64');
  const out: Record<number, string> = {};
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const tag = buf[offset];
    const length = buf[offset + 1];
    out[tag] = buf.subarray(offset + 2, offset + 2 + length).toString('utf8');
    offset += 2 + length;
  }
  return out;
}
