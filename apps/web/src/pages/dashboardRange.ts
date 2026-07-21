import { toLocalISODate, today } from '../lib/format';

export type DashRange = 'month' | 'quarter' | 'year' | 'all' | 'custom';

/** Mirrors the original mockup's dashDateRange(). */
export function computeRange(range: DashRange, customFrom: string, customTo: string): { from: string | null; to: string } {
  const now = new Date();
  if (range === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return { from: toLocalISODate(new Date(now.getFullYear(), q * 3, 1)), to: today() };
  }
  if (range === 'year') return { from: toLocalISODate(new Date(now.getFullYear(), 0, 1)), to: today() };
  if (range === 'all') return { from: null, to: today() };
  if (range === 'custom') return { from: customFrom || null, to: customTo || today() };
  return { from: toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today() };
}

export function inRange(dateIso: string, from: string | null, to: string): boolean {
  const d = dateIso.slice(0, 10);
  return (!from || d >= from) && d <= to;
}
