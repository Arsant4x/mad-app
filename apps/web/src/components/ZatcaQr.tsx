import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * Renders the ZATCA phase-1 QR for a printed tax invoice.
 *
 * `payload` is the base64 TLV string the server builds (see
 * apps/api/src/zatca/qr.util.ts) — this component only turns it into an image
 * and never constructs or alters it, so what's printed is exactly what the
 * server attested to.
 *
 * Renders nothing when `payload` is null, which is the server's way of saying
 * the company profile is missing its legal name or VAT number. Showing a
 * placeholder QR would be worse than showing none: it looks compliant while
 * failing inspection.
 */
export function ZatcaQr({ payload, size = 120 }: { payload: string | null; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(payload, { margin: 1, width: size })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  if (!payload) {
    return (
      <div style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 180 }}>
        أكمل الاسم القانوني والرقم الضريبي في «بيانات المنشأة» ليظهر رمز الفاتورة الإلكترونية.
      </div>
    );
  }

  if (!dataUrl) return null;

  return (
    <div style={{ textAlign: 'center' }}>
      <img src={dataUrl} alt="رمز الاستجابة السريعة للفاتورة الضريبية" width={size} height={size} />
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>فاتورة — هيئة الزكاة والضريبة والجمارك</div>
    </div>
  );
}
