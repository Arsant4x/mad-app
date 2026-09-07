import { useEffect, useState } from 'react';
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
  /** النشاط المرشَّح ليصير رئيسياً — و`null` داخل الكائن يعني التراجع. */
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

  async function reload() {
    const [a, c, r] = await Promise.all([listActivities(), listCurrencies(), listExchangeRates()]);
    setActivities(a);
    setCurrencies(c);
    setRates(r);
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
   * التعطيل لا الحذف — الشاشات تختفي و**البيانات تبقى كما هي**.
   *
   * ⚠️ ولا يُخفى النشاط من الجدول بعد التعطيل: بقاؤه مرئياً معطَّلاً هو ما
   * يجعل إعادة تفعيله ممكنة. وإخفاؤه يجعله يبدو محذوفاً — وهو ليس كذلك.
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
          <div className="page-title">الأنشطة والعملات</div>
          <div className="page-sub">النشاط يحدّد سلوك الفروع والمنتجات — والعملة الأساسية هي وحدة القياس لكل التقارير</div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <div className="card">
        <div className="card-head">
          <div className="card-title">الأنشطة التجارية</div>
          {/* ⭐ **التراجع الفوري** — مرئيٌّ دائماً لا مخفيّاً في قائمة.
            * فمن أخفى شاشةً بالخطأ يحتاج طريق العودة الآن، لا بعد بحث. */}
          {isOwner && (
            <button className="btn btn-ghost btn-sm" data-testid="clear-primary" onClick={() => setPrimaryCandidate('CLEAR')}>
              إظهار كل الشاشات (إلغاء الترشيح)
            </button>
          )}
        </div>

        {isOwner && (
          <div className="two-col" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>اسم النشاط</label>
              <input value={activityName} onChange={(e) => setActivityName(e.target.value)} placeholder="مثال: صيدلية" />
            </div>
            <div className="field">
              <label>نوع النشاط (اختياري)</label>
              <input value={activityType} onChange={(e) => setActivityType(e.target.value)} placeholder="عقارات | مطاعم | صيدلية" />
            </div>
            <div className="field">
              <label>القطاع — يحدّد الشاشات</label>
              {/* القائمة من `SECTORS` المقروءة، لا مكتوبةً هنا. */}
              <select value={activitySector} onChange={(e) => setActivitySector(e.target.value as Sector | '')} data-testid="sector-select">
                <option value="">— بلا قطاع (كل الشاشات) —</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                ))}
              </select>
              <p className="hint">القطاع يحدّد الشاشات التي تظهر لك ولموظفيك. ويبقى بلا أثر حتى تختار نشاطاً رئيسياً.</p>
            </div>
          </div>
        )}
        {isOwner && (
          <div style={{ marginBottom: 14 }}>
            <button className="btn btn-primary" onClick={saveActivity}>
              {editingActivity ? 'حفظ التعديل' : '+ إضافة نشاط'}
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
                إلغاء
              </button>
            )}
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th>النشاط</th>
              <th>النوع</th>
              <th>القطاع</th>
              <th>الفروع</th>
              <th>المنتجات</th>
              {isOwner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} data-testid={`activity-${a.id}`} data-disabled={a.disabledAt !== null}>
                <td>
                  {a.name}
                  {a.disabledAt && <span className="badge sealed" style={{ marginInlineStart: 6 }}>معطَّل</span>}
                </td>
                <td>{a.activityType ?? '—'}</td>
                <td data-testid={`sector-${a.id}`}>
                  {/* ⭐ **ثلاث حالات لا اثنتان**: مؤكَّد · مقترَح ينتظر
                    * التأكيد · ولا شيء. والثانية هي التي تحتاج فعلاً من
                    * المالك — ودمجُها بالأولى يجعله يظنّ أنه أكّد. */}
                  {a.sector ? (
                    SECTOR_LABELS[a.sector]
                  ) : a.sectorSuggested ? (
                    <span className="hint" data-testid={`suggested-${a.id}`}>
                      نرشّح: {SECTOR_LABELS[a.sectorSuggested]} — يحتاج تأكيدك
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
                      تعديل
                    </button>
                    {/* التعطيل لا الحذف — والبيانات تبقى. */}
                    <button
                      className="btn btn-ghost btn-sm"
                      data-testid={`toggle-${a.id}`}
                      onClick={() => void toggleActivity(a)}
                    >
                      {a.disabledAt ? 'تفعيل' : 'تعطيل'}
                    </button>
                    {a.sector && !a.disabledAt && (
                      <button className="btn btn-ghost btn-sm" data-testid={`make-primary-${a.id}`} onClick={() => setPrimaryCandidate(a)}>
                        اجعله رئيسياً
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setPendingActivityDelete(a)}>
                      حذف
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
          <div className="card-title">العملات</div>
        </div>

        {isOwner && (
          <>
            <div className="two-col">
              <div className="field">
                <label>الرمز (3 أحرف)</label>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={3} placeholder="USD" />
              </div>
              <div className="field">
                <label>الاسم</label>
                <input value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} placeholder="دولار أمريكي" />
              </div>
            </div>
            <div className="two-col">
              <div className="field">
                <label>الرمز المختصر (اختياري)</label>
                <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="$" />
              </div>
              <div className="field">
                <label>سعر الصرف مقابل العملة الأساسية</label>
                <input type="number" step="0.000001" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="3.75" />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={saveCurrency}>
              + إضافة عملة
            </button>
          </>
        )}

        <table>
          <thead>
            <tr>
              <th>الرمز</th>
              <th>الاسم</th>
              <th>سعر الصرف</th>
              {isOwner && <th></th>}
            </tr>
          </thead>
          <tbody>
            {currencies.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.code} {c.isBase && <span className="badge paid">أساسية</span>}
                </td>
                <td>
                  {c.name} {c.symbol ? `(${c.symbol})` : ''}
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
                        حذف
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
          <div className="card-title">أسعار الصرف التاريخية</div>
        </div>
        <p className="hint">
          سعر اليوم الواحد يُحفظ مرة واحدة — إعادة تسجيل نفس التاريخ تُحدّث السعر ولا تضيف سطراً جديداً. المستند المرحَّل يحتفظ بسعره وقت
          الترحيل ولا يُعاد تسعيره.
        </p>

        {isOwner && (
          <>
            <div className="two-col">
              <div className="field">
                <label>من عملة</label>
                <select value={rateFrom} onChange={(e) => setRateFrom(e.target.value)}>
                  <option value="">اختر…</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>إلى عملة</label>
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
                <label>السعر</label>
                <input type="number" step="0.000001" value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
              </div>
              <div className="field">
                <label>التاريخ</label>
                <input type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={saveExchangeRate}>
              حفظ السعر
            </button>
          </>
        )}

        {rates.length === 0 ? (
          <div className="empty-state">لا توجد أسعار صرف مسجّلة.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>من</th>
                <th>إلى</th>
                <th>السعر</th>
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
          title="حذف النشاط"
          body={`سيُحذف "${pendingActivityDelete.name}". لا يمكن الحذف إذا كان مرتبطاً بفروع أو منتجات.`}
          confirmLabel="حذف"
          onConfirm={confirmActivityDelete}
          onCancel={() => setPendingActivityDelete(null)}
        />
      )}

      {pendingCurrencyDelete && (
        <ConfirmModal
          title="حذف العملة"
          body={`ستُحذف "${pendingCurrencyDelete.code}". لا يمكن الحذف إذا كانت مستخدَمة في أي مستند.`}
          confirmLabel="حذف"
          onConfirm={confirmCurrencyDelete}
          onCancel={() => setPendingCurrencyDelete(null)}
        />
      )}
      {/* أدراج الكاشير — للمالك فقط: إنشاءُ درجٍ يُنشئ حساباً في الدليل (ق-٢١٨). */}
      {user?.actorType === 'COMPANY' && <CashDrawersCard />}
      {/* الربط والتكاملات — تظهر للمالك فقط: المفاتيح ملكه (قاعدة §3.5). */}
      {user?.actorType === 'COMPANY' && <IntegrationsCard />}
      {user?.actorType === 'COMPANY' && <SupportAccessCard />}
    </div>
  );
}
