import { formatMoney } from '../common/money/rounding';
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
  /** Invoice issue timestamp. */
  issuedAt: Date;
  /** VAT-inclusive total. */
  total: number;
  vatAmount: number;
}

/** ZATCA expects amounts as plain decimal strings with 2 places. */
function amount(value: number): string {
  return formatMoney(value);
}

function tlv(tag: number, value: string): Buffer {
  const encoded = Buffer.from(value, 'utf8');
  return Buffer.concat([Buffer.from([tag, encoded.length]), encoded]);
}

/**
 * Returns the base64 TLV string to encode into the QR image, or `null` when
 * the company hasn't filled in the two fields ZATCA requires (legal name and
 * VAT number).
 *
 * Returning null rather than an empty-field QR is deliberate: a scannable but
 * invalid QR on a printed invoice is worse than none, because it looks
 * compliant while failing inspection.
 */
export function buildZatcaQr(input: ZatcaQrInput): string | null {
  const sellerName = input.sellerName?.trim();
  const vatNumber = input.vatNumber?.trim();
  if (!sellerName || !vatNumber) return null;

  return Buffer.concat([
    tlv(1, sellerName),
    tlv(2, vatNumber),
    tlv(3, input.issuedAt.toISOString()),
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
