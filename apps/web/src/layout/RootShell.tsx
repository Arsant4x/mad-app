import { useAuth } from '../auth/AuthContext';
import { AppShell } from './AppShell';
import { DeveloperShell } from './DeveloperShell';

/** Picks the right shell for the logged-in actor — a platform admin gets the
 * developer panel's own shell instead of the business AppShell, since it has
 * no company/allowedScreens to render a business nav against. */
export function RootShell() {
  const { user } = useAuth();
  return user?.actorType === 'PLATFORM_ADMIN' ? <DeveloperShell /> : <AppShell />;
}
