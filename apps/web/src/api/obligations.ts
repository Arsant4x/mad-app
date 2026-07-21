import { apiClient } from './client';

export interface GovernmentObligation {
  id: string;
  body: string;
  title: string;
  done: boolean;
}

export interface VatDeclaration {
  year: number;
  quarter: number;
  from: string;
  to: string;
  salesStandard: number;
  salesStandardVat: number;
  purchasesStandard: number;
  purchasesStandardVat: number;
  purchasesExempt: number;
  totalPurchases: number;
  netVat: number;
  invoiceCount: number;
  purchaseCount: number;
}

export const listObligations = () => apiClient.get<GovernmentObligation[]>('/obligations').then((r) => r.data);
export const toggleObligation = (id: string) => apiClient.patch<GovernmentObligation>(`/obligations/${id}/toggle`).then((r) => r.data);
export const getVatDeclaration = (year: number, quarter: number) =>
  apiClient.get<VatDeclaration>('/obligations/vat-declaration', { params: { year, quarter } }).then((r) => r.data);
