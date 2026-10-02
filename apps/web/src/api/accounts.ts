import type { MoneyText } from '../lib/money';
import { apiClient } from './client';
import type { AccountType } from '@mad-app/shared/api/enums';
import type { CreateAccountDto } from '@mad-app/shared/api/requests';

export type { AccountType };

export interface Account {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  /**
   * ⚖️ **الرصيدان رقمُ المنشأة كلِّها** (`ق-١٥٨١`): لا يرسلهما الخادمُ لموظّفٍ مقيَّدٍ بفرع، فغيابُهما غيرُ الصفر — لا يُعرضان
   * ولا يُرسل الافتتاحيُّ في التعديل (وإلا رُحّل فرقٌ إلى الصفر).
   */
  openingBalance?: string;
  /** تاريخُ الافتتاح (ق-٢٩٦) — يُشتقّ من القيد حين لم يُعلَن. */
  openingDate: string | null;
  /** `false` = مشتقٌّ من الأستاذ، `true` = أعلنه التاجر. */
  openingDateDeclared: boolean;
  balance?: string;
}

export type AccountInput = CreateAccountDto;

export const listAccounts = () => apiClient.get<Account[]>('/accounts').then((r) => r.data);

/** مجموعُ أرصدة الدليل لكل نوع — من الخادم (`GET /accounts/summary`) لا من جمع الشاشة (`ق-١٢٤٣`)؛ نصٌّ بخانتين. */
export type AccountsSummary = Record<AccountType, { total: MoneyText; count: number }>;
export const getAccountsSummary = () => apiClient.get<AccountsSummary>('/accounts/summary').then((r) => r.data);
export const createAccount = (dto: AccountInput) => apiClient.post<Account>('/accounts', dto).then((r) => r.data);
export const updateAccount = (id: string, dto: Partial<Omit<AccountInput, 'code'>>) => apiClient.patch<Account>(`/accounts/${id}`, dto).then((r) => r.data);
export const deleteAccount = (id: string) => apiClient.delete(`/accounts/${id}`);
