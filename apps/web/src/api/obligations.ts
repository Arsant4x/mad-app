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

export interface VatDeclaration {
  year: number;
  quarter: number;
  from: string;
  to: string;
  salesStandard: number;
  salesStandardVat: number;
  salesExempt: number;
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
