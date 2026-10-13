import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listProperties, type Property } from '../../api/properties';
import { BulkUnitsModal } from './BulkUnitsModal';
import { unitTypeLabel } from './unitTypes';
import { cancelReservation, createReservation, listReservations, type Reservation, type ReservationInput } from '../../api/reservations';
import { createUnit, deleteUnit, listUnits, setUnitArchived, updateUnit, type Unit, type UnitInput, type UnitStatus } from '../../api/units';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { ReservationModal } from './ReservationModal';
import { UnitModal } from './UnitModal';
import i18n from '../../i18n';

/** Built at render so the labels follow the current language. */
const statusMeta = (): Record<UnitStatus, { label: string; badgeClass: string }> => ({
  vacant: { label: i18n.t('units.status.vacant'), badgeClass: 'draft' },
  rented: { label: i18n.t('units.status.rented'), badgeClass: 'paid' },
  maintenance: { label: i18n.t('units.status.maintenance'), badgeClass: 'overdue' },
  reserved: { label: i18n.t('units.status.reserved'), badgeClass: 'due' },
  upcoming: { label: i18n.t('units.status.upcoming'), badgeClass: 'due' },
});

export function UnitsPage() {
  const { t } = useTranslation();
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off for day-to-day use.
  const [showArchived, setShowArchived] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; unit: Unit } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Unit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservingUnit, setReservingUnit] = useState<Unit | null>(null);
  const [pendingCancelReservation, setPendingCancelReservation] = useState<{ unit: Unit; reservation: Reservation } | null>(null);

  async function reload() {
    const [u, p, r] = await Promise.all([listUnits(showArchived), listProperties(), listReservations()]);
    setUnits(u);
    setProperties(p);
    setReservations(r);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const propertyById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const activeReservationByUnit = useMemo(
    () => new Map(reservations.filter((r) => r.status === 'ACTIVE').map((r) => [r.unitId, r])),
    [reservations],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter((u) => {
      const matchesProperty = propertyFilter === 'all' || u.propertyId === propertyFilter;
      const propertyName = propertyById.get(u.propertyId)?.name ?? '';
      const matchesQuery = !q || u.unitNo.toLowerCase().includes(q) || u.type.toLowerCase().includes(q) || unitTypeLabel(u.type).toLowerCase().includes(q) || propertyName.toLowerCase().includes(q);
      return matchesProperty && matchesQuery;
    });
  }, [units, search, propertyFilter, propertyById]);

  async function handleSave(data: UnitInput) {
    if (modal?.mode === 'edit') {
      await updateUnit(modal.unit.id, data);
    } else {
      await createUnit(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteUnit(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_unit_delete'));
    }
  }

  async function toggleMaintenance(unit: Unit) {
    await updateUnit(unit.id, { underMaintenance: !unit.underMaintenance });
    await reload();
  }

  async function handleReserve(data: Omit<ReservationInput, 'unitId'>) {
    if (!reservingUnit) return;
    await createReservation({ unitId: reservingUnit.id, ...data });
    setReservingUnit(null);
    await reload();
  }

  async function confirmCancelReservation() {
    if (!pendingCancelReservation) return;
    await cancelReservation(pendingCancelReservation.reservation.id);
    setPendingCancelReservation(null);
    await reload();
  }

  if (loading) return null;

  const STATUS_META = statusMeta();

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('units.page.title')}</div>
          <div className="page-sub">{t('units.page.sub')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => setBulkOpen(true)} disabled={properties.length === 0}>
            {t('units.page.bulk')}
          </button>
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })} disabled={properties.length === 0}>
            {t('units.page.new')}
          </button>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="empty-state">{t('units.page.no_properties')}</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <input placeholder={t('units.page.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </div>
            <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
              {t('units.page.show_archived')}
            </button>
            <div className="field" style={{ marginBottom: 0 }}>
              <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
                <option value="all">{t('units.page.all_properties')}</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>{t('units.page.col_property')}</th>
                  <th>{t('units.page.col_unit_no')}</th>
                  <th>{t('units.page.col_floor')}</th>
                  <th>{t('units.page.col_type')}</th>
                  <th>{t('units.page.col_rent')}</th>
                  <th>{t('units.page.col_status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">{t('units.page.empty')}</div>
                    </td>
                  </tr>
                )}
                {rows.map((u) => {
                  const activeRsv = activeReservationByUnit.get(u.id) ?? null;
                  return (
                    <tr key={u.id}>
                      <td>{propertyById.get(u.propertyId)?.name ?? '—'}</td>
                      <td className="num">{u.unitNo}{u.archived && <span className="badge draft" style={{ marginInlineStart: 6 }}>{t('units.page.archived')}</span>}</td>
                      <td>{u.floor || '—'}</td>
                      <td>{unitTypeLabel(u.type)}</td>
                      <td className="num">{fmt(u.rentMonthly)}</td>
                      <td>
                        <span className={`badge ${badgeOf(STATUS_META, u.status).badgeClass}`}>
                          {u.status === 'rented' && u.currentTenant
                            ? t('units.page.rented_to', { tenant: u.currentTenant })
                            : u.status === 'upcoming' && u.upcomingTenant
                              ? t('units.page.upcoming_to', { tenant: u.upcomingTenant })
                            : u.status === 'reserved' && activeRsv
                              ? t('units.page.reserved_until', { date: activeRsv.expiryDate.slice(0, 10), name: activeRsv.name })
                              : badgeOf(STATUS_META, u.status).label}
                        </span>
                      </td>
                      <td>
                        <RowMenu
                          actions={[
                            { label: t('units.page.action_edit'), onClick: () => setModal({ mode: 'edit', unit: u }) },
                            ...(u.status === 'vacant' ? [{ label: t('units.page.action_reserve'), onClick: () => setReservingUnit(u) }] : []),
                            ...(activeRsv ? [{ label: t('units.page.action_cancel_reservation'), onClick: () => setPendingCancelReservation({ unit: u, reservation: activeRsv }) }] : []),
                            { label: u.underMaintenance ? t('units.page.action_end_maintenance') : t('units.page.action_start_maintenance'), onClick: () => toggleMaintenance(u) },
                            { label: u.archived ? t('units.page.action_unarchive') : t('units.page.action_archive'), onClick: () => setUnitArchived(u.id, !u.archived).then(reload) },
                            '-',
                            { label: t('units.page.action_delete'), onClick: () => setPendingDelete(u), danger: true },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {bulkOpen && (
        <BulkUnitsModal
          properties={properties}
          onCancel={() => setBulkOpen(false)}
          onDone={async () => {
            setBulkOpen(false);
            await reload();
          }}
        />
      )}

      {modal && (
        <UnitModal
          properties={properties}
          editing={modal.mode === 'edit' ? modal.unit : null}
          onCancel={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={t('units.page.delete_title')}
          body={deleteError ?? t('units.page.delete_body', { unit: pendingDelete.unitNo })}
          confirmLabel={t('units.page.delete_confirm')}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}

      {reservingUnit && (
        <ReservationModal
          unitLabel={`${propertyById.get(reservingUnit.propertyId)?.name ?? '—'} — ${reservingUnit.unitNo}`}
          onCancel={() => setReservingUnit(null)}
          onSave={handleReserve}
        />
      )}

      {pendingCancelReservation && (
        <ConfirmModal
          title={t('units.page.cancel_reservation_title')}
          body={t('units.page.cancel_reservation_body', { name: pendingCancelReservation.reservation.name })}
          confirmLabel={t('units.page.cancel_reservation_confirm')}
          onCancel={() => setPendingCancelReservation(null)}
          onConfirm={confirmCancelReservation}
        />
      )}
    </div>
  );
}
