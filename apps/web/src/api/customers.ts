import type { MoneyText } from '../lib/money';
import { apiClient } from './client';
import { BUYER_ID_SCHEME_VALUES, CONSENT_SOURCE_VALUES, MARKETING_CHANNEL_VALUES } from '@mad-app/shared/api/enums';
import type { BuyerIdScheme, ConsentSource, CustomerKind, MarketingChannel } from '@mad-app/shared/api/enums';
import type { CreateCustomerDto, UpdateCustomerDto } from '@mad-app/shared/api/requests';

/**
 * صفةُ المشتري (ق-١٢٦١ أ — ②A1): تقرّر نوعَ الفاتورة في الخادم (م٥٣) — مؤسّسةٌ أو اعتباريٌّ ⟵ كاملة، طبيعيٌّ ⟵ مبسّطة.
 * `LEGACY_UNDECLARED` صفٌّ سبق البناءَ ولم يُعلَن — لا يُفوتَر قبل الإعلان، ولا يُختار لصفٍّ جديد.
 */
export type { CustomerKind };
/** ما يُختار لعميلٍ جديد — القديمةُ غيرُ المعلَنة ليست خياراً. */
export type NewCustomerKind = Exclude<CustomerKind, 'LEGACY_UNDECLARED'>;
export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = {
  NATURAL: 'فرد',
  ESTABLISHMENT: 'مؤسسة فردية',
  LEGAL_PERSON: 'شخص اعتباري (شركة/جهة)',
  LEGACY_UNDECLARED: 'غير معلَن — سبق البناء',
};
/** مخطّطاتُ المعرّف البديل (BR-KSA-14) كما يقبلها الخادم — بترتيب أسبقية المعيار. */
export const BUYER_ID_SCHEMES = BUYER_ID_SCHEME_VALUES;
export type { BuyerIdScheme };
export const BUYER_ID_SCHEME_LABEL: Record<BuyerIdScheme, string> = {
  TIN: 'الرقم المميز (TIN)',
  CRN: 'السجل التجاري',
  MOM: 'رخصة الشؤون البلدية (MOMRAH)',
  MLS: 'رخصة الموارد البشرية (MHRSD)',
  '700': 'الرقم الموحد 700',
  SAG: 'ترخيص الاستثمار (MISA)',
  NAT: 'الهوية الوطنية',
  GCC: 'هوية خليجية',
  IQA: 'الإقامة',
  PAS: 'جواز السفر',
  OTH: 'معرّف آخر',
};

export interface Customer {
  archived: boolean;
  id: string;
  name: string;
  kind: CustomerKind;
  otherIdScheme: BuyerIdScheme | null;
  otherId: string | null;
  /** رمزُ البلد ISO 3166-1 alpha-2 — `SA` غياباً. */
  country: string;
  vatNumber: string | null;
  phone: string | null;
  creditLimit: string;
  /** رصيدُ العميل المستحقّ — من المصدر الواحد للتعرّض في الخادم (`ق-١٢٤٣`)؛ نصٌّ بخانتين، ولا يأتي مع ردود الإنشاء والتعديل. */
  outstanding?: MoneyText;
}

/** المفوتَرُ والمقبوضُ والرصيد — من الخادم (`GET /customers/:id/summary`)، لا من جمع الفواتير في النافذة. */
export interface CustomerSummary {
  customerId: string;
  billed: MoneyText;
  collected: MoneyText;
  outstanding: MoneyText;
}

export type CustomerInput = CreateCustomerDto;
/**
 * التعديلُ صنفٌ آخر في الخادم: يمحو المعرّفَ البديل بـ`null` حيث يُغفله الإنشاء — فلكلٍّ نوعُه لا `Partial` للإنشاء
 * (`ق-١٤٠٤` · ③: وجد التوليدُ أن الإنشاءَ بـ`''` كان يُردّ `400`).
 */
export type CustomerUpdateInput = UpdateCustomerDto;

export const listCustomers = (includeArchived = false) => apiClient.get<Customer[]>('/customers', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createCustomer = (dto: CustomerInput) => apiClient.post<Customer>('/customers', dto).then((r) => r.data);
export const updateCustomer = (id: string, dto: CustomerUpdateInput) => apiClient.patch<Customer>(`/customers/${id}`, dto).then((r) => r.data);
export const deleteCustomer = (id: string) => apiClient.delete(`/customers/${id}`);
export const getCustomerSummary = (id: string) => apiClient.get<CustomerSummary>(`/customers/${id}/summary`).then((r) => r.data);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setCustomerArchived = (id: string, archived: boolean) => apiClient.patch<Customer>(`/customers/${id}/archive`, { archived }).then((r) => r.data);

/**
 * **الموافقةُ التسويقية** (`ق-١٣٠٣` · ك/⑰A1) — الحالةُ **مشتقّةٌ في الخادم** والسجلُّ يُعرض معها:
 * اللائحةُ (م٢٨/٣) توجب الاحتفاظ بالإثبات، **وإثباتٌ لا يُقرأ ليس إثباتاً**.
 */
export const MARKETING_CHANNELS = MARKETING_CHANNEL_VALUES;
export type { MarketingChannel };

export const CONSENT_SOURCES = CONSENT_SOURCE_VALUES;
export type { ConsentSource };

export type MarketingVerdict = { allowed: true; since: string } | { allowed: false; reason: 'NEVER_GRANTED' | 'WITHDRAWN'; at?: string };

export interface MarketingConsentEvent {
  id: string;
  channel: MarketingChannel;
  granted: boolean;
  source: ConsentSource;
  note: string | null;
  at: string;
  actorType: string;
  createdAt: string;
}

export interface MarketingConsentState {
  customerId: string;
  channels: Record<MarketingChannel, MarketingVerdict>;
  events: MarketingConsentEvent[];
}

export const getMarketingConsent = (id: string) => apiClient.get<MarketingConsentState>(`/customers/${id}/marketing-consent`).then((r) => r.data);

/** **الرجوعُ واقعةٌ تالية لا تعديلٌ للأولى** — ولذلك `POST` لا `PATCH`. */
export const recordMarketingConsent = (id: string, dto: { channel: MarketingChannel; granted: boolean; source: ConsentSource; note?: string }) =>
  apiClient.post<MarketingConsentEvent>(`/customers/${id}/marketing-consent`, dto).then((r) => r.data);
