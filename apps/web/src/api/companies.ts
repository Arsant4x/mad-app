import { apiClient } from './client';
import type { PermissionTemplate } from './templates';
import type { CompanyStatus } from '@mad-app/shared/api/enums';
import type { CreateCompanyDto, UpdateCompanyDto, UpdateCompanySubscriptionDto } from '@mad-app/shared/api/requests';
import type { OwnerResetLinkResponse } from '@mad-app/shared/api/responses';

export type { CompanyStatus };

export interface Company {
  id: string;
  orgName: string;
  /** The owner's e-mail, where a password reset link is sent. Older companies may have none. */
  email: string | null;
  status: CompanyStatus;
  frozenAt: string | null;
  subStart: string | null;
  subEnd: string | null;
  permissionTemplateId: string;
  permissionTemplate: PermissionTemplate;
}

export type CompanyInput = CreateCompanyDto;

/**
 * What the company form hands back. Creating sends no subscription dates (a new company subscribes like
 * any merchant); editing may carry the end date for the finance route, which is called separately.
 * The start date is shown, never sent: it stays the activation day.
 */
export type CompanyFormValues = Partial<CompanyInput> & { subEnd?: string };

export const listCompanies = () => apiClient.get<Company[]>('/companies').then((r) => r.data);
export const createCompany = (dto: CompanyInput) => apiClient.post<Company>('/companies', dto).then((r) => r.data);
/**
 * The name and the template only. The subscription has its own route for the finance role, and the
 * owner's login name and password are the owner's alone (the server refuses them here with 400).
 */
export type CompanyUpdateInput = UpdateCompanyDto;

export const updateCompany = (id: string, dto: CompanyUpdateInput) => apiClient.patch<Company>(`/companies/${id}`, dto).then((r) => r.data);

/** Has a password reset link mailed to the owner; the password itself is never set from the platform. */
export const sendOwnerResetLink = (id: string) => apiClient.post<OwnerResetLinkResponse>(`/companies/${id}/password-reset`).then((r) => r.data);

/**
 * **تغييرُ الاشتراك — مسارٌ بدوره** (`ق-١٣١٧`): الاشتراكُ **مالٌ يُحصَّل ويُردّ**، فللمالية
 * وحدَها. والخادمُ يردّ `subStart`/`subEnd` على المسار العامّ بـ`400` باسمهما، **فلا
 * يُرسلان إلا من هنا ولا يُتجاهلان صامتَين**.
 */
export const updateCompanySubscription = (id: string, dto: UpdateCompanySubscriptionDto) =>
  apiClient.patch<Company>(`/companies/${id}/subscription`, dto).then((r) => r.data);
// ⛔ لا حذفَ مباشراً من المنصّة (`ق-٥٤٨`): المسارُ الوحيد طلبُ الحذف وموافقتُه — انظر `deletionRequests.ts`.
