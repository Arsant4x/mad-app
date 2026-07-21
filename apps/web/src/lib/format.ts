/** Matches the original mockup's fmt(): en-US grouping, always 2 decimals. */
export function fmt(n: number | string): string {
  const num = Number(n);
  return (Number.isFinite(num) ? num : 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO 'YYYY-MM-DD' -> 'DD/MM/YYYY', matching the original mockup's dfmt(). */
export function dfmt(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toLocalISODate(new Date());
}
