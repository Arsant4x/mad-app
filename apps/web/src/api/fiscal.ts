import { apiClient } from './client';
import type { FiscalPeriodStatus } from '@mad-app/shared/api/enums';

export type { FiscalPeriodStatus };

export interface FiscalPeriod {
  id: string;
  fiscalYearId: string;
  month: number;
  year: number;
  status: FiscalPeriodStatus;
  closedAt: string | null;
}

export interface FiscalYear {
  id: string;
  name: string;
  start: string;
  end: string;
  periods: FiscalPeriod[];
}

export interface FiscalYearInput {
  name: string;
  start: string;
  end: string;
}

export const getFiscalYears = () => apiClient.get<FiscalYear[]>('/fiscal-years').then((r) => r.data);
export const createFiscalYear = (dto: FiscalYearInput) => apiClient.post<FiscalYear>('/fiscal-years', dto).then((r) => r.data);
export const deleteFiscalYear = (id: string) => apiClient.delete(`/fiscal-years/${id}`).then(() => undefined);

export const closeFiscalPeriod = (id: string) => apiClient.patch<FiscalPeriod>(`/fiscal-years/periods/${id}/close`).then((r) => r.data);
export const reopenFiscalPeriod = (id: string) => apiClient.patch<FiscalPeriod>(`/fiscal-years/periods/${id}/reopen`).then((r) => r.data);
