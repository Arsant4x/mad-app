import { apiClient } from './client';

export interface GovernmentObligation {
  id: string;
  body: string;
  title: string;
  done: boolean;
}

/** قسمُ الإيجار في الإقرار — من صفوف الاستحقاق، وما سبق البناء يُحسب ويُعدّ (ق-٩١٨ · ق-٩٢٦). */
export interface RentDeclarationSection {
  standard: number;
  standardVat: number;
  exempt: number;
  managedExcluded: number;
  managedCount: number;
  legacyStandard: number;
  legacyStandardVat: number;
  legacyExempt: number;
  legacyCount: number;
  legacyNote: string;
  unclassifiedCount: number;
  unclassifiedNote: string;
  unpostedCount: number;
  pendingCount: number;
  pendingNote: string;
  accrualCount: number;
}

/** ⑧ خاناتُ المبيعات 1–6 من فئات السطور (`ق-١٢١١`/⑤) — والخانةُ 2 تابعةٌ للمشتري: صفرٌ معلَن وغيرُ مدعومة. */
export interface SalesBoxes {
  1: { net: number; vat: number };
  2: { net: number; vat: number; supported: false };
  3: { net: number };
  4: { net: number };
  5: { net: number };
  6: { net: number };
}

export interface VatDeclaration {
  year: number;
  quarter: number;
  from: string;
  to: string;
  salesStandard: number;
  salesStandardVat: number;
  salesExempt: number;
  /** الخانةُ 3 — الخاضعُ للصفر داخلياً (`Z` بغير رمز التصدير). */
  salesZeroRatedDomestic: number;
  /** الخانةُ 4 — الصادرات (`VATEX-SA-32` · `33`). */
  salesExports: number;
  /** الخانةُ 2 — صفرٌ معلَن (تابعةٌ للمشتري). */
  salesCitizens: number;
  salesCitizensNote: string;
  /** الخانةُ 6 — مجموعُ المبيعات. */
  totalSales: number;
  /** خارجَ النطاق (`O`) — يُعدّ ولا يدخل الخانات. */
  salesOutOfScope: { lineCount: number; net: number };
  /** سطورٌ سبقت البناء بنسبة صفر بلا فئة — تُعدّ ولا تدخل الخانات (`LEGACY_ZERO`). */
  legacyZeroLines: { lineCount: number; net: number };
  /** سطورٌ على صنفٍ لم تُعلَن فئتُه — داخلةٌ في الخانة 1 وتُعدّ بنصّها (`LEGACY_STANDARD`). */
  legacyStandardLines: { lineCount: number; net: number };
  boxes: SalesBoxes;
  rent: RentDeclarationSection;
  purchasesStandard: number;
  purchasesStandardVat: number;
  purchasesExempt: number;
  totalPurchases: number;
  netVat: number;
  invoiceCount: number;
  purchaseCount: number;
  /** علَمُ «قُدِّم» (ق-٩١٩) — يضعه التاجر بيده. */
  filed: { filedAt: string; netVat: number } | null;
  changedSinceFiled: boolean;
  filedNote: string | null;
}

export const listObligations = () => apiClient.get<GovernmentObligation[]>('/obligations').then((r) => r.data);
export const toggleObligation = (id: string) => apiClient.patch<GovernmentObligation>(`/obligations/${id}/toggle`).then((r) => r.data);
export const getVatDeclaration = (year: number, quarter: number) =>
  apiClient.get<VatDeclaration>('/obligations/vat-declaration', { params: { year, quarter } }).then((r) => r.data);
export const markVatFiled = (year: number, quarter: number) =>
  apiClient.post<{ filedAt: string; netVat: number }>('/obligations/vat-declaration/filed', { year, quarter }).then((r) => r.data);
export const unmarkVatFiled = (year: number, quarter: number) =>
  apiClient.delete('/obligations/vat-declaration/filed', { params: { year, quarter } }).then((r) => r.data);
