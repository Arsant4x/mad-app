import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import i18n from '../i18n';

/** The API answers in whichever of `ar`/`en` this resolves to; anything else
 * falls back to Arabic server-side. */
function currentLanguage(): string {
  return i18n.language?.startsWith('en') ? 'en' : 'ar';
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type ActorType = 'PLATFORM_ADMIN' | 'COMPANY' | 'COMPANY_USER';
export type AccountStatus = 'ACTIVE' | 'FROZEN' | 'STOPPED';

export interface AuthUser {
  id: string;
  actorType: ActorType;
  username: string;
  displayName: string;
  companyId: string | null;
  status: AccountStatus;
  allowedScreens: string[] | 'all';
}

interface RefreshResult {
  accessToken: string;
  user: AuthUser;
}

/** Access token lives in memory only (never localStorage) — a page reload
 * loses it on purpose, and AuthContext re-mints one via the httpOnly refresh
 * cookie on boot. This limits the blast radius of an XSS token theft. */
let accessToken: string | null = null;
export function setAccessToken(token: string | null) {
  accessToken = token;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

export const apiClient = axios.create({ baseURL: API_URL, withCredentials: true });

// A separate, un-intercepted client for the refresh call itself — avoids
// recursively triggering the 401 handler below.
const refreshClient = axios.create({ baseURL: API_URL, withCredentials: true });

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set('Authorization', `Bearer ${accessToken}`);
  }
  // Tells the API which language to return its error messages in. Read from
  // i18n on every request rather than captured once, so switching the language
  // takes effect immediately without a reload. Importing i18n lazily here
  // keeps this module free of a hard dependency on the i18n bundle.
  config.headers.set('Accept-Language', currentLanguage());
  // وضع الدعم الفني: اختيار المنشأة يُقرأ محلياً، والإذن الحقيقي يفحصه
  // الخادم على كل طلب (موافقة مالك + نافذة) — الرأس وحده لا يمنح شيئاً.
  const supportCompany = localStorage.getItem('support.companyId');
  if (supportCompany) config.headers.set('X-Support-Company', supportCompany);
  return config;
});

let refreshPromise: Promise<RefreshResult | null> | null = null;

/**
 * The refresh token is single-use (rotated server-side on every call), so any
 * two concurrent calls here would race: the loser presents an already-revoked
 * token and gets rejected. That race is not hypothetical — React 18
 * StrictMode double-mounts effects in dev, and AuthProvider's boot effect
 * calls this on mount, so without dedup every page load fires it twice and
 * one of them 401s. Sharing a single in-flight promise fixes both that and
 * the interceptor's own 401-triggered refresh happening at the same time.
 */
export async function refreshSession(): Promise<RefreshResult | null> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post<RefreshResult>('/auth/refresh')
      .then((res) => res.data)
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const refreshed = await refreshSession();
      if (refreshed) {
        setAccessToken(refreshed.accessToken);
        original.headers.set('Authorization', `Bearer ${refreshed.accessToken}`);
        return apiClient(original);
      }
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);
