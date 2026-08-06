import { useEffect, useMemo, useState } from 'react';
import { createProperty, deleteProperty, listProperties, updateProperty, type Property, type PropertyInput } from '../../api/properties';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { listUnits, type Unit } from '../../api/units';
import { PropertiesMap } from './PropertiesMap';
import { PropertyModal } from './PropertyModal';
import i18n from '../../i18n';

const ACTIVITY_LABEL: Record<string, string> = {
  residential: 'سكني',
  shop: 'محل',
  showroom: 'معرض',
  office: 'مكتب',
  warehouse: 'مخزن',
  mixed: 'مختلط',
};

const OWNERSHIP_LABEL: Record<string, string> = { owned: 'ملك', leased: 'إيجار', managed: 'تشغيل' };

export function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  // Units drive the map pin colours, so they are fetched alongside.
  const [units, setUnits] = useState<Unit[]>([]);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; property: Property } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Property | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [props, us] = await Promise.all([listProperties(), listUnits()]);
    setProperties(props);
    setUnits(us);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

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

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">العقارات</div>
          <div className="page-sub">الهيكل الشجري لكافة العقارات والوحدات</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + عقار جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بالاسم أو العنوان..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="chip-group">
          <button className={view === 'list' ? 'chip active' : 'chip'} onClick={() => setView('list')}>
            قائمة
          </button>
          <button className={view === 'map' ? 'chip active' : 'chip'} onClick={() => setView('map')}>
            خريطة
          </button>
        </div>
      </div>

      {/* The map shows the *filtered* set, so searching narrows both views the
          same way rather than one silently ignoring the query. */}
      {view === 'map' && <PropertiesMap properties={rows} units={units} />}

      {view === 'list' && (
      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>اسم العقار</th>
              <th>العنوان</th>
              <th>الطوابق</th>
              <th>النشاط</th>
              <th>الملكية</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">لا توجد عقارات مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.address || '—'}</td>
                <td className="num">{p.floors}</td>
                <td>{p.activityType ? ACTIVITY_LABEL[p.activityType] : '—'}</td>
                <td>{OWNERSHIP_LABEL[p.ownership]}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', property: p }) },
                      '-',
                      { label: '🗑 حذف', onClick: () => setPendingDelete(p), danger: true },
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
          title="حذف العقار"
          body={deleteError ?? `حذف العقار "${pendingDelete.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
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
