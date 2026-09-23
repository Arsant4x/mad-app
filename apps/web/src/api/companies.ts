import { apiClient } from './client';
import type { PermissionTemplate } from './templates';

export type CompanyStatus = 'ACTIVE' | 'FROZEN' | 'STOPPED' | 'CLOSED';

export interface Company {
  id: string;
  orgName: string;
  status: CompanyStatus;
  frozenAt: string | null;
  subStart: string | null;
  subEnd: string | null;
  permissionTemplateId: string;
  permissionTemplate: PermissionTemplate;
}

export interface CompanyInput {
  orgName: string;
  username: string;
  password: string;
  permissionTemplateId: string;
  subStart?: string;
  subEnd?: string;
}

export const listCompanies = () => apiClient.get<Company[]>('/companies').then((r) => r.data);
export const createCompany = (dto: CompanyInput) => apiClient.post<Company>('/companies', dto).then((r) => r.data);
export const updateCompany = (id: string, dto: Partial<CompanyInput>) => apiClient.patch<Company>(`/companies/${id}`, dto).then((r) => r.data);

/**
 * **تغييرُ الاشتراك — مسارٌ بدوره** (`ق-١٣١٧`): الاشتراكُ **مالٌ يُحصَّل ويُردّ**، فللمالية
 * وحدَها. والخادمُ يردّ `subStart`/`subEnd` على المسار العامّ بـ`400` باسمهما، **فلا
 * يُرسلان إلا من هنا ولا يُتجاهلان صامتَين**.
 */
export const updateCompanySubscription = (id: string, dto: { subStart?: string; subEnd?: string }) =>
  apiClient.patch<Company>(`/companies/${id}/subscription`, dto).then((r) => r.data);
// ⛔ لا حذفَ مباشراً من المنصّة (`ق-٥٤٨`): المسارُ الوحيد طلبُ الحذف وموافقتُه — انظر `deletionRequests.ts`.
