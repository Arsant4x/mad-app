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
  logoFileKey: string | null;
}

export interface CompanyProfileInput {
  legalName: string;
  vatNumber?: string;
  crNumber?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}

export const getCompanyProfile = () => apiClient.get<CompanyProfile>('/company-profile').then((r) => r.data);
export const updateCompanyProfile = (dto: CompanyProfileInput) => apiClient.patch<CompanyProfile>('/company-profile', dto).then((r) => r.data);
