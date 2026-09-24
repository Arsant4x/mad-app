import { apiClient } from './client';
import type { LeaveStatus } from '@mad-app/shared/api/enums';

export interface LeaveType {
  id: string;
  name: string;
  annualDays: number;
  paid: boolean;
}

export interface LeaveTypeInput {
  name: string;
  annualDays?: number;
  paid?: boolean;
}

export type { LeaveStatus };

export interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  /** من قدّم الطلب — **بهويّة الفاعل لا الموظَّف** (`ق-٦٢١`). فارغٌ في صفوفٍ سبقت الحقل. */
  requestedById: string | null;
  requestedByName: string | null;
  decidedAt: string | null;
  decidedNote: string | null;
  /** ومن قرّر — **على الصفّ** كي تُعرَض «اعتمده فلان» بلا نبش سجلّ التدقيق. */
  decidedById: string | null;
  decidedByName: string | null;
  employee: { id: string; fullName: string };
  leaveType: { id: string; name: string; paid: boolean; annualDays: number };
}

export interface LeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface LeaveBalance {
  year: number;
  employeeId: string;
  types: {
    leaveTypeId: string;
    name: string;
    paid: boolean;
    entitlement: number;
    used: number;
    /** null = no fixed entitlement (unpaid / unlimited). */
    remaining: number | null;
  }[];
}

// Types
export const listLeaveTypes = () => apiClient.get<LeaveType[]>('/leaves/types').then((r) => r.data);
export const createLeaveType = (dto: LeaveTypeInput) => apiClient.post<LeaveType>('/leaves/types', dto).then((r) => r.data);
export const updateLeaveType = (id: string, dto: Partial<LeaveTypeInput>) => apiClient.patch<LeaveType>(`/leaves/types/${id}`, dto).then((r) => r.data);
export const deleteLeaveType = (id: string) => apiClient.delete(`/leaves/types/${id}`);

// Requests
export const listLeaveRequests = (employeeId?: string, status?: string) =>
  apiClient.get<LeaveRequest[]>('/leaves/requests', { params: { ...(employeeId ? { employeeId } : {}), ...(status ? { status } : {}) } }).then((r) => r.data);
export const createLeaveRequest = (dto: LeaveRequestInput) => apiClient.post<LeaveRequest>('/leaves/requests', dto).then((r) => r.data);
export const approveLeaveRequest = (id: string, note?: string) => apiClient.post<LeaveRequest>(`/leaves/requests/${id}/approve`, { note }).then((r) => r.data);
export const rejectLeaveRequest = (id: string, note?: string) => apiClient.post<LeaveRequest>(`/leaves/requests/${id}/reject`, { note }).then((r) => r.data);
export const deleteLeaveRequest = (id: string) => apiClient.delete(`/leaves/requests/${id}`);

// Balance
export const getLeaveBalance = (employeeId: string, year: number) =>
  apiClient.get<LeaveBalance>('/leaves/balance', { params: { employeeId, year } }).then((r) => r.data);
