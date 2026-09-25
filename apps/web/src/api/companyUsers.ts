import { apiClient } from './client';
import type { PermissionTemplate } from './templates';
import type { CompanyUserSettableStatus, CompanyUserStatus } from '@mad-app/shared/api/enums';
import type { CreateCompanyUserDto } from '@mad-app/shared/api/requests';

/**
 * حالةُ حساب الموظف **كما يحملها عمودُه** (`AccountStatus` — أربع قيم، ومنها `CLOSED`) — `ق-١٣٦٧`: كانت ثلاثاً تطابق حدَّ الإدخال
 * لا العمود، فقيمةٌ في القاعدة لا تعرفها الشاشة. **وما يُرسَل في التعديل** هو `CompanyUserSettableStatus` — حدُّ `UpdateCompanyUserDto`.
 */
export type { CompanyUserStatus };
/** ما يقبله الخادمُ في التعديل (`STATUSES` في `update-company-user.dto.ts`) — لا `CLOSED`. */
export type { CompanyUserSettableStatus };

export interface CompanyUser {
  id: string;
  name: string;
  status: CompanyUserStatus;
  permissionTemplateId: string;
  /** Exempts this employee from the master-data lock. */
  canEditMasterData: boolean;
  permissionTemplate: PermissionTemplate;
  /** صفوف الإسناد كمعرّفات فقط (الخادم لا يضمّن جدول الفروع المحمي بـRLS
   * هنا) — الأسماء تُحلّ من قائمة الفروع المحمَّلة أصلاً في الشاشة.
   * فارغة = يرى كل الفروع. */
  branches: { branchId: string }[];
}

export type CompanyUserInput = CreateCompanyUserDto;

export const listCompanyUsers = () => apiClient.get<CompanyUser[]>('/company-users').then((r) => r.data);
export const createCompanyUser = (dto: CompanyUserInput) => apiClient.post<CompanyUser>('/company-users', dto).then((r) => r.data);
export const updateCompanyUser = (id: string, dto: Partial<CompanyUserInput> & { status?: CompanyUserSettableStatus; canEditMasterData?: boolean }) =>
  apiClient.patch<CompanyUser>(`/company-users/${id}`, dto).then((r) => r.data);
export const deleteCompanyUser = (id: string) => apiClient.delete(`/company-users/${id}`);
