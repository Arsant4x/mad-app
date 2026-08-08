import { apiClient } from './client';

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
  /** Freezes properties/contracts company-wide. */
  masterDataLocked: boolean;
}

export interface CompanyProfileInput {
  legalName: string;
  vatNumber?: string;
  crNumber?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  street?: string;
  buildingNumber?: string;
  district?: string;
  city?: string;
  postalCode?: string;
  additionalNumber?: string;
  unitNumber?: string;
  /** Key from `uploadFile`; '' clears the logo and deletes the stored object. */
  logoFileKey?: string;
  masterDataLocked?: boolean;
}

export const getCompanyProfile = () => apiClient.get<CompanyProfile>('/company-profile').then((r) => r.data);
export const updateCompanyProfile = (dto: CompanyProfileInput) => apiClient.patch<CompanyProfile>('/company-profile', dto).then((r) => r.data);
