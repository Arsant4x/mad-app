import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createProperty, deleteProperty, listProperties, setPropertyArchived, updateProperty, type Property, type PropertyInput } from '../../api/properties';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { listUnits, type Unit } from '../../api/units';
import { PropertiesMap } from './PropertiesMap';
import { PropertyModal } from './PropertyModal';
import i18n from '../../i18n';

/** Built at render so the labels follow the current language. */
const activityLabel = (): Record<string, string> => ({
  residential: i18n.t('properties.activity.residential'),
  shop: i18n.t('properties.activity.shop'),
  showroom: i18n.t('properties.activity.showroom'),
  office: i18n.t('properties.activity.office'),
  warehouse: i18n.t('properties.activity.warehouse'),
  mixed: i18n.t('properties.activity.mixed'),
});

const ownershipLabel = (): Record<string, string> => ({
  owned: i18n.t('properties.ownership.owned'),
  leased: i18n.t('properties.ownership.leased'),
  managed: i18n.t('properties.ownership.managed'),
});

export function PropertiesPage() {
  const { t } = useTranslation();
  const [properties, setProperties] = useState<Property[]>([]);
  // Units drive the map pin colours, so they are fetched alongside.
  const [units, setUnits] = useState<Unit[]>([]);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off for day-to-day use.
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; property: Property } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Property | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [props, us] = await Promise.all([listProperties(showArchived), listUnits()]);
    setProperties(props);
    setUnits(us);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return properties;
    return properties.filter((p) => p.name.toLowerCase().includes(q) || (p.address ?? '').toLowerCase().includes(q) || (p.deedNo ?? '').toLowerCase().includes(q));
  }, [properties, search]);

  async function handleSave(data: PropertyInput) {
    if (modal?.mode === 'edit') {
      await updateProperty(modal.property.id, data);
    } else {
      await createProperty(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteProperty(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_property_delete'));
    }
  }

  if (loading) return null;

  const ACTIVITY_LABEL = activityLabel();
  const OWNERSHIP_LABEL = ownershipLabel();

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('properties.page.title')}</div>
          <div className="page-sub">{t('properties.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            {t('properties.page.new')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('properties.page.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="chip-group">
          <button className={view === 'list' ? 'chip active' : 'chip'} onClick={() => setView('list')}>
            {t('properties.page.view_list')}
          </button>
          <button className={view === 'map' ? 'chip active' : 'chip'} onClick={() => setView('map')}>
            {t('properties.page.view_map')}
          </button>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('properties.page.show_archived')}
        </button>
      </div>

      {/* The map shows the *filtered* set, so searching narrows both views the
          same way rather than one silently ignoring the query. */}
      {view === 'map' && <PropertiesMap properties={rows} units={units} />}

      {view === 'list' && (
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('properties.page.col_name')}</th>
              <th>{t('properties.page.col_address')}</th>
              <th>{t('properties.page.col_floors')}</th>
              <th>{t('properties.page.col_activity')}</th>
              <th>{t('properties.page.col_ownership')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">{t('properties.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}{p.archived && <span className="badge draft" style={{ marginInlineStart: 6 }}>{t('properties.page.archived')}</span>}</td>
                <td>{p.address || '—'}</td>
                <td className="num">{p.floors}</td>
                <td>{p.activityType ? ACTIVITY_LABEL[p.activityType] : '—'}</td>
                <td>{OWNERSHIP_LABEL[p.ownership]}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: t('properties.page.action_edit'), onClick: () => setModal({ mode: 'edit', property: p }) },
                      { label: p.archived ? t('properties.page.action_unarchive') : t('properties.page.action_archive'), onClick: () => setPropertyArchived(p.id, !p.archived).then(reload) },
                      '-',
                      { label: t('properties.page.action_delete'), onClick: () => setPendingDelete(p), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {modal && <PropertyModal editing={modal.mode === 'edit' ? modal.property : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title={t('properties.page.delete_title')}
          body={deleteError ?? t('properties.page.delete_body', { name: pendingDelete.name })}
          confirmLabel={t('properties.page.delete_confirm')}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
