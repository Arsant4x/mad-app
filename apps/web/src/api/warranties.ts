import { apiClient } from './client';
import type { CreateWarrantyDto } from '@mad-app/shared/api/requests';

/** سجل الضمان كما يعود من الخادم مع علاقاته المختصرة. */
export interface WarrantyCore {
  id: string;
  /** ما الذي يغطيه الضمان — «مصعد المبنى الرئيسي»، «مكيّفات الدور الثاني». */
  subject: string;
  propertyId: string;
  /** فارغ = يغطي العقار كله. */
  unitId: string | null;
  /** الجهة الضامنة — نص حر، فقد لا تكون هي المورّد الذي أصدر الفاتورة. */
  provider: string;
  supplierId: string | null;
  startDate: string;
  endDate: string;
  /** رقم الفاتورة أو العقد الذي نشأ عنه الضمان. */
  reference: string | null;
  terms: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  property: { id: string; name: string };
  unit: { id: string; unitNo: string } | null;
  supplier: { id: string; name: string } | null;
  _count: { claims: number };
}

/** عنصر القائمة: يضيف الخادم عدّاداً محسوباً وقت الطلب — لا يُخزَّن أبداً. */
export interface Warranty extends WarrantyCore {
  daysLeft: number;
  expired: boolean;
}

export type WarrantyInput = CreateWarrantyDto;

/** لا يقبل الخادم نقل الضمان إلى عقار آخر؛ والوحدة تقبل null لإرجاعه للعقار كله. */
export type WarrantyUpdate = Partial<Omit<WarrantyInput, 'propertyId' | 'unitId'>> & { unitId?: string | null };

export const listWarranties = (propertyId?: string) => apiClient.get<Warranty[]>('/warranties', { params: propertyId ? { propertyId } : {} }).then((r) => r.data);
export const createWarranty = (dto: WarrantyInput) => apiClient.post<WarrantyCore>('/warranties', dto).then((r) => r.data);
export const updateWarranty = (id: string, dto: WarrantyUpdate) => apiClient.patch<WarrantyCore>(`/warranties/${id}`, dto).then((r) => r.data);
export const deleteWarranty = (id: string) => apiClient.delete(`/warranties/${id}`);
