import { apiClient } from './client';
import type { FiscalPeriodStatus } from '@mad-app/shared/api/enums';
import type { CreateFiscalYearDto } from '@mad-app/shared/api/requests';

export type { FiscalPeriodStatus };

export interface FiscalPeriod {
  id: string;
  fiscalYearId: string;
  month: number;
  year: number;
  status: FiscalPeriodStatus;
  closedAt: string | null;
  /** ⚖️ آخرُ إعادة فتحٍ بسببها ولحظتها وفاعلها (`ق-١٥٨٣`) — فارغةٌ لفترةٍ لم تُفتح بعد. */
  reopenReason: string | null;
  reopenedAt: string | null;
  reopenedById: string | null;
}

export interface FiscalYear {
  id: string;
  name: string;
  start: string;
  end: string;
  periods: FiscalPeriod[];
}

export type FiscalYearInput = CreateFiscalYearDto;

export const getFiscalYears = () => apiClient.get<FiscalYear[]>('/fiscal-years').then((r) => r.data);
export const createFiscalYear = (dto: FiscalYearInput) => apiClient.post<FiscalYear>('/fiscal-years', dto).then((r) => r.data);
export const deleteFiscalYear = (id: string) => apiClient.delete(`/fiscal-years/${id}`).then(() => undefined);

export const closeFiscalPeriod = (id: string) => apiClient.patch<FiscalPeriod>(`/fiscal-years/periods/${id}/close`).then((r) => r.data);
/** ⚖️ بسببٍ مكتوب (`ق-١٥٨٣`) — والخادمُ يرفض الفراغ. */
export const reopenFiscalPeriod = (id: string, reason: string) => apiClient.patch<FiscalPeriod>(`/fiscal-years/periods/${id}/reopen`, { reason }).then((r) => r.data);
