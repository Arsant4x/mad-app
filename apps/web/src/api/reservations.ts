import { apiClient } from './client';
import type { Unit } from './units';

export type ReservationStatus = 'ACTIVE' | 'EXPIRED' | 'CONVERTED';

export interface Reservation {
  id: string;
  unitId: string;
  name: string;
  phone: string | null;
  deposit: string;
  expiryDate: string;
  status: ReservationStatus;
  createdAt: string;
  unit: Unit & { property: { name: string } };
}

export interface ReservationInput {
  unitId: string;
  name: string;
  phone?: string;
  deposit?: number;
  expiryDate: string;
}

export const listReservations = () => apiClient.get<Reservation[]>('/reservations').then((r) => r.data);
export const createReservation = (dto: ReservationInput) => apiClient.post<Reservation>('/reservations', dto).then((r) => r.data);
export const cancelReservation = (id: string) => apiClient.patch<Reservation>(`/reservations/${id}/cancel`).then((r) => r.data);
