import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { AccessDenied } from './AccessDenied';

/** Route-level counterpart to AppShell's canSee() nav check — that only
 * hides the link, it doesn't stop someone from typing the URL directly. The
 * backend's TenantGuard already rejects every API call for a disallowed
 * screen (403, no data leak either way), but without this the page still
 * mounts and just shows a confusing empty list. `screen` must match the
 * same screen ids used in AppShell.canSee() and the backend's
 * @RequiresScreen decorators (see apps/web/src/api/templates.ts's
 * ALLOWED_SCREENS for the canonical list). */
export function ScreenGuard({ screen, children }: { screen: string; children: ReactNode }) {
  const { user } = useAuth();
  const allowed = user?.allowedScreens === 'all' || user?.allowedScreens.includes(screen);
  return allowed ? <>{children}</> : <AccessDenied />;
}
