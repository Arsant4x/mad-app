/**
 * تصدير CSV (احتياجات 10.12) — الأساس المشترك لكل التقارير.
 *
 * BOM أولاً: بدونه يفتح Excel العربية خربشةً (يفترض ANSI). القيم تُقتبس
 * وتُهرَّب قياسياً (RFC 4180)، والأرقام تخرج كما هي ليقرأها Excel أرقاماً.
 */
export interface CsvColumn<T> {
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCell(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(','));
  return '﻿' + [header, ...body].join('\r\n');
}
