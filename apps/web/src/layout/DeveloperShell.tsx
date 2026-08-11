import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

/** The platform admin's own shell — deliberately separate from AppShell:
 * a platform admin has no company/allowedScreens to gate a business nav
 * against, just the one developer-panel screen and a logout button. */
export function DeveloperShell() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  // نفس معالجة أ٣ في AppShell: تحت 860px يصير الشريط منزلقاً، وبدون هذا
  // الزر تُقفَل لوحة المطوّر على الجوال بلا مدخل — وشاشة مقفلة تُقرأ عطلاً.
  // (لا إغلاق-عند-التنقّل هنا: الشل بوجهة واحدة.)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className={mobileMenuOpen ? 'app-shell mobile-menu-open' : 'app-shell'}>
      <button className="mobile-menu-btn" title="القائمة" aria-label="القائمة" onClick={() => setMobileMenuOpen((v) => !v)}>
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
