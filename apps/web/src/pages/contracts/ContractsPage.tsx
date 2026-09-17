import { AssignTaskButton } from '../../components/AssignTaskButton';
import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useRef, useState } from 'react';
import { listBanks, type Bank } from '../../api/banks';
import { createCustomer, listCustomers, type Customer, type CustomerInput } from '../../api/customers';
import {
  createContract,
  getContract,
  listContracts,
  type Contract,
  type ContractListItem,
  type ContractStatus,
  type CreateContractInput,
} from '../../api/contracts';
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

const PAGE_SIZE = 25;

export function ContractsPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  // العملاءُ الأحياء لمنتقي المستأجر — العقدُ يُربط بمعرّف العميل لا باسمه (ق-١٠٢٨/①).
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showBuilder, setShowBuilder] = useState(false);
  // The list rows are slim, so opening the detail modal fetches the full
  // contract (with installments, payments, …) by id.
  const [detailContract, setDetailContract] = useState<Contract | null>(null);
  const searchDebounce = useRef<number | undefined>(undefined);

  async function reloadPage(p: number, q: string) {
    const res = await listContracts({ page: p, pageSize: PAGE_SIZE, search: q.trim() || undefined });
    setContracts(res.items);
    setTotal(res.total);
    setPage(res.page);
  }

  async function reloadAll() {
    const [, u, p, b, c] = await Promise.all([reloadPage(page, search), listUnits(), listProperties(), listBanks(), listCustomers()]);
    setUnits(u);
    setProperties(p);
    setBanks(b);
    setCustomers(c);
  }

  /** عميلٌ جديد من داخل نموذج العقد — عبر مسار العملاء نفسِه، ثم يُضاف إلى القائمة ليُختار. */
  async function handleCreateCustomer(data: CustomerInput): Promise<Customer> {
    const created = await createCustomer(data);
    setCustomers((prev) => [created, ...prev]);
    return created;
  }

  useEffect(() => {
    reloadAll().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search runs server-side now that the client only holds one page, debounced
  // so a keystroke burst becomes one request. Every new search restarts at
  // page 1 — the old page number is meaningless against a different filter.
  function handleSearch(q: string) {
    setSearch(q);
    window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => void reloadPage(1, q), 300);
  }

  async function handleSave(data: CreateContractInput) {
    await createContract(data);
    setShowBuilder(false);
    await reloadPage(page, search);
  }

  async function openDetail(id: string) {
    setDetailContract(await getContract(id));
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

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
              <input placeholder="ابحث باسم المستأجر أو رقم العقد أو الوحدة..." value={search} onChange={(e) => handleSearch(e.target.value)} />
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
                  <th>مهمة</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">لا توجد عقود مطابقة</div>
                    </td>
                  </tr>
                )}
                {contracts.map((c) => (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => void openDetail(c.id)}>
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
                      <span className={`badge ${badgeOf(STATUS_META, c.status).badgeClass}`}>{badgeOf(STATUS_META, c.status).label}</span>
                    </td>
                    {/* الإسناد **من داخل المستند** — مكوّنٌ واحد يُركَّب في
                      * العقود والفواتير والبلاغات. ثلاث نسخ تفترق عند أول
                      * تعديل: تُصلَح إحداها وتبقى اثنتان بلا شكوى. */}
                    {/* ⚠️ `stopPropagation` لازم: الصفّ كله يفتح نافذة
                      * التفاصيل بالنقر، فبدونه يفتح زرُّ الإسناد نافذتين
                      * معاً — وهو عطلٌ يظهر أول مرة يُنقر فيها. */}
                    <td onClick={(e) => e.stopPropagation()}>
                      <AssignTaskButton screen="contracts" entityId={c.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 10 }}>
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => void reloadPage(page - 1, search)}>
                → السابق
              </button>
              <span style={{ alignSelf: 'center' }}>
                صفحة {page} من {pageCount} — إجمالي العقود: {total}
              </span>
              <button className="btn btn-ghost" disabled={page >= pageCount} onClick={() => void reloadPage(page + 1, search)}>
                التالي ←
              </button>
            </div>
          )}
        </>
      )}

      {showBuilder && (
        <ContractModal units={units} properties={properties} customers={customers} onCancel={() => setShowBuilder(false)} onSave={handleSave} onCreateCustomer={handleCreateCustomer} />
      )}

      {detailContract && (
        <ContractDetailModal
          contract={detailContract}
          banks={banks}
          onClose={() => setDetailContract(null)}
          onChanged={() => void reloadPage(page, search)}
        />
      )}
    </div>
  );
}
