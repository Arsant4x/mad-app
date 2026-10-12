import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { CompanyTemplatesTab } from './CompanyTemplatesTab';
import { FormRecordsTab } from './FormRecordsTab';
import { SigningSettingsTab } from './SigningSettingsTab';

type Tab = 'records' | 'templates' | 'signing';

const TABS: ReadonlyArray<{ id: Tab; labelKey: string }> = [
  { id: 'records', labelKey: 'forms.page.tab_records' },
  { id: 'templates', labelKey: 'forms.page.tab_templates' },
  { id: 'signing', labelKey: 'forms.page.tab_signing' },
];

/**
 * The Forms screen, a standalone screen rather than part of the contract window,
 * so the new contract screen can later add a button that opens it.
 *
 * Actor: the company owner and staff, in the company interface. Records use the
 * contracts screen actions, company templates are edited by the owner and seen by
 * others, and signing settings belong to the company owner. The tab lives in the
 * URL (?tab=) like the contract.
 */
export function FormsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: Tab = requested === 'templates' || requested === 'signing' ? requested : 'records';
  const select = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === 'records') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('forms.page.title')}</div>
          <div className="page-sub">{t('forms.page.sub')}</div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? 'tab active' : 'tab'} onClick={() => select(x.id)}>
            {t(x.labelKey)}
          </button>
        ))}
      </div>

      {tab === 'records' ? <FormRecordsTab /> : tab === 'templates' ? <CompanyTemplatesTab /> : <SigningSettingsTab />}
    </div>
  );
}
