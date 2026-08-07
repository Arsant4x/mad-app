import { apiClient } from './client';

export type EmployeeStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface Employee {
  archived: boolean;
  id: string;
  branchId: string | null;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  hireDate: string;
  baseSalary: string;
  phone: string | null;
  status: EmployeeStatus;
}

export interface EmployeeInput {
  fullName: string;
  /** Omit for a company-wide record. */
  branchId?: string;
  jobTitle?: string;
  department?: string;
  hireDate: string;
  baseSalary?: number;
  phone?: string;
  status?: EmployeeStatus;
}

export const listEmployees = (includeArchived = false) => apiClient.get<Employee[]>('/employees', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createEmployee = (dto: EmployeeInput) => apiClient.post<Employee>('/employees', dto).then((r) => r.data);
export const updateEmployee = (id: string, dto: Partial<EmployeeInput>) => apiClient.patch<Employee>(`/employees/${id}`, dto).then((r) => r.data);
export const deleteEmployee = (id: string) => apiClient.delete(`/employees/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setEmployeeArchived = (id: string, archived: boolean) => apiClient.patch<Employee>(`/employees/${id}/archive`, { archived }).then((r) => r.data);
