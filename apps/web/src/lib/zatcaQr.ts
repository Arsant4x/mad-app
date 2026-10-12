import { formatMoney } from './money';
import { qrTimestamp, type WallClock } from './wallClock';

/**
 * The phase 1 invoice QR built on the device, with no keys: the browser copy of
 * `apps/api/src/zatca/qr.util.ts`, used for the offline receipt only; an online receipt takes its code
 * from the server.
 *
 * The QR is required, generated and printed, on simplified invoices, and the offline scenario expects
 * the device to build it. The five tags need no key: name, VAT number, timestamp, total and tax.
 *
 * Each tag length is in bytes, not characters: the name is Arabic and a letter takes two bytes, so
 * counting characters gives a code that scans but is invalid. Proven against Arabic text in
 * `zatcaQr.test.ts`.
 *
 * `null` when the legal name or VAT number is missing (an incomplete profile, or not cached before going
 * offline): a code that scans but is invalid is worse than none, and the screen warns the cashier.
 */

export interface Phase1QrInput {
  sellerName: string | null | undefined;
  vatNumber: string | null | undefined;
  issued: WallClock;
  total: number;
  vatAmount: number;
}

const encoder = new TextEncoder();

/** Tag, length in bytes, then the value. */
export function tlv(tag: number, value: string): Uint8Array {
  const bytes = encoder.encode(value);
  if (bytes.length > 255) throw new Error(`وسم ${tag}: القيمة أطول من ٢٥٥ بايتاً`); // i18n-exempt: internal error for developers, never shown in the interface
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

/** base64 of raw bytes: `btoa` takes a byte string, not decoded text. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** The amount as the authority writes it: two decimals after the product's rounding, through `lib/money.ts` only. */
const amount = (value: number) => formatMoney(value);

export function buildPhase1Qr(input: Phase1QrInput): string | null {
  const sellerName = input.sellerName?.trim();
  const vatNumber = input.vatNumber?.trim();
  if (!sellerName || !vatNumber) return null;
  return bytesToBase64(
    concat([tlv(1, sellerName), tlv(2, vatNumber), tlv(3, qrTimestamp(input.issued)), tlv(4, amount(input.total)), tlv(5, amount(input.vatAmount))]),
  );
}

/** Decodes the code into its tags, for tests and for diagnosing a rejected receipt. */
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
