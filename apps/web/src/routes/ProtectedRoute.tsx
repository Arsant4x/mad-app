import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SubscriptionPage } from '../pages/subscription/SubscriptionPage';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, bootLoading } = useAuth();

  if (bootLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  // STOPPED: full lock-out except self-service renewal. Land them on the renew
  // gate so they can reactivate from inside the platform (owner's rule) rather
  // than being bounced to a dead login page.
  if (user.status === 'STOPPED') return <SubscriptionPage standalone />;

  // FROZEN is the read-only grace period: let them into the app so they can view
  // and export. Writes are refused by the server, and AppShell shows a renew
  // banner. (Previously this was a dead-end "contact the operator" screen.)
  return <>{children}</>;
}
