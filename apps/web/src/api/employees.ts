import { apiClient } from './client';
import type { EmployeeStatus } from '@mad-app/shared/api/enums';
import type { CreateEmployeeDto } from '@mad-app/shared/api/requests';
import type { EmployeeSalaryResponse } from '@mad-app/shared/api/responses';

export type { EmployeeStatus };

/** An employee as general responses carry it; the salary is not here (it has its own path). */
export interface Employee {
  archived: boolean;
  id: string;
  branchId: string | null;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  hireDate: string;
  phone: string | null;
  status: EmployeeStatus;
}

export type EmployeeSalary = EmployeeSalaryResponse;

export type EmployeeInput = CreateEmployeeDto;

/**
 * 🔴 `ق-١٣٨٤` — **الفرعُ يُحدَّد عند الإنشاء**: `UpdateEmployeeDto` لا يقبل `branchId` (و`forbidNonWhitelisted` يردّ `400`)،
 * فنوعُ التعديل يمنعه **بالبناء** — `never` لا الإغفال، كي لا يُسلَّم إليه كائنُ إنشاءٍ يحمله (وهكذا كان يُردّ تعديلُ كلِّ موظّفٍ له فرع).
 */
export type EmployeeUpdateInput = Partial<Omit<EmployeeInput, 'branchId'>> & { branchId?: never };

export const listEmployees =(includeArchived = false) => apiClient.get<Employee[]>('/employees', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createEmployee = (dto: EmployeeInput) => apiClient.post<Employee>('/employees', dto).then((r) => r.data);
export const updateEmployee = (id: string, dto: EmployeeUpdateInput) => apiClient.patch<Employee>(`/employees/${id}`, dto).then((r) => r.data);
export const deleteEmployee = (id: string) => apiClient.delete(`/employees/${id}`);

/** The base salary, for holders of the salaries action only (the server refuses everyone else). */
export const getEmployeeSalary = (id: string) => apiClient.get<EmployeeSalary>(`/employees/${id}/salary`).then((r) => r.data);
/** Sets the base salary; null clears it. */
export const setEmployeeSalary = (id: string, baseSalary: number | null) => apiClient.put<EmployeeSalary>(`/employees/${id}/salary`, { baseSalary }).then((r) => r.data);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setEmployeeArchived = (id: string, archived: boolean) => apiClient.patch<Employee>(`/employees/${id}/archive`, { archived }).then((r) => r.data);
