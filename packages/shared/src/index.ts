export type ActorType = 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';

export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'STOPPED';

/** Screen keys mirror the sidebar sections in the original mockup. */
export const SCREEN_KEYS = [
  'dashboard',
  'accounts',
  'journal',
  'invoice',
  'customers',
  'suppliers',
  'products',
  'inventory',
  'properties',
  'contracts',
  'employees',
  'banks',
  'transactions',
  'obligations',
  'scripts',
  'company',
  'settings',
  'reports',
] as const;

export type ScreenKey = (typeof SCREEN_KEYS)[number];

export interface AuthUser {
  id: string;
  actorType: ActorType;
  username: string;
  displayName: string;
  companyId: string | null;
  status: AccountStatus;
  allowedScreens: ScreenKey[] | 'all';
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
