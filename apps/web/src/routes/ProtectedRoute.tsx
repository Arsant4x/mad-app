import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, bootLoading } = useAuth();
  const { t } = useTranslation();

  if (bootLoading) return null;
  if (!user) return <Navigate to="/login" replace />;

  if (user.status === 'FROZEN') {
    return (
      <div className="status-screen">
        <h1>{t('account_frozen_title')}</h1>
        <p>{t('account_frozen_body')}</p>
      </div>
    );
  }

  if (user.status === 'STOPPED') {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
