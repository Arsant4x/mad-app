import { useEffect, useState } from 'react';
import { listAccounts, type Account } from '../../api/accounts';
import { listBranches, type Branch } from '../../api/branches';
import { listCustomers, type Customer } from '../../api/customers';
import { listSuppliers, type Supplier } from '../../api/suppliers';
import { downloadLedgerCsv, downloadStatementCsv, getLedger, getStatement, type LedgerReport, type StatementReport } from '../../api/reports';
import { fmt } from '../../lib/format';

/**
 * الأستاذُ العام وكشفُ الحساب (`ق-١٢٦١` ج) — **تقريرٌ واحد بمحرّكٍ واحد**: دفترُ حسابٍ أو كشفُ طرف، برصيدٍ
 * افتتاحيٍّ قبل المدى ورصيدٍ جارٍ على كلِّ سطر ومصدرِ كلِّ قيد. **الشاشةُ تقرأ ولا تحسب** (`ق-١٢٤٣`): كلُّ
 * رقمٍ يصل نصّاً من الخادم، والرصيدُ الجاري محسوبٌ هناك.
 */
type Mode = 'account' | 'customer' | 'supplier';

const SOURCE_LABEL: Record<string, string> = {
  INVOICE: 'فاتورة',
  CREDIT_NOTE: 'إشعار دائن',
  DEBIT_NOTE: 'إشعار مدين',
  INVOICE_REVERSAL: 'عكس فاتورة',
  PURCHASE: 'شراء',
  PAYMENT: 'سند قبض',
  SUPPLIER_PAYMENT: 'سند صرف',
  GOODS_RECEIPT: 'استلام',
  WRITE_OFF: 'شطب',
  STOCK_OPENING: 'افتتاح مخزون',
  STOCK_OPENING_VOID: 'إلغاء افتتاح مخزون',
  LANDED_COST: 'تكلفة محمَّلة',
  LANDED_COST_VOID: 'إلغاء تكلفة محمَّلة',
  RENT_PAYMENT: 'قبض إيجار',
  RENT_ACCRUAL: 'استحقاق إيجار',
  DEPOSIT_RECEIPT: 'تأمين',
  DEPOSIT_SETTLEMENT: 'تسوية تأمين',
  CONTRACT_SETTLEMENT: 'تسوية عقد',
  CLAIM_ISSUE: 'مطالبة',
  CLAIM_SETTLEMENT: 'تسوية مطالبة',
  KEY_MONEY: 'تقبيل',
  MAINTENANCE: 'صيانة',
  OPENING: 'رصيد افتتاحي',
  REVERSAL: 'قيد عكس',
  MANUAL: 'قيد يدوي',
  AUTO: 'قيد آلي',
};

export function LedgerSection() {
  const [mode, setMode] = useState<Mode>('account');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accountId, setAccountId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState<LedgerReport | StatementReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listAccounts().then(setAccounts).catch(() => {});
    listBranches().then(setBranches).catch(() => {});
    listCustomers().then(setCustomers).catch(() => {});
    listSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  const range = () => ({ from: from || undefined, to: to || undefined, branchId: branchId || undefined });
  const ledgerParams = () => ({ accountId, ...range() });
  const statementParams = () => ({ ...(mode === 'customer' ? { customerId: partyId } : { supplierId: partyId }), ...range() });
  const ready = mode === 'account' ? Boolean(accountId) : Boolean(partyId);

  async function load() {
    if (!ready) return;
    setError(null);
    setLoading(true);
    try {
      setReport(mode === 'account' ? await getLedger(ledgerParams()) : await getStatement(statementParams()));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر تحميل التقرير');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, accountId, partyId, branchId, from, to]);

  const sideLabel = report?.side === 'credit' ? 'دائن' : 'مدين';

  return (
    <div>
      <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-mode">الكشف</label>
          <select
            id="ledger-mode"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as Mode);
              setPartyId('');
              setReport(null);
            }}
          >
            <option value="account">دفتر حساب</option>
            <option value="customer">كشف حساب عميل</option>
            <option value="supplier">كشف حساب مورّد</option>
          </select>
        </div>
        {mode === 'account' ? (
          <div className="field" style={{ margin: 0, minWidth: 260 }}>
            <label htmlFor="ledger-account">الحساب</label>
            <select id="ledger-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— اختر حساباً —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field" style={{ margin: 0, minWidth: 260 }}>
            <label htmlFor="ledger-party">{mode === 'customer' ? 'العميل' : 'المورّد'}</label>
            <select id="ledger-party" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">— اختر —</option>
              {(mode === 'customer' ? customers : suppliers).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-from">من</label>
          <input id="ledger-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-to">إلى</label>
          <input id="ledger-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="ledger-branch">الفرع</label>
          <select id="ledger-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn secondary"
          disabled={!report}
          onClick={() => (mode === 'account' ? downloadLedgerCsv(ledgerParams()) : downloadStatementCsv(statementParams()))}
        >
          ⬇ CSV
        </button>
      </div>

      {error && <div className="error-text">{error}</div>}
      {!ready && !error && <p className="muted">اختر حساباً أو طرفاً لعرض دفتره.</p>}
      {loading && <p className="muted">جارٍ التحميل…</p>}

      {report && !loading && (
        <div>
          <div className="report-head" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong>
              {'party' in report
                ? `${report.party.kind === 'customer' ? 'العميل' : 'المورّد'}: ${report.party.name} — حساب ${report.account?.code ?? ''}`
                : `${report.account?.code ?? ''} — ${report.account?.name ?? ''}`}
            </strong>
            <span className="muted">
              الرصيد الافتتاحي ({sideLabel}): {fmt(report.opening)}
            </span>
            <span className="muted">{report.count} سطر</span>
            {report.truncated && <span className="badge overdue">⚠ عُرض أول {report.rows.length} سطر — ضيّق المدى</span>}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>القيد</th>
                <th>البيان</th>
                {'party' in report ? null : <th>المصدر</th>}
                <th>المستند</th>
                <th className="num">مدين</th>
                <th className="num">دائن</th>
                <th className="num">الرصيد ({sideLabel})</th>
              </tr>
            </thead>
            <tbody>
              <tr className="muted">
                <td colSpan={'party' in report ? 4 : 5}>رصيد افتتاحي</td>
                <td className="num">—</td>
                <td className="num">—</td>
                <td className="num">{fmt(report.opening)}</td>
              </tr>
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={'party' in report ? 7 : 8} className="muted">
                    لا حركة في المدى.
                  </td>
                </tr>
              )}
              {report.rows.map((r) => (
                <tr key={r.lineId}>
                  <td>{r.date}</td>
                  <td>{r.entryNo}</td>
                  <td>{r.memo}</td>
                  {'party' in report ? null : <td>{SOURCE_LABEL[r.source.type] ?? r.source.type}</td>}
                  <td>
                    {'party' in report ? `${SOURCE_LABEL[r.source.type] ?? r.source.type} ` : ''}
                    {r.source.no}
                  </td>
                  <td className="num">{fmt(r.debit)}</td>
                  <td className="num">{fmt(r.credit)}</td>
                  <td className="num">{fmt(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={'party' in report ? 4 : 5}>الإجمالي والرصيد الختامي</th>
                <th className="num">{fmt(report.totalDebit)}</th>
                <th className="num">{fmt(report.totalCredit)}</th>
                <th className="num">{fmt(report.closing)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
