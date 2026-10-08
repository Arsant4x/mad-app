import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import i18n from '../i18n';
import type { AccountStatus, ActorType, PlatformRole } from '@mad-app/shared/api/enums';

/** The API answers in whichever of `ar`/`en` this resolves to; anything else
 * falls back to Arabic server-side. */
function currentLanguage(): string {
  return i18n.language?.startsWith('en') ? 'en' : 'ar';
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * ⭐ **الواجهةُ على `/v1`** (`ق-١٢٨٦` · ي/⑫A1). الخادمُ يُجيب البابَ المحايد أيضاً
 * **مدّةً معلَنة**، والواجهةُ تُعلن إصدارَها كي لا تصير هي نفسُها المستهلكَ الذي يحبس
 * المحايد. والبادئةُ تُلحق **هنا في موضعٍ واحد** — فلا يُمسّ `VITE_API_URL` ولا وثائقُ
 * النشر. ومصدرُ الثابت في الخادم: `apps/api/src/common/versioning.ts`.
 */
const API_VERSION_PREFIX = 'v1';
const API_BASE = `${API_URL.replace(/\/+$/, '')}/${API_VERSION_PREFIX}`;

export type { ActorType };
/** `CLOSED` الحالةُ الرابعة (`ق-٥٤٧`): مغلقٌ بطلب التاجر — لا يعود بالدفع، بل بطلبٍ وقرار. */
export type { AccountStatus };

/** أدوارُ مدير المنصّة (`ق-١٣١٢` · ⑪A2) — مرسومةٌ من `PlatformRole` في الخادم. */
export type { PlatformRole };

export interface AuthUser {
  id: string;
  actorType: ActorType;
  username: string;
  displayName: string;
  companyId: string | null;
  status: AccountStatus;
  // ⚠️ **ولا `platformRole` هنا كذلك** (`ق-١٣١٢`): الخادمُ يرسله في استجابة الدخول،
  // **ولو عُرِّف هنا لتجمّد لحظةَ الدخول** كما يتجمّد `allowedScreens` أدناه — فدورٌ
  // يُسحب يبقى ظاهراً حتى الخروج والعودة. **وهي العلّةُ نفسُها بحقلٍ آخر.** فيُقرأ
  // **حيّاً** من `GET /auth/me` (و`whoAmI` يقرأ القاعدة) في `PlatformRoleGate` وحدَه.
  // ⚠️ **لا `allowedScreens` هنا عمداً.** الخادم ما زال يرسله في استجابة
  // الدخول، لكن تعريفه في هذا النوع يجعل الحساب به ممكناً — وقد وقع فعلاً:
  // قاعدة «كل الشاشات» كانت مكتوبة مرتين (`AppShell` و`ScreenGuard`).
  //
  // وأخطر من التكرار أنه **يُثبَّت لحظة الدخول**: تفويضٌ يُسحب بعده يبقى
  // ظاهراً حتى الخروج والعودة. فالصلاحيات تُقرأ من `usePermissions()` وحده
  // — حيّةً من `/me/permissions`. وحذفُ الحقل من النوع يجعل المخالفة **خطأ
  // ترجمة** لا مخالفةَ أسلوب.
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

export const apiClient = axios.create({ baseURL: API_BASE, withCredentials: true });

// A separate, un-intercepted client for the refresh call itself — avoids
// recursively triggering the 401 handler below.
const refreshClient = axios.create({ baseURL: API_BASE, withCredentials: true });

/**
 * ⚖️ **عميلُ صفحة النموذج العامّة** (توجيه ٢٨٧ · `/f/:token`): بلا رمزِ دخول ولا ملفّاتِ تعريف ولا تجديدِ جلسة — فالمستأجرُ لا حسابَ له،
 * و`401` هنا «ادخل بالرمز» لا «سجّل الدخول»، فلا يمرّ بمعترض التجديد ولا يُحوِّل إلى صفحة الدخول.
 */
export const publicApiClient = axios.create({ baseURL: API_BASE, withCredentials: false });
publicApiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers.set('Accept-Language', currentLanguage());
  return config;
});

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
