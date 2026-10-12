import { useTranslation } from 'react-i18next';

export function AccessDenied() {
  const { t } = useTranslation();
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('common.access_denied.title')}</div>
          <div className="page-sub">{t('common.access_denied.subtitle')}</div>
        </div>
      </div>
      <div className="card">
        <div className="empty-state">{t('common.access_denied.body')}</div>
      </div>
    </div>
  );
}
