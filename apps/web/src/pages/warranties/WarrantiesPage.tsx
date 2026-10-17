import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listProperties, type Property } from '../../api/properties';
import { listUnits, type Unit } from '../../api/units';
import { createWarranty, deleteWarranty, listWarranties, updateWarranty, type Warranty } from '../../api/warranties';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { dfmt, today } from '../../lib/format';
import i18n from '../../i18n';

/** Form values as typed; they become a DTO on save. */
interface WarrantyFormValues {
  propertyId: string;
  unitId: string;
  subject: string;
  provider: string;
  startDate: string;
  endDate: string;
  reference: string;
  terms: string;
  notes: string;
}

/** "Expiring soon" threshold: a month is enough to claim from the provider before cover lapses. */
const EXPIRING_SOON_DAYS = 30;

function expiryMeta(w: Warranty): { label: string; badgeClass: string } {
  if (w.expired) return { label: i18n.t('warranties.expiry.expired'), badgeClass: 'overdue' };
  if (w.daysLeft <= EXPIRING_SOON_DAYS) return { label: i18n.t('warranties.expiry.soon'), badgeClass: 'due' };
  return { label: i18n.t('warranties.expiry.active'), badgeClass: 'paid' };
}

export function WarrantiesPage() {
  const { t } = useTranslation();
  // Warranties live on the maintenance screen and follow its actions.
  const { can } = usePermissions();
  const canAdd = can('maintenance', 'add');
  const canEdit = can('maintenance', 'edit');
  const canDelete = can('maintenance', 'delete');
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; warranty: Warranty } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Warranty | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    const [ws, props, us] = await Promise.all([listWarranties(), listProperties(), listUnits()]);
    setWarranties(ws);
    setProperties(props);
    setUnits(us);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return warranties;
    return warranties.filter(
      (w) =>
        w.subject.toLowerCase().includes(q) ||
        w.provider.toLowerCase().includes(q) ||
        w.property.name.toLowerCase().includes(q) ||
        (w.unit?.unitNo.toLowerCase().includes(q) ?? false) ||
        (w.reference?.toLowerCase().includes(q) ?? false),
    );
  }, [warranties, search]);

  async function handleSave(data: WarrantyFormValues) {
    if (modal?.mode === 'edit') {
      await updateWarranty(modal.warranty.id, {
        subject: data.subject,
        unitId: data.unitId || null,
        provider: data.provider,
        startDate: data.startDate,
        endDate: data.endDate,
        // An empty string clears the field on the server, which is intended when editing.
        reference: data.reference,
        terms: data.terms,
        notes: data.notes,
      });
    } else {
      await createWarranty({
        subject: data.subject,
        propertyId: data.propertyId,
        unitId: data.unitId || undefined,
        provider: data.provider,
        startDate: data.startDate,
        endDate: data.endDate,
        reference: data.reference || undefined,
        terms: data.terms || undefined,
        notes: data.notes || undefined,
      });
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteWarranty(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      // The usual refusal: a warranty with maintenance claims cannot be deleted; the server message says so.
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? t('warranties.page.err_delete'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('warranties.page.title')}</div>
          <div className="page-sub">{t('warranties.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })} disabled={properties.length === 0}>
              {t('warranties.page.new')}
            </button>
          )}
        </div>
      </div>

      {properties.length === 0 && <div className="empty-state">{t('warranties.page.no_properties')}</div>}

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('warranties.page.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('warranties.page.col_name')}</th>
              <th>{t('warranties.page.col_provider')}</th>
              <th>{t('warranties.page.col_location')}</th>
              <th>{t('warranties.page.col_from')}</th>
              <th>{t('warranties.page.col_to')}</th>
              <th>{t('warranties.page.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('warranties.page.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((w) => {
              const meta = expiryMeta(w);
              return (
                <tr key={w.id}>
                  <td>
                    {w.subject}
                    {w.reference && <div className="hint">{t('warranties.page.reference', { ref: w.reference })}</div>}
                  </td>
                  <td>{w.provider}</td>
                  <td>
                    {w.property.name}
                    <div className="hint">{w.unit ? t('warranties.page.unit_no', { unit: w.unit.unitNo }) : t('warranties.page.whole_property')}</div>
                  </td>
                  <td className="num">{dfmt(w.startDate)}</td>
                  <td className="num">{dfmt(w.endDate)}</td>
                  <td>
                    <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                    {!w.expired && w.daysLeft <= EXPIRING_SOON_DAYS && <div className="hint">{t('warranties.page.days_left', { n: w.daysLeft })}</div>}
                  </td>
                  <td>
                    <RowMenu
                      actions={[
                        canEdit && { label: t('warranties.page.action_edit'), onClick: () => setModal({ mode: 'edit', warranty: w }) },
                        canDelete && { label: t('warranties.page.action_delete'), onClick: () => setPendingDelete(w), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <WarrantyModal
          editing={modal.mode === 'edit' ? modal.warranty : null}
          properties={properties}
          units={units}
          onCancel={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('warranties.page.delete_title')}
          body={deleteError ?? t('warranties.page.delete_body', { subject: pendingDelete.subject })}
          confirmLabel={t('warranties.page.delete_confirm')}
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

function WarrantyModal({
  editing,
  properties,
  units,
  onCancel,
  onSave,
}: {
  editing: Warranty | null;
  properties: Property[];
  units: Unit[];
  onCancel: () => void;
  onSave: (data: WarrantyFormValues) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [propertyId, setPropertyId] = useState(editing?.propertyId ?? properties[0]?.id ?? '');
  const [unitId, setUnitId] = useState(editing?.unitId ?? '');
  const [subject, setSubject] = useState(editing?.subject ?? '');
  const [provider, setProvider] = useState(editing?.provider ?? '');
  const [startDate, setStartDate] = useState(editing ? editing.startDate.slice(0, 10) : today());
  const [endDate, setEndDate] = useState(editing ? editing.endDate.slice(0, 10) : '');
  const [reference, setReference] = useState(editing?.reference ?? '');
  const [terms, setTerms] = useState(editing?.terms ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitsOfProperty = units.filter((u) => u.propertyId === propertyId);

  async function handleSubmit() {
    setError(null);
    if (!subject.trim() || !provider.trim() || !propertyId || !startDate || !endDate) {
      setError(t('warranties.modal.err_required'));
      return;
    }
    // Same check as the server, before sending: an end before the start is a typing mistake.
    if (endDate < startDate) {
      setError(t('warranties.modal.err_end_before_start'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        propertyId,
        unitId,
        subject: subject.trim(),
        provider: provider.trim(),
        startDate,
        endDate,
        reference: reference.trim(),
        terms: terms.trim(),
        notes: notes.trim(),
      });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('warranties.modal.err_save')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{editing ? t('warranties.modal.title_edit') : t('warranties.modal.title_new')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('warranties.modal.property')}</label>
            {/* The server does not move a warranty between properties, so the field is locked when editing. */}
            <select
              value={propertyId}
              disabled={!!editing}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setUnitId('');
              }}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('warranties.modal.unit')}</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">{t('warranties.modal.whole_property_option')}</option>
              {unitsOfProperty.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNo}
                </option>
              ))}
            </select>
            <p className="hint">{t('warranties.modal.unit_hint')}</p>
          </div>
        </div>
        <div className="field">
          <label>{t('warranties.modal.subject')}</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('warranties.modal.subject_placeholder')} />
        </div>
        <div className="field">
          <label>{t('warranties.modal.provider')}</label>
          <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder={t('warranties.modal.provider_placeholder')} />
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('warranties.modal.start')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('warranties.modal.end')}</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>{t('warranties.modal.reference')}</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('warranties.modal.reference_placeholder')} />
        </div>
        <div className="field">
          <label>{t('warranties.modal.terms')}</label>
          <textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder={t('warranties.modal.terms_placeholder')} />
        </div>
        <div className="field">
          <label>{t('warranties.modal.notes')}</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('warranties.modal.cancel')}
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {editing ? t('warranties.modal.save_edit') : t('warranties.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
