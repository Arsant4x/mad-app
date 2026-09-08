import { useEffect, useState } from 'react';
import { createCashDrawer, getDrawerCodeBand, listCashDrawers, updateCashDrawer, type CashDrawer } from '../../api/cashDrawers';
import type { CodeBandStatus } from '../../api/banks';
import { listBranches, type Branch } from '../../api/branches';

/**
 * **أدراجُ الكاشير** — للمالك وحده (قاعدة الفاعل §3.5، والخادمُ يفرضها).
 *
 * كان الدرجُ ضمنياً (فرعٌ وكاشير على المناوبة) بلا كيانٍ ولا حساب، فسؤالُ «أيُّ
 * درجٍ عجز؟» بلا جوابٍ رجعيّ (`ق-٢١٨`). وهنا يُنشأ الدرجُ **وحسابُه معه** —
 * **ولا رمزَ يُدخله التاجر**: الرمزُ مشتقٌّ في الخادم (`MAX+1` داخل `1010`–`1099`).
 *
 * ⚠️ **ورسائلُ المنع تُعرض كما جاءت من الخادم** لا تُستبدل بعبارةٍ عامّة: هي التي
 * تحمل الرصيدَ والمخرج («انقلها إلى درج آخر أو إلى البنك») — و`ق-٢٦٥` تجعل ذلك
 * شرطاً، فمنعٌ بلا مخرجٍ يُلتفّ عليه.
 */
export function CashDrawersCard() {
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeBand, setCodeBand] = useState<CodeBandStatus | null>(null);

  async function reload() {
    setDrawers(await listCashDrawers());
    // سقفُ نطاق الرموز يُقرأ مع كل تحميل — فالإنذار يتبع الحالة لا لحظةَ الفتح.
    setCodeBand(await getDrawerCodeBand());
  }

  useEffect(() => {
    reload().catch(() => {});
    listBranches()
      .then(setBranches)
      .catch(() => {});
  }, []);

  /** رسالةُ الخادم كما هي — فهي التي تسمّي المانع وتدلّ على المخرج (ق-٢٦٥). */
  function serverMessage(e: unknown, fallback: string): string {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    if (Array.isArray(data?.message)) return data.message.join(' — ');
    return data?.message ?? fallback;
  }

  async function handleAdd() {
    setError(null);
    if (name.trim().length < 2) {
      setError('اسم الدرج مطلوب.');
      return;
    }
    setBusy(true);
    try {
      await createCashDrawer({ name: name.trim(), branchId: branchId || undefined });
      setName('');
      setBranchId('');
      await reload();
    } catch (e) {
      setError(serverMessage(e, 'تعذّر إنشاء الدرج.'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(drawer: CashDrawer) {
    setError(null);
    setBusy(true);
    try {
      await updateCashDrawer(drawer.id, { isActive: !drawer.isActive });
      await reload();
    } catch (e) {
      setError(serverMessage(e, 'تعذّر تعديل الدرج.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-testid="cash-drawers-card">
      <h2>أدراج الكاشير</h2>
      <p className="muted">
        لكل درجٍ حسابٌ في الدليل يُنشأ معه — فيُعرف عجزُ كل درجٍ على حدة. والمناوبات السابقة منسوبةٌ إلى «الدرج الافتراضي» لفرعها.
      </p>

      {/* إنذارُ سقف الرموز (ق-٢٩٥) — قبل الجدار لا عنده. */}
      {codeBand?.warn && (
        <p className="muted" role="status" data-testid="drawer-code-band-warning">
          {codeBand.remaining > 0
            ? `⚠ بقيت ${codeBand.remaining} من ${codeBand.capacity} خانة في نطاق رموز ${codeBand.name} — والرمز لا يعود بحذف الدرج. راجعنا قبل أن ينفد.`
            : `⛔ نفدت خانات نطاق رموز ${codeBand.name} — لا يمكن إنشاء درج جديد حتى يُوسَّع النطاق. راجعنا.`}
        </p>
      )}

      {error && (
        <p className="error" role="alert" data-testid="cash-drawer-error">
          {error}
        </p>
      )}

      <div className="row">
        <label>
          اسم الدرج
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="درج الواجهة" data-testid="cash-drawer-name" />
        </label>
        <label>
          الفرع
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="cash-drawer-branch">
            <option value="">بلا فرع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleAdd} disabled={busy} data-testid="cash-drawer-add">
          إضافة درج
        </button>
      </div>

      <table data-testid="cash-drawers-table">
        <thead>
          <tr>
            <th>الدرج</th>
            <th>الفرع</th>
            <th>الحساب</th>
            <th>الرصيد</th>
            <th>الحالة</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {drawers.map((d) => (
            <tr key={d.id} data-testid={`cash-drawer-row-${d.id}`}>
              <td>{d.name}</td>
              <td>{d.branch?.name ?? '—'}</td>
              <td>
                {d.account.code} · {d.account.name}
              </td>
              <td>{Number(d.account.balance).toLocaleString('ar-SA', { minimumFractionDigits: 2 })}</td>
              <td>{d.isActive ? 'نشِط' : 'معطَّل'}</td>
              <td>
                <button type="button" onClick={() => toggleActive(d)} disabled={busy} data-testid={`cash-drawer-toggle-${d.id}`}>
                  {d.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
              </td>
            </tr>
          ))}
          {drawers.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                لا أدراج بعد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
