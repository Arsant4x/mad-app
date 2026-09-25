import { apiClient } from './client';
import type { CodeBandStatus } from './banks';
import type { CreateCashDrawerDto } from '@mad-app/shared/api/requests';

export interface CashDrawerAccount {
  id: string;
  code: string;
  name: string;
  /** يصل نصّاً من Prisma.Decimal — يُحوَّل عند العرض لا يُفترض رقماً. */
  balance: string;
}

export interface CashDrawer {
  id: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
  branchId: string | null;
  branch: { id: string; name: string } | null;
  account: CashDrawerAccount;
}

export type CashDrawerInput = CreateCashDrawerDto;

/** حسابُ الدرج يُنشأ في الخادم مع الدرج — ولا رمزَ يُرسَل من هنا (ق-٢٥٣ · ق-٢٦١). */
export const listCashDrawers = () => apiClient.get<CashDrawer[]>('/cash-drawers').then((r) => r.data);

/** سقفُ نطاق رموز الأدراج (ق-٢٩٥) — الشكلُ نفسه الذي تعرضه البنوك. */
export const getDrawerCodeBand = () => apiClient.get<CodeBandStatus>('/cash-drawers/code-band').then((r) => r.data);
export const createCashDrawer = (dto: CashDrawerInput) => apiClient.post<CashDrawer>('/cash-drawers', dto).then((r) => r.data);
export const updateCashDrawer = (id: string, dto: { name?: string; isActive?: boolean }) =>
  apiClient.patch<CashDrawer>(`/cash-drawers/${id}`, dto).then((r) => r.data);
export const deleteCashDrawer = (id: string) => apiClient.delete(`/cash-drawers/${id}`).then(() => undefined);
