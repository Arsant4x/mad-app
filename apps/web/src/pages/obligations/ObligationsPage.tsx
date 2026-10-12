import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listObligations, toggleObligation, type GovernmentObligation } from '../../api/obligations';

// Obligation titles and authorities are stored data from the server, so these match the stored text.
const VAT_TITLE_MARKER = 'إقرار ضريبة القيمة المضافة'; // i18n-exempt: matches the stored obligation title

// ZATCA is listed first, as in the mockup.
const ENTITY_ORDER = 'هيئة الزكاة والضريبة والجمارك'; // i18n-exempt: matches the stored authority name

export function ObligationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [obligations, setObligations] = useState<GovernmentObligation[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setObligations(await listObligations());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, GovernmentObligation[]>();
    for (const o of obligations) {
      const arr = map.get(o.body) ?? [];
      arr.push(o);
      map.set(o.body, arr);
    }
    return [...map.entries()].sort(([a], [b]) => (a === ENTITY_ORDER ? -1 : b === ENTITY_ORDER ? 1 : 0));
  }, [obligations]);

  async function handleRowClick(o: GovernmentObligation) {
    if (o.title.includes(VAT_TITLE_MARKER)) {
      navigate('/obligations/vat-declaration');
      return;
    }
    await toggleObligation(o.id);
    await reload();
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('obligations.list.title')}</div>
          <div className="page-sub">{t('obligations.list.sub')}</div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="empty-state">{t('obligations.list.empty')}</div>
      ) : (
        groups.map(([entity, items]) => {
          const pending = items.filter((o) => !o.done).length;
          return (
            <div className="card" style={{ marginBottom: 14 }} key={entity}>
              <div className="card-head">
                <div className="card-title">{entity}</div>
                <span className={`badge ${pending ? 'due' : 'paid'}`}>{pending ? t('obligations.list.pending_n', { n: pending }) : t('obligations.list.all_done')}</span>
              </div>
              {items.map((o) => (
                <div
                  key={o.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--paper-line)', cursor: 'pointer' }}
                  onClick={() => handleRowClick(o)}
                >
                  <div style={{ fontSize: 12.5 }}>{o.title}</div>
                  <span className={`badge ${o.done ? 'paid' : 'due'}`}>{o.done ? t('obligations.list.done') : t('obligations.list.pending')}</span>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
