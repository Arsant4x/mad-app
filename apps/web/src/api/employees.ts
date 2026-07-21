import { apiClient } from './client';

export type EmployeeStatus = 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';

export interface Employee {
  id: string;
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
  jobTitle?: string;
  department?: string;
  hireDate: string;
  baseSalary?: number;
  phone?: string;
  status?: EmployeeStatus;
}

export const listEmployees = () => apiClient.get<Employee[]>('/employees').then((r) => r.data);
export const createEmployee = (dto: EmployeeInput) => apiClient.post<Employee>('/employees', dto).then((r) => r.data);
export const updateEmployee = (id: string, dto: Partial<EmployeeInput>) => apiClient.patch<Employee>(`/employees/${id}`, dto).then((r) => r.data);
export const deleteEmployee = (id: string) => apiClient.delete(`/employees/${id}`);
