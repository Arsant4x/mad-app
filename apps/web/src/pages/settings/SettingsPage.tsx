import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrencies } from '../../components/currency/CurrencyContext';
import { CurrencySign } from '../../components/currency/Money';
import {
  createActivity,
  deleteActivity,
  listActivities,
  updateActivity,
  type Activity,
  SECTORS,
  SECTOR_LABELS,
  type Sector,
} from '../../api/activities';
import { PrimaryActivityModal } from './PrimaryActivityModal';
import {
  createCurrency,
  deleteCurrency,
  listCurrencies,
  listExchangeRates,
  updateCurrency,
  upsertExchangeRate,
  type Currency,
  type ExchangeRate,
} from '../../api/currencies';
import { ConfirmModal } from '../../components/ConfirmModal';
import { useAuth } from '../../auth/AuthContext';
import { ApiKeysCard } from './ApiKeysCard';
import { MfaCard } from '../../components/MfaCard';
import { CashDrawersCard } from './CashDrawersCard';
import { IntegrationsCard } from './IntegrationsCard';
import { SupportAccessCard } from './SupportAccessCard';
import i18n from '../../i18n';

/**
 * The two registries that sit underneath everything else: what lines of
 * business the company runs, and what currencies it trades in.
 *
 * Both are read-only for an employee — the server enforces that, and the
 * buttons are hidden here so the refusal isn't a surprise.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';

  const [activities, setActivities] = useState<Activity[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activityName, setActivityName] = useState('');
  const [activityType, setActivityType] = useState('');
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [pendingActivityDelete, setPendingActivityDelete] = useState<Activity | null>(null);
  const [activitySector, setActivitySector] = useState<Sector | ''>('');
  /** The activity proposed as primary; 'CLEAR' means undo the filtering. */
  const [primaryCandidate, setPrimaryCandidate] = useState<Activity | 'CLEAR' | null>(null);

  const [code, setCode] = useState('');
  const [currencyName, setCurrencyName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [rate, setRate] = useState('');
  const [pendingCurrencyDelete, setPendingCurrencyDelete] = useState<Currency | null>(null);

  const [rateFrom, setRateFrom] = useState('');
  const [rateTo, setRateTo] = useState('SAR');
  const [rateValue, setRateValue] = useState('');
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));

  const shellCurrencies = useCurrencies();

  async function reload() {
    const [a, c, r] = await Promise.all([listActivities(), listCurrencies(), listExchangeRates()]);
    setActivities(a);
    setCurrencies(c);
    setRates(r);
    shellCurrencies.reload();
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  function serverMessage(e: unknown, fallback: string): string {
    const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
    if (Array.isArray(data?.message)) return data.message.join(' — ');
    return data?.message ?? fallback;
  }

  async function saveActivity() {
    setError(null);
    if (!activityName.trim()) {
      setError(i18n.t('err_activity_name_required'));
      return;
    }
    try {
      const dto = { name: activityName.trim(), activityType: activityType.trim() || undefined, sector: activitySector || undefined };
      if (editingActivity) await updateActivity(editingActivity.id, dto);
      else await createActivity(dto);
      setActivityName('');
      setActivityType('');
      setActivitySector('');
      setEditingActivity(null);
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_activity_save')));
    }
  }

  /**
   * Disable, not delete: the screens disappear and the data stays.
   *
   * The activity stays in the table once disabled: keeping it visible is what
   * makes enabling it again possible, and hiding it would make it look deleted.
   */
  async function toggleActivity(a: Activity) {
    setError(null);
    try {
      await updateActivity(a.id, { disabled: a.disabledAt === null });
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_activity_save')));
    }
  }

  async function confirmActivityDelete() {
    if (!pendingActivityDelete) return;
    setError(null);
    try {
      await deleteActivity(pendingActivityDelete.id);
      setPendingActivityDelete(null);
      await reload();
    } catch (e) {
      setPendingActivityDelete(null);
      setError(serverMessage(e, i18n.t('err_activity_delete')));
    }
  }

  async function saveCurrency() {
    setError(null);
    if (code.trim().length !== 3 || !currencyName.trim()) {
      setError(i18n.t('err_currency_fields'));
      return;
    }
    try {
      await createCurrency({
        code: code.trim(),
        name: currencyName.trim(),
        symbol: symbol.trim() || undefined,
        rate: rate ? Number(rate) : undefined,
      });
      setCode('');
      setCurrencyName('');
      setSymbol('');
      setRate('');
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_currency_save')));
    }
  }

  async function changeRate(currency: Currency, value: string) {
    setError(null);
    try {
      await updateCurrency(currency.id, { rate: Number(value) });
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_currency_save')));
    }
  }

  async function confirmCurrencyDelete() {
    if (!pendingCurrencyDelete) return;
    setError(null);
    try {
      await deleteCurrency(pendingCurrencyDelete.id);
      setPendingCurrencyDelete(null);
      await reload();
    } catch (e) {
      setPendingCurrencyDelete(null);
      setError(serverMessage(e, i18n.t('err_currency_delete')));
    }
  }

  async function saveExchangeRate() {
    setError(null);
    if (rateFrom.length !== 3 || rateTo.length !== 3 || !rateValue || !rateDate) {
      setError(i18n.t('err_rate_fields'));
      return;
    }
    try {
      await upsertExchangeRate({ fromCode: rateFrom, toCode: rateTo, rate: Number(rateValue), date: rateDate });
      setRateValue('');
      await reload();
    } catch (e) {
      setError(serverMessage(e, i18n.t('err_rate_save')));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('settings.page.title')}</div>
          <div className="page-sub">{t('settings.page.subtitle')}</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="card-head">
          <div className="card-title">{t('settings.page.activities_title')}</div>
          {/* Immediate undo, always visible rather than tucked into a menu: whoever
            * hid a screen by mistake needs the way back now, not after a search. */}
          {isOwner && (
            <button className="btn btn-ghost btn-sm" data-testid="clear-primary" onClick={() => setPrimaryCandidate('CLEAR')}>
              {t('settings.page.clear_primary')}
            </button>
          )}
        </div>

        {isOwner && (
          <div className="two-col" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>{t('settings.page.activity_name')}</label>
              <input value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder={t('settings.page.activity_name_placeholder')} />
            </div>
            <div className="field">
              <label>{t('settings.page.activity_type')}</label>
              <input value={activityType} onChange={(e) => setActivityType(e.target.value)} placeholder={t('settings.page.activity_type_placeholder')} />
            </div>
            <div className="field">
              <label>{t('settings.page.sector')}</label>
              {/* The list comes from `SECTORS`, not written here. */}
              <select value={activitySector} onChange={(e) => setActivitySector(e.target.value as Sector | '')} data-testid="sector-select">
                <option value="">{t('settings.page.no_sector')}</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                ))}
              </select>
              <p className="hint">{t('settings.page.sector_hint')}</p>
            </div>
          </div>
        )}
        {isOwner && (
          <div style={{ marginBottom: 14 }}>
            <button className="btn btn-primary" onClick={saveActivity}>
              {editingActivity ? t('settings.page.save_edit') : t('settings.page.add_activity')}
            </button>
            {editingActivity && (
              <button
                className="btn btn-ghost"
                style={{ marginInlineStart: 8 }}
                onClick={() => {
                  setEditingActivity(null);
                  setActivityName('');
                  setActivityType('');
                }}
              >
                {t('settings.page.cancel')}
              </button>
            )}
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>{t('settings.page.col_activity')}</th>
              <th>{t('settings.page.col_type')}</th>
              <th>{t('settings.page.col_sector')}</th>
              <th>{t('settings.page.col_branches')}</th>
              <th>{t('settings.page.col_products')}</th>
              {isOwner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} data-testid={`activity-${a.id}`} data-disabled={a.disabledAt !== null}>
                <td>
                  {a.name}
                  {a.disabledAt && <span className="badge sealed" style={{ marginInlineStart: 6 }}>{t('settings.page.disabled')}</span>}
                </td>
                <td>{a.activityType ?? '—'}</td>
                <td data-testid={`sector-${a.id}`}>
                  {/* Three states, not two: confirmed, suggested awaiting confirmation,
                    * and none. The second needs the owner's action, and merging it
                    * with the first would make them think they confirmed it. */}
                  {a.sector ? (
                    SECTOR_LABELS[a.sector]
                  ) : a.sectorSuggested ? (
                    <span className="hint" data-testid={`suggested-${a.id}`}>
                      {t('settings.page.suggested', { sector: SECTOR_LABELS[a.sectorSuggested] })}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{a.branchCount}</td>
                <td>{a.productCount}</td>
                {isOwner && (
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingActivity(a);
                        setActivityName(a.name);
                        setActivityType(a.activityType ?? '');
                        setActivitySector(a.sector ?? a.sectorSuggested ?? '');
                      }}
                    >
                      {t('settings.page.edit')}
                    </button>
                    {/* Disable, not delete: the data stays. */}
                    <button
                      className="btn btn-ghost btn-sm"
                      data-testid={`toggle-${a.id}`}
                      onClick={() => void toggleActivity(a)}
                    >
                      {a.disabledAt ? t('settings.page.enable') : t('settings.page.disable')}
                    </button>
                    {a.sector && !a.disabledAt && (
                      <button className="btn btn-ghost btn-sm" data-testid={`make-primary-${a.id}`} onClick={() => setPrimaryCandidate(a)}>
                        {t('settings.page.make_primary')}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setPendingActivityDelete(a)}>
                      {t('settings.page.delete')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">{t('settings.page.currencies_title')}</div>
        </div>

        {isOwner && (
          <>
            <div className="two-col">
              <div className="field">
                <label>{t('settings.page.currency_code')}</label>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={3} placeholder={t('settings.page.currency_code_placeholder')} />
              </div>
              <div className="field">
                <label>{t('settings.page.currency_name')}</label>
                <input value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} placeholder={t('settings.page.currency_name_placeholder')} />
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label>{t('settings.page.currency_symbol')}</label>
                <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" />
              </div>
              <div className="field">
                <label>{t('settings.page.currency_rate')}</label>
                <input type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="3.75" />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={saveCurrency}>
              {t('settings.page.add_currency')}
            </button>
          </>
        )}

        <table>
          <thead>
            <tr>
              <th>{t('settings.page.col_code')}</th>
              <th>{t('settings.page.col_name')}</th>
              <th>{t('settings.page.col_rate')}</th>
              {isOwner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.code} {c.isBase && <span className="badge paid">{t('settings.page.base')}</span>}
                </td>
                <td>
                  {c.name}{' '}
                  {c.symbol ? (
                    <>
                      (<CurrencySign symbol={c.symbol} code={c.code} />)
                    </>
                  ) : null}
                </td>
                <td>
                  {isOwner && !c.isBase ? (
                    <input
                      type="number"
                      step="0.000001"
                      defaultValue={Number(c.rate)}
                      style={{ maxWidth: 120 }}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== Number(c.rate)) changeRate(c, e.target.value);
                      }}
                    />
                  ) : (
                    Number(c.rate)
                  )}
                </td>
                {isOwner && (
                  <td>
                    {/* The base currency is the unit the ledger is kept in — it
                        can be neither repriced nor removed. */}
                    {!c.isBase && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setPendingCurrencyDelete(c)}>
                        {t('settings.page.delete')}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">{t('settings.page.rates_title')}</div>
        </div>
        <p className="hint">{t('settings.page.rates_hint')}</p>

        {isOwner && (
          <>
            <div className="two-col">
              <div className="field">
                <label>{t('settings.page.rate_from')}</label>
                <select value={rateFrom} onChange={(e) => setRateFrom(e.target.value)}>
                  <option value="">{t('settings.page.choose')}</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('settings.page.rate_to')}</label>
                <select value={rateTo} onChange={(e) => setRateTo(e.target.value)}>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label>{t('settings.page.rate_value')}</label>
                <input type="number" step="0.000001" value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
              </div>
              <div className="field">
                <label>{t('settings.page.rate_date')}</label>
                <input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={saveExchangeRate}>
              {t('settings.page.save_rate')}
            </button>
          </>
        )}

        {rates.length === 0 ? (
          <div className="empty-state">{t('settings.page.rates_empty')}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('settings.page.rate_date')}</th>
                <th>{t('settings.page.col_from')}</th>
                <th>{t('settings.page.col_to')}</th>
                <th>{t('settings.page.rate_value')}</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td>{r.date.slice(0, 10)}</td>
                  <td>{r.fromCode}</td>
                  <td>{r.toCode}</td>
                  <td>{Number(r.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {primaryCandidate && (
        <PrimaryActivityModal
          activity={primaryCandidate === 'CLEAR' ? null : primaryCandidate}
          onCancel={() => setPrimaryCandidate(null)}
          onDone={() => {
            setPrimaryCandidate(null);
            void reload();
          }}
        />
      )}

      {pendingActivityDelete && (
        <ConfirmModal
          title={t('settings.page.delete_activity_title')}
          body={t('settings.page.delete_activity_body', { name: pendingActivityDelete.name })}
          confirmLabel={t('settings.page.delete')}
          onConfirm={confirmActivityDelete}
          onCancel={() => setPendingActivityDelete(null)}
        />
      )}

      {pendingCurrencyDelete && (
        <ConfirmModal
          title={t('settings.page.delete_currency_title')}
          body={t('settings.page.delete_currency_body', { code: pendingCurrencyDelete.code })}
          confirmLabel={t('settings.page.delete')}
          onConfirm={confirmCurrencyDelete}
          onCancel={() => setPendingCurrencyDelete(null)}
        />
      )}
      {/* Cash drawers, owner only: creating a drawer creates a ledger account. */}
      {user?.actorType === 'COMPANY' && <CashDrawersCard />}
      {/* Integrations, owner only: the keys belong to the owner. */}
      {user?.actorType === 'COMPANY' && <IntegrationsCard />}
      {/* System API keys, owner only, as the server enforces with `@OwnerOnly`. */}
      {user?.actorType === 'COMPANY' && <ApiKeysCard />}
      {user?.actorType === 'COMPANY' && <SupportAccessCard />}
      {/* Two-step sign-in, for every actor on their own account: no role grants it,
          and the server reads the identity from the token, so nobody touches another's account. */}
      <MfaCard />
    </div>
  );
}
