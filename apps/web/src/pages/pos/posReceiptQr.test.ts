import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// File budget: pure source reads, well under the default.
vi.setConfig({ testTimeout: 5_000 });

/**
 * The ZATCA code on the customer's receipt, inside the print area.
 *
 * Annex 1 of the implementation resolution makes the QR code mandatory, both
 * generated and printed, on a simplified invoice. The guard reads the page
 * source and fails if ZatcaQr leaves #pos-receipt or moves outside the print
 * area (shown on screen but not printed, while printing is the obligation).
 */
const source = readFileSync(resolve(__dirname, 'PosPage.tsx'), 'utf8');
const ar = JSON.parse(readFileSync(resolve(__dirname, '../../i18n/locales/ar/pos.json'), 'utf8'));

describe('the cashier receipt carries the ZATCA code inside the print area', () => {
  it('ZatcaQr sits between the start of #pos-receipt and the end of the print area', () => {
    expect(source.length).toBeGreaterThan(1000); // A failed read fails, never passes.
    const start = source.indexOf('id="pos-receipt"');
    const qr = source.indexOf('<ZatcaQr', start);
    const end = source.indexOf('Outside .print-receipt on purpose', start);
    expect(start).toBeGreaterThan(-1);
    expect(qr).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(qr);
  });

  it('the offline receipt too: ZatcaQr inside its print area, with the "compliant invoice on reconnect" notice', () => {
    const start = source.indexOf("t('pos.offline_receipt.temp_ref'");
    const notice = source.indexOf("t('pos.offline_receipt.notice')", start);
    const qr = source.indexOf('<ZatcaQr payload={offlineReceipt.zatcaQr}', start);
    const end = source.indexOf('modal-foot', start);
    expect(start).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(start);
    expect(qr).toBeGreaterThan(notice);
    expect(end).toBeGreaterThan(qr);
    // The Arabic wording behind the keys is unchanged.
    expect(ar.offline_receipt.temp_ref).toContain('مرجع مؤقت:');
    expect(ar.offline_receipt.notice).toContain('تُصدَر الفاتورة الممتثلة تلقائياً بتاريخ هذا البيع فور عودة الاتصال');
    // Built on the device, not awaited from the server, with the stamp from the device clock itself.
    expect(source).toContain('buildPhase1Qr({');
    expect(source).toContain('wallClockOf(new Date(sale.ringAt), sale.ringOffsetMin)');
  });

  it('a missing code is never replaced by a fake one: a note for the cashier outside the receipt instead', () => {
    // A code that scans but is wrong is worse than none: with no receiptQr
    // nothing is drawn, and the cashier is told to complete the company profile.
    expect(source).toMatch(/receipt\.receiptQr && \(/);
    // A full invoice held until clearance has no code on purpose: the "complete the profile" note is not shown for it; its hold is.
    expect(source).toMatch(/!receipt\.receiptQr && !receipt\.clearance\?\.required && \(/);
    expect(source).toMatch(/receipt\.clearance\?\.required && \(/);
    expect(source).toContain("t('pos.receipt.no_qr')");
    expect(ar.receipt.no_qr).toContain('أكمل الاسم القانوني والرقم الضريبي');
  });
});
