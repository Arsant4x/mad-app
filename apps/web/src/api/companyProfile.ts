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
  /** معرّفُ النطاق الفرعيّ — `alfa` في `alfa.rikzapp.com` (ق-١٣٠٣). `null` حتى تختاره المنشأة. */
  slug: string | null;
  /** Freezes properties/contracts company-wide. */
  masterDataLocked: boolean;
  /** ⑥A2 (`ق-١٣٢٥`) — فترةُ المنشأة الضريبية: تُعلَن ولا يقلبها النظام. */
  vatPeriod: 'QUARTERLY' | 'MONTHLY';
  /** حدُّ فصل وقائع الانقطاع بالدقائق — إعدادٌ للتاجر يُعرَض مع كل واقعة (ق-٢٠١). */
  posOfflineGapMinutes: number;
}

/** عقدُ `PATCH` كاملاً (ق-١٤٦): ما لم يُرسَل يبقى كما هو، وما أُرسل `''` يُمحى — فلا حقلَ واجبٌ في كل حفظ، وبطاقةٌ تحفظ إعداداً واحداً لا تحمل الملف كله. */
export interface CompanyProfileInput {
  legalName?: string;
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
  /**
   * معرّفُ النطاق الفرعيّ (`ق-١٣٠٣`) — **يُرسَل حين يتغيّر وحده**، خلافاً لبقيّة الحقول.
   *
   * ⚠️ فـ`''` هنا **ليس محواً بل رفضٌ من الخادم**: المعرّف لا يُمحى بعد اختياره، والمنشأةُ
   * التي لم تختره بعد يُسقَط الحقلُ من طلبها أصلاً — وإرسالُه فارغاً كان سيُسقط كلَّ حفظٍ لها.
   */
  slug?: string;
  masterDataLocked?: boolean;
  vatPeriod?: 'QUARTERLY' | 'MONTHLY';
  posOfflineGapMinutes?: number;
}

export const getCompanyProfile = () => apiClient.get<CompanyProfile>('/company-profile').then((r) => r.data);
export const updateCompanyProfile = (dto: CompanyProfileInput) => apiClient.patch<CompanyProfile>('/company-profile', dto).then((r) => r.data);
