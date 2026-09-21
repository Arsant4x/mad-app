import { useEffect, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { listCustomers, type Customer } from '../../api/customers';
import { downloadReceivablesAgingCsv, getReceivablesAging, type AgingReport } from '../../api/reports';
import { fmt, today } from '../../lib/format';
import { num0 } from '../../lib/money';

/**
 * أعمار ذمم العملاء (4.6) — «مَن يدين لنا، بكم، ومنذ متى».
 *
 * المطابقة مع ميزان المراجعة **عند الطلب**: مسح الدفتر أثقل من التقرير نفسه،
 * فلا يُدفع ثمنه في كل تحميل.
 */
export function ReceivablesAgingSection() {
  const [report, setReport] = useState<AgingReport | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [asOf, setAsOf] = useState(today());
  const [branchId, setBranchId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = () => ({ asOf, branchId: branchId || undefined, customerId: customerId || undefined });

  async function load(reconcile = false) {
    setError(null);
    if (reconcile) setReconciling(true);
    try {
      setReport(await getReceivablesAging({ ...params(), ...(reconcile ? { reconcile: 'true' } : {}) }));
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر تحميل التقرير');
    } finally {
      setLoading(false);
      setReconciling(false);
    }
  }

  useEffect(() => {
    listBranches().then(setBranches).catch(() => {});
    listCustomers().then(setCustomers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOf, branchId, customerId]);

  if (loading || !report) return null;
  const t = report.totals;
  const rec = report.reconciliation;
  // ② الفرقُ يصل نصّاً بخانتين (`ق-١٢٣٥`) — يُقرأ رقماً قبل المقارنة.
  const matched = rec ? Math.abs(num0(rec.difference)) < 0.005 : false;

  return (
    <div>
      <div className="toolbar" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}>
          <label>حتى تاريخ</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>الفرع</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">كل الفروع (مجمَّع)</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>العميل</label>
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">كل العملاء</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={() => load(true)} disabled={reconciling}>
          {reconciling ? 'جارٍ المطابقة…' : '⚖ طابق مع ميزان المراجعة'}
        </button>
        <button className="btn btn-ghost" onClick={() => downloadReceivablesAgingCsv(params())}>
          ⭳ تصدير CSV
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>العميل</th>
              <th>جارٍ</th>
              <th>1-30 يوم</th>
              <th>31-60</th>
              <th>61-90</th>
              <th>أكثر من 90</th>
              <th>
                مبالغ غير مخصَّصة
                <div className="hint" style={{ fontWeight: 400 }}>
                  دفعة على الحساب أو إشعار دائن بلا فاتورة — تخفّض الذمّة بلا عمرٍ تنتمي إليه
                </div>
              </th>
              <th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">لا ذمم مستحقة حتى هذا التاريخ</div>
                </td>
              </tr>
            )}
            {report.rows.map((r) => (
              <tr key={r.customerId}>
                <td>{r.customerName}</td>
                <td className="num">{fmt(r.current)}</td>
                <td className="num">{fmt(r.d1)}</td>
                <td className="num">{fmt(r.d31)}</td>
                <td className="num" style={{ color: num0(r.d61) > 0 ? 'var(--amber)' : undefined }}>
                  {fmt(r.d61)}
                </td>
                <td className="num" style={{ color: num0(r.d90) > 0 ? 'var(--rose)' : undefined }}>
                  {fmt(r.d90)}
                </td>
                <td className="num" style={{ color: 'var(--muted)' }}>
                  {fmt(r.unapplied)}
                </td>
                <td className="num" style={{ fontWeight: 700 }}>
                  {fmt(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
          {report.rows.length > 0 && (
            <tfoot>
              <tr>
                <td style={{ fontWeight: 700 }}>الإجمالي</td>
                <td className="num">{fmt(t.current)}</td>
                <td className="num">{fmt(t.d1)}</td>
                <td className="num">{fmt(t.d31)}</td>
                <td className="num">{fmt(t.d61)}</td>
                <td className="num">{fmt(t.d90)}</td>
                <td className="num">{fmt(t.unapplied)}</td>
                <td className="num" style={{ fontWeight: 700 }}>
                  {fmt(t.total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ⭐ الصفُّ الثاني (ق-٩٢٥/④): أقساطُ إيجارٍ استُحقّت ذمّةً ولم تُقبض — قسطاً قسطاً بعمره؛
          وهي مضمَّنةٌ في شرائح عميلها أعلاه وفي المطابقة، فتقريرٌ يسمّي الحقيقةَ «فرقاً غير منسوب» أسوأُ من نقصه. */}
      <div className="card" style={{ padding: 0, marginTop: 12 }}>
        <div style={{ padding: '10px 12px', fontWeight: 600 }}>
          أقساطُ الإيجار المستحقّة غيرُ المقبوضة
          <span className="hint" style={{ fontWeight: 400, marginInlineStart: 8 }}>{report.rentNote}</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>المستأجر</th>
              <th>العقد</th>
              <th>الوحدة</th>
              <th>الاستحقاق</th>
              <th>المستحقّ</th>
              <th>المسدَّد</th>
              <th>المتبقّي</th>
              <th>الشريحة</th>
            </tr>
          </thead>
          <tbody>
            {report.rentRows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">لا أقساط إيجار مستحقّة غير مقبوضة حتى هذا التاريخ</div>
                </td>
              </tr>
            )}
            {report.rentRows.map((r) => (
              <tr key={r.installmentId}>
                <td>{r.customerName}</td>
                <td>{r.contractNo}</td>
                <td>{r.unitNo ?? '—'}</td>
                <td>{r.dueDate.slice(0, 10)}</td>
                <td className="num">{fmt(r.accrued)}</td>
                <td className="num">{fmt(r.paid)}</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(r.remaining)}</td>
                <td>{{ current: 'جارٍ', d1: '1-30', d31: '31-60', d61: '61-90', d90: 'أكثر من 90' }[r.bucket]}</td>
              </tr>
            ))}
          </tbody>
          {report.rentRows.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ fontWeight: 700 }}>مجموع ذمم الإيجار</td>
                <td className="num" style={{ fontWeight: 700 }}>{fmt(t.rent)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* سطر التسوية: يظهر عند الطلب وحده. المطابقة طمأنةٌ تُعرض كما يُعرض
          الفرق — والفرق واقعٌ يحتاج تفسيراً لا خطأٌ يُنبَّه عليه. */}
      {rec && (
        <div
          className="card"
          style={{
            marginTop: 12,
            borderInlineStart: `4px solid ${matched ? 'var(--emerald)' : 'var(--amber)'}`,
            background: matched ? undefined : 'rgba(245, 158, 11, 0.06)',
          }}
        >
          {matched ? (
            <div style={{ color: 'var(--emerald)', fontWeight: 600 }}>مطابق لميزان المراجعة ✓</div>
          ) : (
            <>
              <div style={{ fontWeight: 600 }}>
                فرق غير منسوب: <span className="num">{fmt(rec.difference)}</span>
              </div>
              <p className="hint" style={{ marginTop: 4 }}>
                قيود يدوية على حساب الذمم (1200) لا يقابلها مستند — فالتقرير يقرأ الفواتير والسندات، والدفتر يضمّ كل قيدٍ حتى اليدوي.
                {rec.accountMissing && ' (حساب الذمم 1200 غير موجود في دليل الحسابات بعد.)'}
              </p>
            </>
          )}
          <p className="hint" style={{ marginTop: 6 }}>
            رصيد الدفتر: <b className="num">{fmt(rec.ledgerBalance)}</b> · مجموع التقرير: <b className="num">{fmt(rec.reportTotal)}</b>
          </p>
        </div>
      )}
    </div>
  );
}
