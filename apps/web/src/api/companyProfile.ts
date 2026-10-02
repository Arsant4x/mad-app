import { apiClient } from './client';
import type { UpdateCompanyProfileDto } from '@mad-app/shared/api/requests';

export interface CompanyProfile {
  id: string;
  orgName: string;
  legalName: string | null;
  vatNumber: string | null;
  crNumber: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  /** The address in the parts ZATCA's cac:PostalAddress requires — a standard
   * invoice is rejected without them. */
  street: string | null;
  buildingNumber: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  additionalNumber: string | null;
  unitNumber: string | null;
  logoFileKey: string | null;
  /** معرّفُ النطاق الفرعيّ — `alfa` في `alfa.rikzapp.com` (ق-١٣٠٣). `null` حتى تختاره المنشأة. */
  slug: string | null;
  /** Freezes properties/contracts company-wide. */
  masterDataLocked: boolean;
  /** شطبُ التالف بشخصين — مفعَّلٌ افتراضياً، وتطفئه المنشأةُ ذاتُ الشخص الواحد (`ق-١٥٨٣`). */
  writeOffRequiresTwoPersons: boolean;
  /** ⑥A2 (`ق-١٣٢٥`) — فترةُ المنشأة الضريبية: تُعلَن ولا يقلبها النظام. */
  vatPeriod: 'QUARTERLY' | 'MONTHLY';
  /** حدُّ فصل وقائع الانقطاع بالدقائق — إعدادٌ للتاجر يُعرَض مع كل واقعة (ق-٢٠١). */
  posOfflineGapMinutes: number;
}

/** عقدُ `PATCH` كاملاً (ق-١٤٦): ما لم يُرسَل يبقى كما هو، وما أُرسل `''` يُمحى — فلا حقلَ واجبٌ في كل حفظ، وبطاقةٌ تحفظ إعداداً واحداً لا تحمل الملف كله. */
export type CompanyProfileInput = UpdateCompanyProfileDto;

export const getCompanyProfile = () => apiClient.get<CompanyProfile>('/company-profile').then((r) => r.data);
export const updateCompanyProfile = (dto: CompanyProfileInput) => apiClient.patch<CompanyProfile>('/company-profile', dto).then((r) => r.data);
