import { apiClient } from './client';
import type { Unit } from './units';

export type ContractStatus = 'DRAFT' | 'DUE' | 'LATE' | 'CANCELLED';
export type ContractCycle = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type Furnished = 'unfurnished' | 'furnished' | 'partial';
export type InstallmentStatus = 'DUE' | 'LATE' | 'PAID' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'BANK';

export interface Installment {
  id: string;
  dueDate: string;
  amount: string;
  status: InstallmentStatus;
  notes: string | null;
}

export interface RentPayment {
  id: string;
  installmentId: string | null;
  date: string;
  amount: string;
  discount: string;
  netAmount: string;
  method: PaymentMethod;
  bankId: string | null;
  notes: string | null;
  journalEntryId: string | null;
}

export interface Contract {
  id: string;
  unitId: string;
  unit: Unit & { property: { id: string; name: string } };
  customerId: string | null;
  no: string;
  ejarNo: string | null;
  tenant: string;
  phone: string | null;
  value: string;
  cycle: ContractCycle;
  start: string;
  end: string;
  deposit: string;
  services: string | null;
  furnished: Furnished | null;
  status: ContractStatus;
  cancelDate: string | null;
  cancelReason: string | null;
  installments: Installment[];
  payments: RentPayment[];
}

export interface CreateContractInput {
  unitId: string;
  tenant: string;
  phone?: string;
  value: number;
  cycle: ContractCycle;
  start: string;
  end: string;
  deposit?: number;
  services?: string;
  furnished?: Furnished;
  ejarNo?: string;
  draft?: boolean;
}

export interface UpdateContractInput {
  tenant?: string;
  phone?: string;
  services?: string;
  furnished?: Furnished;
  ejarNo?: string;
}

export interface CancelContractInput {
  cancelDate: string;
  cancelReason: string;
  installmentDisposition: 'keep' | 'cancel';
}

export interface RecordPaymentInput {
  installmentId?: string;
  date: string;
  amount: number;
  discount?: number;
  method: PaymentMethod;
  bankId?: string;
  notes?: string;
}

export const listContracts = () => apiClient.get<Contract[]>('/contracts').then((r) => r.data);
export const getContract = (id: string) => apiClient.get<Contract>(`/contracts/${id}`).then((r) => r.data);
export const createContract = (dto: CreateContractInput) => apiClient.post<Contract>('/contracts', dto).then((r) => r.data);
export const updateContract = (id: string, dto: UpdateContractInput) => apiClient.patch<Contract>(`/contracts/${id}`, dto).then((r) => r.data);
export const cancelContract = (id: string, dto: CancelContractInput) => apiClient.post<Contract>(`/contracts/${id}/cancel`, dto).then((r) => r.data);
export const recordPayment = (contractId: string, dto: RecordPaymentInput) => apiClient.post<RentPayment>(`/contracts/${contractId}/payments`, dto).then((r) => r.data);
