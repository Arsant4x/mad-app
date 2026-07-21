import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

/** The platform admin's own shell — deliberately separate from AppShell:
 * a platform admin has no company/allowedScreens to gate a business nav
 * against, just the one developer-panel screen and a logout button. */
export function DeveloperShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">{t('app_name')}</div>
        <div className="current-user">
          <div>{user?.displayName}</div>
        </div>
        <nav>
          <div className="nav-item active">
            <span>{t('nav_developer_panel')}</span>
          </div>
        </nav>
        <button className="logout-btn" onClick={() => logout()}>
          {t('logout')}
        </button>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
