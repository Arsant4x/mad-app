import { useEffect, useMemo, useState } from 'react';
import { listBanks, type Bank } from '../../api/banks';
import { createContract, listContracts, type Contract, type ContractStatus, type CreateContractInput } from '../../api/contracts';
import { listProperties, type Property } from '../../api/properties';
import { listUnits, type Unit } from '../../api/units';
import { dfmt, fmt } from '../../lib/format';
import { ContractDetailModal } from './ContractDetailModal';
import { CYCLE_LABEL } from './contractMeta';
import { ContractModal } from './ContractModal';

const STATUS_META: Record<ContractStatus, { label: string; badgeClass: string }> = {
  DRAFT: { label: 'مسودة', badgeClass: 'draft' },
  // Signed and certain, unlike a draft — its term simply hasn't started.
  UPCOMING: { label: 'قادم مؤكَّد', badgeClass: 'due' },
  DUE: { label: 'سارٍ', badgeClass: 'paid' },
  LATE: { label: 'متأخر', badgeClass: 'overdue' },
  CANCELLED: { label: 'ملغى', badgeClass: 'due' },
};

export function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function reload() {
    const [c, u, p, b] = await Promise.all([listContracts(), listUnits(), listProperties(), listBanks()]);
    setContracts(c);
    setUnits(u);
    setProperties(p);
    setBanks(b);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) => c.tenant.toLowerCase().includes(q) || c.no.toLowerCase().includes(q) || c.unit.unitNo.toLowerCase().includes(q));
  }, [contracts, search]);

  async function handleSave(data: CreateContractInput) {
    await createContract(data);
    setShowBuilder(false);
    await reload();
  }

  const detailContract = contracts.find((c) => c.id === detailId) ?? null;

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">عقود الإيجار</div>
          <div className="page-sub">سجل عقود إيجار جميع الوحدات</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setShowBuilder(true)} disabled={units.length === 0}>
            + عقد جديد
          </button>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="empty-state">أضف عقارًا ووحدة أولاً قبل إنشاء عقود</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <input placeholder="ابحث باسم المستأجر أو رقم العقد أو الوحدة..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <th>رقم العقد</th>
                  <th>المستأجر</th>
                  <th>الوحدة</th>
                  <th>القيمة</th>
                  <th>الدورة</th>
                  <th>البداية</th>
                  <th>النهاية</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">لا توجد عقود مطابقة</div>
                    </td>
                  </tr>
                )}
                {rows.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(c.id)}>
                    <td className="num">{c.no}</td>
                    <td>{c.tenant}</td>
                    <td>
                      {c.unit.property.name} — {c.unit.unitNo}
                    </td>
                    <td className="num">{fmt(c.value)}</td>
                    <td>{CYCLE_LABEL[c.cycle] ?? c.cycle}</td>
                    <td className="num">{dfmt(c.start)}</td>
                    <td className="num">{dfmt(c.end)}</td>
                    <td>
                      <span className={`badge ${STATUS_META[c.status].badgeClass}`}>{STATUS_META[c.status].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showBuilder && <ContractModal units={units} properties={properties} onCancel={() => setShowBuilder(false)} onSave={handleSave} />}

      {detailContract && (
        <ContractDetailModal contract={detailContract} banks={banks} onClose={() => setDetailId(null)} onChanged={reload} />
      )}
    </div>
  );
}
