import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

/** The platform admin's own shell, deliberately separate from AppShell:
 * a platform admin has no company/allowedScreens to gate a business nav
 * against, just the one developer-panel screen and a logout button. */
export function DeveloperShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  // Same as AppShell: below 860px the sidebar slides in, and without this button
  // the developer panel would be unreachable on a phone. No close-on-navigate
  // here because the shell has a single destination.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={mobileMenuOpen ? 'app-shell mobile-menu-open' : 'app-shell'}>
      <button className="mobile-menu-btn" title={t('common.menu')} aria-label={t('common.menu')} onClick={() => setMobileMenuOpen((v) => !v)}>
        {mobileMenuOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 19, height: 19 }}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 19, height: 19 }}>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>
      <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
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
