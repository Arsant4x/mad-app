import { apiClient } from './client';
import type { AttendanceStatus } from '@mad-app/shared/api/enums';

export type { AttendanceStatus };

export interface AttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  /** Wall-clock "HH:mm" strings — payroll math over minutes is a later feature. */
  checkIn: string | null;
  checkOut: string | null;
  notes: string | null;
  employee: { id: string; fullName: string };
}

export interface RecordAttendanceInput {
  employeeId: string;
  date: string;
  status?: AttendanceStatus;
  checkIn?: string;
  notes?: string;
}

export const listAttendance = (date?: string, employeeId?: string) =>
  apiClient
    .get<AttendanceRecord[]>('/attendance', { params: { ...(date ? { date } : {}), ...(employeeId ? { employeeId } : {}) } })
    .then((r) => r.data);
export const recordAttendance = (dto: RecordAttendanceInput) => apiClient.post<AttendanceRecord>('/attendance', dto).then((r) => r.data);
export const updateAttendance = (id: string, dto: { status?: AttendanceStatus; checkIn?: string; checkOut?: string; notes?: string }) =>
  apiClient.patch<AttendanceRecord>(`/attendance/${id}`, dto).then((r) => r.data);
export const deleteAttendance = (id: string) => apiClient.delete(`/attendance/${id}`);
