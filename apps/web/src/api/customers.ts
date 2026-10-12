import type { MoneyText } from '../lib/money';
import { apiClient } from './client';
import { BUYER_ID_SCHEME_VALUES, CONSENT_SOURCE_VALUES, MARKETING_CHANNEL_VALUES } from '@mad-app/shared/api/enums';
import type { BuyerIdScheme, ConsentSource, CustomerKind, MarketingChannel } from '@mad-app/shared/api/enums';
import type { CreateCustomerDto, UpdateCustomerDto } from '@mad-app/shared/api/requests';
import { labelTable } from '../lib/labelTable';

/**
 * The buyer kind decides the invoice type on the server: an establishment or a legal person gets a
 * full tax invoice, a natural person a simplified one. `LEGACY_UNDECLARED` is a row from before the
 * field existed; it is not invoiced until declared and is never chosen for a new row.
 */
export type { CustomerKind };
/** What can be chosen for a new customer; the undeclared legacy value is not a choice. */
export type NewCustomerKind = Exclude<CustomerKind, 'LEGACY_UNDECLARED'>;
export const CUSTOMER_KIND_LABEL: Record<CustomerKind, string> = labelTable('labels.customer_kinds', ['NATURAL', 'ESTABLISHMENT', 'LEGAL_PERSON', 'LEGACY_UNDECLARED']);
/** Alternative buyer ID schemes as the server accepts them, in the standard's order of precedence. */
export const BUYER_ID_SCHEMES = BUYER_ID_SCHEME_VALUES;
export type { BuyerIdScheme };
export const BUYER_ID_SCHEME_LABEL: Record<BuyerIdScheme, string> = labelTable('labels.buyer_id_schemes', BUYER_ID_SCHEME_VALUES);

export interface Customer {
  archived: boolean;
  id: string;
  name: string;
  kind: CustomerKind;
  otherIdScheme: BuyerIdScheme | null;
  /**
   * The number is encrypted on the server: the list only says whether one is on file, and the number
   * itself comes from the detail (`getCustomer`), which the edit dialog reads.
   */
  otherIdOnFile: boolean;
  /** Only from `GET /customers/:id`; absent in the list and in create and update answers. */
  otherId?: string | null;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  vatNumber: string | null;
  phone: string | null;
  creditLimit: string;
  /** The customer's outstanding balance from the server's single exposure source; text with two decimals, absent in create and update answers. */
  outstanding?: MoneyText;
}

/** Billed, collected and balance from the server (`GET /customers/:id/summary`), not summed from invoices in the dialog. */
export interface CustomerSummary {
  customerId: string;
  billed: MoneyText;
  collected: MoneyText;
  outstanding: MoneyText;
}

export type CustomerInput = CreateCustomerDto;
/**
 * Update is a different class on the server: it clears the alternative ID with `null` where create
 * omits it, so each has its own type rather than a `Partial` of create.
 */
export type CustomerUpdateInput = UpdateCustomerDto;

export const listCustomers = (includeArchived = false) => apiClient.get<Customer[]>('/customers', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
/** Customer detail; carries the decrypted alternative ID for the edit dialog. */
export const getCustomer = (id: string) => apiClient.get<Customer>(`/customers/${id}`).then((r) => r.data);
export const createCustomer = (dto: CustomerInput) => apiClient.post<Customer>('/customers', dto).then((r) => r.data);
export const updateCustomer = (id: string, dto: CustomerUpdateInput) => apiClient.patch<Customer>(`/customers/${id}`, dto).then((r) => r.data);
export const deleteCustomer = (id: string) => apiClient.delete(`/customers/${id}`);
export const getCustomerSummary = (id: string) => apiClient.get<CustomerSummary>(`/customers/${id}/summary`).then((r) => r.data);

/** Archive or unarchive: hidden from daily lists while staying in the accounts. */
export const setCustomerArchived = (id: string, archived: boolean) => apiClient.patch<Customer>(`/customers/${id}/archive`, { archived }).then((r) => r.data);

/**
 * Marketing consent: the state is derived on the server and the history is shown with it, because the
 * regulation requires keeping the proof and a proof nobody can read is no proof.
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

/** Withdrawing is a later event, not an edit of the first one; hence `POST`, not `PATCH`. */
export const recordMarketingConsent = (id: string, dto: { channel: MarketingChannel; granted: boolean; source: ConsentSource; note?: string }) =>
  apiClient.post<MarketingConsentEvent>(`/customers/${id}/marketing-consent`, dto).then((r) => r.data);
