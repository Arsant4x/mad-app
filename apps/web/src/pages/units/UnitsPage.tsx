import { useEffect, useMemo, useState } from 'react';
import { listProperties, type Property } from '../../api/properties';
import { cancelReservation, createReservation, listReservations, type Reservation, type ReservationInput } from '../../api/reservations';
import { createUnit, deleteUnit, listUnits, updateUnit, type Unit, type UnitInput, type UnitStatus } from '../../api/units';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { fmt } from '../../lib/format';
import { ReservationModal } from './ReservationModal';
import { UnitModal } from './UnitModal';

const STATUS_META: Record<UnitStatus, { label: string; badgeClass: string }> = {
  vacant: { label: 'شاغرة', badgeClass: 'draft' },
  rented: { label: 'مؤجَّرة', badgeClass: 'paid' },
  maintenance: { label: 'صيانة', badgeClass: 'overdue' },
  reserved: { label: 'محجوزة', badgeClass: 'due' },
};

export function UnitsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; unit: Unit } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Unit | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservingUnit, setReservingUnit] = useState<Unit | null>(null);
  const [pendingCancelReservation, setPendingCancelReservation] = useState<{ unit: Unit; reservation: Reservation } | null>(null);

  async function reload() {
    const [u, p, r] = await Promise.all([listUnits(), listProperties(), listReservations()]);
    setUnits(u);
    setProperties(p);
    setReservations(r);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

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
      const matchesQuery = !q || u.unitNo.toLowerCase().includes(q) || u.type.toLowerCase().includes(q) || propertyName.toLowerCase().includes(q);
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
      setDeleteError(message ?? 'تعذّر حذف الوحدة');
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

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الوحدات</div>
          <div className="page-sub">وحدات جميع العقارات وحالتها الحالية</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })} disabled={properties.length === 0}>
            + وحدة جديدة
          </button>
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="empty-state">أضف عقارًا أولاً قبل إنشاء وحدات</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <input placeholder="ابحث برقم الوحدة أو النوع أو العقار..." value={search} onChange={(e) => setSearch(e.target.value)} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}>
                <option value="all">كل العقارات</option>
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
                  <th>العقار</th>
                  <th>رقم الوحدة</th>
                  <th>الطابق</th>
                  <th>النوع</th>
                  <th>الإيجار الشهري</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">لا توجد وحدات مطابقة</div>
                    </td>
                  </tr>
                )}
                {rows.map((u) => {
                  const activeRsv = activeReservationByUnit.get(u.id) ?? null;
                  return (
                    <tr key={u.id}>
                      <td>{propertyById.get(u.propertyId)?.name ?? '—'}</td>
                      <td className="num">{u.unitNo}</td>
                      <td>{u.floor || '—'}</td>
                      <td>{u.type}</td>
                      <td className="num">{fmt(u.rentMonthly)}</td>
                      <td>
                        <span className={`badge ${STATUS_META[u.status].badgeClass}`}>
                          {u.status === 'rented' && u.currentTenant
                            ? `مؤجَّرة — ${u.currentTenant}`
                            : u.status === 'reserved' && activeRsv
                              ? `محجوزة حتى ${activeRsv.expiryDate.slice(0, 10)} — ${activeRsv.name}`
                              : STATUS_META[u.status].label}
                        </span>
                      </td>
                      <td>
                        <RowMenu
                          actions={[
                            { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', unit: u }) },
                            ...(u.status === 'vacant' ? [{ label: '💳 حجز بعربون', onClick: () => setReservingUnit(u) }] : []),
                            ...(activeRsv ? [{ label: '✕ إلغاء الحجز', onClick: () => setPendingCancelReservation({ unit: u, reservation: activeRsv }) }] : []),
                            { label: u.underMaintenance ? '✓ إنهاء الصيانة' : '🔧 وضع تحت الصيانة', onClick: () => toggleMaintenance(u) },
                            '-',
                            { label: '🗑 حذف', onClick: () => setPendingDelete(u), danger: true },
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
          title="حذف الوحدة"
          body={deleteError ?? `حذف الوحدة "${pendingDelete.unitNo}"؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
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
          title="إلغاء الحجز"
          body={`إلغاء حجز "${pendingCancelReservation.reservation.name}"؟`}
          confirmLabel="إلغاء الحجز"
          onCancel={() => setPendingCancelReservation(null)}
          onConfirm={confirmCancelReservation}
        />
      )}
    </div>
  );
}
