import type { Money, Qty } from '../api/wire';

/**
 * عرضُ المال — الموضعُ الوحيد الذي يقرّر شكلَ المبلغ على الشاشة (القاعدتان ① و③).
 *
 * - يقبل `Money | null` **ولا يقبل `number`**: رقمٌ حُسب في الشاشة لا يصل عموداً مالياً بخطأ نوع.
 * - `null` يُرسم `—` **في فرعٍ صريح واحد** — لا `0.00`. (`lib/format.ts:4` كان يحوّل
 *   الغائبَ صفراً فيبدو الجدولُ مكتملاً وهو ناقص — المراجعة ج٤ §١.٢.)
 * - التجميعُ بفواصل الآلاف على **النصّ** كما جاء: لا `Number()` ولا تدوير — الخادمُ دوّر.
 */
export function formatMoney(value: Money): string {
  const [int, frac = '00'] = value.split('.');
  const neg = int.startsWith('-');
  const digits = neg ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}${grouped}.${frac.padEnd(2, '0').slice(0, 2)}`;
}

export function formatQty(value: Qty): string {
  const [int, frac] = value.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${grouped}.${frac}` : grouped;
}

export function MoneyCell({ value, currency, className }: { value: Money | null; currency?: string; className?: string }) {
  if (value === null) {
    return (
      <span className={`rz-money rz-money--absent ${className ?? ''}`} data-absent="true" aria-label="غير متاح">
        —
      </span>
    );
  }
  return (
    <span className={`rz-money num ${className ?? ''}`} dir="ltr">
      {formatMoney(value)}
      {currency ? <span className="rz-money__cur"> {currency}</span> : null}
    </span>
  );
}

export function QtyCell({ value, unit }: { value: Qty | null; unit?: string }) {
  if (value === null) return <span className="rz-money rz-money--absent" data-absent="true" aria-label="غير متاح">—</span>;
  return (
    <span className="rz-money num" dir="ltr">
      {formatQty(value)}
      {unit ? <span className="rz-money__cur"> {unit}</span> : null}
    </span>
  );
}
