import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createCashDrawer, getDrawerCodeBand, listCashDrawers, updateCashDrawer, type CashDrawer } from '../../api/cashDrawers';
import type { CodeBandStatus } from '../../api/banks';
import { listBranches, type Branch } from '../../api/branches';
import { formatNumber } from '../../i18n/format';

/**
 * Cash drawers, for the owner only (the server enforces it).
 *
 * Each drawer is created together with its own ledger account, so a shortage can
 * be traced to one drawer. The merchant never types the account code: the server
 * derives it inside its reserved range.
 *
 * Refusal messages are shown exactly as the server sends them, not replaced by a
 * generic sentence: they carry the balance and the way out ("move it to another
 * drawer or to the bank"), and a refusal without a way out gets worked around.
 */
export function CashDrawersCard() {
  const { t } = useTranslation();
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState('');
  const [branchId, setBranchId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeBand, setCodeBand] = useState<CodeBandStatus | null>(null);

  async function reload() {
    setDrawers(await listCashDrawers());
    // The code range is re-read on every load so the warning follows the current state.
    setCodeBand(await getDrawerCodeBand());
  }

  useEffect(() => {
    reload().catch(() => {});
    listBranches()
      .then(setBranches)
      .catch(() => {});
  }, []);

  /** The server's message as is: it names the obstacle and the way out. */
  function serverMessage(e: unknown, fallback: string): string {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    if (Array.isArray(data?.message)) return data.message.join(' — ');
    return data?.message ?? fallback;
  }

  async function handleAdd() {
    setError(null);
    if (name.trim().length < 2) {
      setError(t('settings.cash_drawers.err_name_required'));
      return;
    }
    setBusy(true);
    try {
      await createCashDrawer({ name: name.trim(), branchId: branchId || undefined });
      setName('');
      setBranchId('');
      await reload();
    } catch (e) {
      setError(serverMessage(e, t('settings.cash_drawers.err_create')));
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
      setError(serverMessage(e, t('settings.cash_drawers.err_update')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" data-testid="cash-drawers-card">
      <h2>{t('settings.cash_drawers.title')}</h2>
      <p className="muted">{t('settings.cash_drawers.intro')}</p>

      {/* Warn before the code range runs out, not when it does. */}
      {codeBand?.warn && (
        <p className="muted" role="status" data-testid="drawer-code-band-warning">
          {codeBand.remaining > 0
            ? t('settings.cash_drawers.band_low', { remaining: codeBand.remaining, capacity: codeBand.capacity, band: codeBand.name })
            : t('settings.cash_drawers.band_full', { band: codeBand.name })}
        </p>
      )}

      {error && (
        <p className="error" role="alert" data-testid="cash-drawer-error">
          {error}
        </p>
      )}

      <div className="row">
        <label>
          {t('settings.cash_drawers.name_label')}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.cash_drawers.name_placeholder')} data-testid="cash-drawer-name" />
        </label>
        <label>
          {t('settings.cash_drawers.branch_label')}
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} data-testid="cash-drawer-branch">
            <option value="">{t('settings.cash_drawers.no_branch')}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleAdd} disabled={busy} data-testid="cash-drawer-add">
          {t('settings.cash_drawers.add')}
        </button>
      </div>

      <table data-testid="cash-drawers-table">
        <thead>
          <tr>
            <th>{t('settings.cash_drawers.col_drawer')}</th>
            <th>{t('settings.cash_drawers.col_branch')}</th>
            <th>{t('settings.cash_drawers.col_account')}</th>
            <th>{t('settings.cash_drawers.col_balance')}</th>
            <th>{t('settings.cash_drawers.col_status')}</th>
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
              <td>{formatNumber(Number(d.account.balance), { minimumFractionDigits: 2 })}</td>
              <td>{d.isActive ? t('settings.cash_drawers.active') : t('settings.cash_drawers.inactive')}</td>
              <td>
                <button type="button" onClick={() => toggleActive(d)} disabled={busy} data-testid={`cash-drawer-toggle-${d.id}`}>
                  {d.isActive ? t('settings.cash_drawers.disable') : t('settings.cash_drawers.enable')}
                </button>
              </td>
            </tr>
          ))}
          {drawers.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                {t('settings.cash_drawers.empty')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
