import { apiClient } from './client';
import type { EmployeeStatus } from '@mad-app/shared/api/enums';

export type { EmployeeStatus };

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

/**
 * 🔴 `ق-١٣٨٤` — **الفرعُ يُحدَّد عند الإنشاء**: `UpdateEmployeeDto` لا يقبل `branchId` (و`forbidNonWhitelisted` يردّ `400`)،
 * فنوعُ التعديل يمنعه **بالبناء** — `never` لا الإغفال، كي لا يُسلَّم إليه كائنُ إنشاءٍ يحمله (وهكذا كان يُردّ تعديلُ كلِّ موظّفٍ له فرع).
 */
export type EmployeeUpdateInput = Partial<Omit<EmployeeInput, 'branchId'>> & { branchId?: never };

export const listEmployees =(includeArchived = false) => apiClient.get<Employee[]>('/employees', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createEmployee = (dto: EmployeeInput) => apiClient.post<Employee>('/employees', dto).then((r) => r.data);
export const updateEmployee = (id: string, dto: EmployeeUpdateInput) => apiClient.patch<Employee>(`/employees/${id}`, dto).then((r) => r.data);
export const deleteEmployee = (id: string) => apiClient.delete(`/employees/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setEmployeeArchived = (id: string, archived: boolean) => apiClient.patch<Employee>(`/employees/${id}/archive`, { archived }).then((r) => r.data);
