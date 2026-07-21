import { apiClient } from './client';
import type { PermissionTemplate } from './templates';

export type CompanyUserStatus = 'ACTIVE' | 'FROZEN' | 'STOPPED';

export interface CompanyUser {
  id: string;
  name: string;
  status: CompanyUserStatus;
  permissionTemplateId: string;
  permissionTemplate: PermissionTemplate;
}

export interface CompanyUserInput {
  name: string;
  username: string;
  password: string;
  permissionTemplateId: string;
}

export const listCompanyUsers = () => apiClient.get<CompanyUser[]>('/company-users').then((r) => r.data);
export const createCompanyUser = (dto: CompanyUserInput) => apiClient.post<CompanyUser>('/company-users', dto).then((r) => r.data);
export const updateCompanyUser = (id: string, dto: Partial<CompanyUserInput> & { status?: CompanyUserStatus }) =>
  apiClient.patch<CompanyUser>(`/company-users/${id}`, dto).then((r) => r.data);
export const deleteCompanyUser = (id: string) => apiClient.delete(`/company-users/${id}`);
