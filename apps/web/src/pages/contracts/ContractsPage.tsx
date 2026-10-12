import { AssignTaskButton } from '../../components/AssignTaskButton';
import { badgeOf } from '../../lib/statusBadge';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import i18n from '../../i18n';
import { ContractDetailModal } from './ContractDetailModal';
import { CYCLE_LABEL } from './contractMeta';
import { ContractModal } from './ContractModal';

const STATUS_META: Record<ContractStatus, { label: string; badgeClass: string }> = {
  DRAFT: { get label() { return i18n.t('contracts.page.status.draft'); }, badgeClass: 'draft' },
  // Signed and certain, unlike a draft — its term simply hasn't started.
  UPCOMING: { get label() { return i18n.t('contracts.page.status.upcoming'); }, badgeClass: 'due' },
  DUE: { get label() { return i18n.t('contracts.page.status.due'); }, badgeClass: 'paid' },
  LATE: { get label() { return i18n.t('contracts.page.status.late'); }, badgeClass: 'overdue' },
  CANCELLED: { get label() { return i18n.t('contracts.page.status.cancelled'); }, badgeClass: 'due' },
};

const PAGE_SIZE = 25;

export function ContractsPage() {
  const { t } = useTranslation();
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [units, setUnits] = useState<Unit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  // Live customers for the tenant picker: a contract links to the customer id, not a name.
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

  /** A new customer from inside the contract form, through the customers route itself, then added to the list to be picked. */
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
          <div className="page-title">{t('contracts.page.title')}</div>
          <div className="page-sub">{t('contracts.page.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setShowBuilder(true)} disabled={units.length === 0}>
            {t('contracts.page.new')}
          </button>
        </div>
      </div>

      {units.length === 0 ? (
        <div className="empty-state">{t('contracts.page.no_units')}</div>
      ) : (
        <>
          <div className="toolbar">
            <div className="search-box">
              <input placeholder={t('contracts.page.search_placeholder')} value={search} onChange={(e) => handleSearch(e.target.value)} />
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
                  <th>{t('contracts.page.col_no')}</th>
                  <th>{t('contracts.page.col_tenant')}</th>
                  <th>{t('contracts.page.col_unit')}</th>
                  <th>{t('contracts.page.col_value')}</th>
                  <th>{t('contracts.page.col_cycle')}</th>
                  <th>{t('contracts.page.col_start')}</th>
                  <th>{t('contracts.page.col_end')}</th>
                  <th>{t('contracts.page.col_status')}</th>
                  <th>{t('contracts.page.col_task')}</th>
                </tr>
              </thead>
              <tbody>
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <div className="empty-state">{t('contracts.page.empty')}</div>
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
                    {/* Assigning starts from inside the document: one component
                      * mounted in contracts, invoices and maintenance requests. Three copies
                      * would drift at the first edit. */}
                    {/* `stopPropagation` is required: the whole row opens the
                      * detail modal on click, so without it the assign button
                      * would open two windows at once. */}
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
                {t('contracts.page.prev')}
              </button>
              <span style={{ alignSelf: 'center' }}>
                {t('contracts.page.pagination', { page, pages: pageCount, total })}
              </span>
              <button className="btn btn-ghost" disabled={page >= pageCount} onClick={() => void reloadPage(page + 1, search)}>
                {t('contracts.page.next')}
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
