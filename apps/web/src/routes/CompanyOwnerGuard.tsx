import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { AccessDenied } from './AccessDenied';

/** Route-level counterpart to AppShell's `user?.actorType === 'COMPANY'` nav
 * check for /company-users — that's not a permission-template screen, it's
 * restricted to the company owner itself (see CompanyUsersService's
 * assertIsCompanyOwner on the backend). */
export function CompanyOwnerGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.actorType === 'COMPANY' ? <>{children}</> : <AccessDenied />;
}
