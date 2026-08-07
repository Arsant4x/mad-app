import { useAuth } from '../auth/AuthContext';
import { DashboardPage } from '../pages/DashboardPage';
import { DeveloperPanelPage } from '../pages/developer/DeveloperPanelPage';
import { supportCompanyId } from '../lib/supportMode';

export function RoleAwareIndex() {
  const { user } = useAuth();
  if (user?.actorType === 'PLATFORM_ADMIN') {
    // وضع الدعم: المدير يعاين شاشات المنشأة قراءةً — الخادم يفحص الإذن
    // على كل طلب، وهذا التحويل عرضٌ فقط.
    return supportCompanyId() ? <DashboardPage /> : <DeveloperPanelPage />;
  }
  return <DashboardPage />;
}
