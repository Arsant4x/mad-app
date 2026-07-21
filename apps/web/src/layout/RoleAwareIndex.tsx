import { useAuth } from '../auth/AuthContext';
import { DashboardPage } from '../pages/DashboardPage';
import { DeveloperPanelPage } from '../pages/developer/DeveloperPanelPage';

export function RoleAwareIndex() {
  const { user } = useAuth();
  return user?.actorType === 'PLATFORM_ADMIN' ? <DeveloperPanelPage /> : <DashboardPage />;
}
