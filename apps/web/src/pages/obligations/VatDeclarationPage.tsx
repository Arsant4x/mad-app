import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { declareVatRatio, getVatDeclaration, getVatRatio, markVatFiled, settleVatRatio, unmarkVatFiled, type VatDeclaration, type VatPeriodQuery, type VatPeriodType, type VatRatioView } from '../../api/obligations';
import { dfmt, fmt } from '../../lib/format';
import { num0, sumMoney } from '../../lib/money';

const QUARTER_OPTIONS = [
  { value: 1, label: 'الربع الأول (يناير - مارس)' },
  { value: 2, label: 'الربع الثاني (أبريل - يونيو)' },
  { value: 3, label: 'الربع الثالث (يوليو - سبتمبر)' },
  { value: 4, label: 'الربع الرابع (أكتوبر - ديسمبر)' },
];

/** ⑥A2 (`ق-١٣٢٥`) — الشهورُ الاثنا عشر بأسمائها؛ الفترةُ الشهرية فوق أربعين مليوناً. */
const MONTH_OPTIONS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'].map((label, i) => ({ value: i + 1, label }));

export function VatDeclarationPage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  /**
   * ⑥A2 — **الشاشةُ تعرض الفترتين معاً ولا تحجب إحداهما**: التاجرُ الشهريُّ قدّم أرباعاً
   * قبل انتقاله، ومنعُه من قراءتها عطلٌ لا حراسة. والإعدادُ يضبط **ما يُفتح عليه أولاً**
   * — يُقرأ من الخادم في أوّل ردّ، فلا تخمّن الشاشةُ فترةَ التاجر.
   */
  const [periodType, setPeriodType] = useState<VatPeriodType | null>(null);
  const [declaration, setDeclaration] = useState<VatDeclaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  /** ⑥A1 — نسبةُ السنة: المعلَنةُ والمقترَحة. تُقرأ **حين يجب الخصمُ النسبيّ وحدَه**. */
  const [ratioView, setRatioView] = useState<VatRatioView | null>(null);
  const [ratioInput, setRatioInput] = useState('');
  const [ratioBusy, setRatioBusy] = useState(false);

  const period: VatPeriodQuery = periodType === 'MONTHLY' ? { year, month } : { year, quarter };

  function reload() {
    setLoading(true);
    return getVatDeclaration(period)
      .then(async (d) => {
        setDeclaration(d);
        // أوّلُ ردٍّ يكشف فترةَ التاجر — فتُتبَع مرّةً واحدة، ثم اختيارُه هو الحاكم.
        setPeriodType((p) => p ?? d.companyVatPeriod);
        // ⑥A1 — **ولا تُقرأ النسبةُ لمن لا يجب عليه**: منشأةٌ خاضعةٌ وحدَها لا شأنَ لها بم٥١.
        if (d.proportional.applies) {
          const r = await getVatRatio(year);
          setRatioView(r);
          setRatioInput(r.declared ? String(r.declared.ratio) : r.suggestion.ratio !== null ? String(r.suggestion.ratio) : '');
        } else {
          setRatioView(null);
        }
      })
      .finally(() => setLoading(false));
  }

  async function saveRatio() {
    if (!ratioView) return;
    setRatioBusy(true);
    try {
      // الأساسُ يتبع ما يملكه النظام: سنةٌ ماضيةٌ كاملةٌ ⟵ محسوبة، وإلا ⟵ مقدَّرة (م٥١/٦).
      const basis = ratioView.suggestion.coversPreviousYear && ratioView.suggestion.ratio !== null ? 'COMPUTED' : 'ESTIMATED';
      await declareVatRatio({ year, ratio: Number(ratioInput), basis, note: ratioView.suggestion.note });
      await reload();
    } finally {
      setRatioBusy(false);
    }
  }

  async function confirmSettlement() {
    setRatioBusy(true);
    try {
      await settleVatRatio(year);
      await reload();
    } finally {
      setRatioBusy(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, quarter, month, periodType]);

  async function toggleFiled() {
    if (!declaration) return;
    setMarking(true);
    try {
      if (declaration.filed) await unmarkVatFiled(period);
      else await markVatFiled(period);
      await reload();
    } finally {
      setMarking(false);
    }
  }

  const years = useMemo(() => [currentYear - 1, currentYear, currentYear + 1], [currentYear]);
  // ② الصافي نصٌّ بخانتين من الخادم — يُقرأ رقماً مرّةً واحدة للإشارة والمقدار (`ق-١٢٣٥`).
  const netVat = num0(declaration?.netVat);

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الإقرار الضريبي (ضريبة القيمة المضافة)</div>
          <div className="page-sub">هيئة الزكاة والضريبة والجمارك</div>
        </div>
      </div>
      <button className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => navigate('/obligations')}>
        → رجوع إلى الالتزامات الحكومية
      </button>

      <div className="card">
        <div className="two-col" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>السنة</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>الفترة</label>
            <select data-testid="vat-period-type" value={periodType ?? 'QUARTERLY'} onChange={(e) => setPeriodType(e.target.value as VatPeriodType)}>
              <option value="QUARTERLY">ربع سنوية</option>
              <option value="MONTHLY">شهرية</option>
            </select>
          </div>
          {periodType === 'MONTHLY' ? (
            <div className="field">
              <label>الشهر</label>
              <select data-testid="vat-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>الربع</label>
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                {QUARTER_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {q.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {loading || !declaration ? null : (
          <>
            {!declaration.periodMatchesCompany && (
              <p className="hint" data-testid="vat-period-mismatch" style={{ marginBottom: 10 }}>
                فترةُ هذه المنشأة المسجَّلة {declaration.companyVatPeriod === 'MONTHLY' ? 'شهرية' : 'ربع سنوية'} — وهذه قراءةٌ لفترةٍ من النوع الآخر.
              </p>
            )}
            {declaration.limits.map((l) => (
              <div
                key={l.code}
                className="card"
                data-testid="vat-limit"
                style={
                  l.severity === 'blocking'
                    ? { marginBottom: 12, borderInlineStart: '4px solid var(--rose)', background: 'rgba(244, 63, 94, 0.06)' }
                    : { marginBottom: 12, borderInlineStart: '4px solid var(--gold)', background: 'var(--gold-soft)' }
                }
              >
                <strong>{l.severity === 'blocking' ? '⛔ حدٌّ معلَن — لا يُقدَّم هذا الإقرار' : '⚠️ تنبيهٌ معلَن'}</strong>
                <p style={{ margin: '6px 0 0' }}>{l.message}</p>
              </div>
            ))}
            <p className="hint" style={{ marginBottom: 10 }}>
              عن الفترة من {dfmt(declaration.from)} إلى {dfmt(declaration.to)}
            </p>

            {/* ⑥A1 (`ق-١٣٢٥`) — **بطاقةُ النسبة: يحسب النظامُ ويعرض، ويُقرّ التاجر** (م٥١/٤–٦).
                ونسبةٌ من بياناتٍ ناقصة رقمٌ خاطئٌ بلا عَرَض — فالتحفّظُ يُعرض قبل الإقرار لا بعده. */}
            {ratioView && (
              <div className="card" data-testid="vat-ratio-card" style={{ marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  نسبة الخصم النسبي لسنة {ratioView.year}
                </div>
                <p className="hint" style={{ marginTop: 0 }}>
                  {ratioView.suggestion.note}
                  {ratioView.suggestion.ratio !== null && (
                    <>
                      {' '}— المقترَح <span className="num">{(ratioView.suggestion.ratio * 100).toFixed(2)}%</span> (خاضع {fmt(ratioView.suggestion.taxableSupplies)} · معفى{' '}
                      {fmt(ratioView.suggestion.exemptSupplies)})
                    </>
                  )}
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="field" style={{ maxWidth: 200, marginBottom: 0 }}>
                    <label>النسبة المطبَّقة (كسر)</label>
                    <input data-testid="vat-ratio-input" className="num" value={ratioInput} onChange={(e) => setRatioInput(e.target.value)} placeholder="0.75" />
                  </div>
                  <button className="btn btn-primary" data-testid="vat-ratio-save" disabled={ratioBusy || ratioInput.trim() === ''} onClick={saveRatio}>
                    {ratioView.declared ? 'تحديث النسبة' : 'إعلان النسبة'}
                  </button>
                  {declaration.proportional.settlement && !declaration.proportional.settlement.settledAt && (
                    <button className="btn btn-ghost" data-testid="vat-ratio-settle" disabled={ratioBusy} onClick={confirmSettlement}>
                      إقرار تسوية السنة (م٥١/٧)
                    </button>
                  )}
                </div>
                {ratioView.declared?.settledAt && (
                  <p className="hint" style={{ marginBottom: 0 }}>
                    أُقرّت تسوية السنة في {dfmt(ratioView.declared.settledAt)} بنسبة فعلية{' '}
                    <span className="num">{((ratioView.declared.settledRatio ?? 0) * 100).toFixed(2)}%</span>
                  </p>
                )}
              </div>
            )}
            <table>
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td>المبيعات — خاناتُ نموذج الهيئة</td>
                  <td className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                    الصافي
                  </td>
                  <td className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                    الضريبة
                  </td>
                </tr>
                {/* ⑧ الخاناتُ من فئات السطور (ق-١٢١١/⑤): 1 الأساسية · 2 المواطنون (معطَّلة) · 3 الصفر الداخلي · 4 الصادرات · 5 المعفاة · 6 المجموع. */}
                <tr>
                  <td style={{ paddingRight: 20 }}>
                    <span className="num">1</span> — المبيعات الخاضعة للنسبة الأساسية ({declaration.invoiceCount} فاتورة
                    {declaration.rent.accrualCount + declaration.rent.legacyCount > 0
                      ? ` · ${declaration.rent.accrualCount + declaration.rent.legacyCount} استحقاق إيجار`
                      : ''}
                    )
                  </td>
                  <td className="num">{fmt(declaration.salesStandard)}</td>
                  <td className="num">{fmt(declaration.salesStandardVat)}</td>
                </tr>
                {/* ⭐ الإيجارُ التجاريُّ يدخل الخاضعَ بنقطة ضريبته (ق-٩١٧ · ق-٩١٨) — ويُفصَل هنا ليُقرأ. */}
                {/* ② المبالغُ نصٌّ بخانتين (`ق-١٢٣٥`): تُعرض كما هي، وتُجمع بـ`sumMoney` لا بـ`+` (وصلٌ لا جمع). */}
                {(num0(declaration.rent.standard) !== 0 || num0(declaration.rent.legacyStandard) !== 0) && (
                  <tr>
                    <td style={{ paddingRight: 36, color: 'var(--muted)' }}>منها إيجاراتٌ تجارية مستحقّة (من الدفتر {fmt(declaration.rent.standard)} · وما سبق البناء {fmt(declaration.rent.legacyStandard)})</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(sumMoney([declaration.rent.standard, declaration.rent.legacyStandard]))}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(sumMoney([declaration.rent.standardVat, declaration.rent.legacyStandardVat]))}</td>
                  </tr>
                )}
                {declaration.legacyStandardLines.lineCount > 0 && (
                  <tr>
                    <td style={{ paddingRight: 36, color: 'var(--muted)' }}>
                      منها {declaration.legacyStandardLines.lineCount} سطراً على صنفٍ لم تُعلَن فئتُه — تُرَنّ بالأساسية كما كانت حتى تُعلَن من بطاقة الصنف
                    </td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(declaration.legacyStandardLines.net)}</td>
                    <td></td>
                  </tr>
                )}
                {/* الخانةُ 2 معروضةٌ ومعطَّلة بسببها (ق-١٢٢٢/③): تابعةٌ للمشتري لا الصنف — صفرٌ معلَن لا يُدمَج في 3. */}
                <tr style={{ color: 'var(--muted)' }} title={declaration.salesCitizensNote}>
                  <td style={{ paddingRight: 20 }}>
                    <span className="num">2</span> — المبيعات للمواطنين (الخدمات الصحية الخاصة / التعليم الأهلي الخاص) <span className="badge draft">غير مدعومة — تتبع المشتري</span>
                  </td>
                  <td className="num">{fmt(declaration.salesCitizens)}</td>
                  <td className="num">{fmt(declaration.boxes[2].vat)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>
                    <span className="num">3</span> — المبيعات المحلية الخاضعة لنسبة الصفر
                  </td>
                  <td className="num">{fmt(declaration.salesZeroRatedDomestic)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>
                    <span className="num">4</span> — الصادرات
                  </td>
                  <td className="num">{fmt(declaration.salesExports)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>
                    <span className="num">5</span> — المبيعات المعفاة (ومنها الإيجاراتُ السكنية — م٦٢/٢/ز)
                  </td>
                  <td className="num">{fmt(declaration.salesExempt)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>
                    <span className="num">6</span> — إجمالي المبيعات
                  </td>
                  <td className="num">{fmt(declaration.totalSales)}</td>
                  <td className="num">{fmt(declaration.salesStandardVat)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>المشتريات</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>المشتريات الخاضعة ({declaration.purchaseCount} فاتورة شراء)</td>
                  <td className="num">{fmt(declaration.purchasesStandard)}</td>
                  <td className="num">{fmt(declaration.purchasesStandardVat)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>المشتريات المعفاة</td>
                  <td className="num">{fmt(declaration.purchasesExempt)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>إجمالي المشتريات</td>
                  <td className="num">{fmt(declaration.totalPurchases)}</td>
                  <td className="num">{fmt(declaration.purchasesStandardVat)}</td>
                </tr>
                {/* ⑥A1 (`ق-١٣٢٥`) — الخصمُ النسبيّ بأجزائه (م٥١): يُعرض **حين يجب وحدَه**،
                    فمنشأةٌ خاضعةٌ وحدَها لا شأنَ لها بالمادّة ولا تُثقَل بصفوفٍ لا تعنيها. */}
                {declaration.proportional.applies && (
                  <>
                    <tr style={{ fontWeight: 700 }}>
                      <td data-testid="proportional-head">
                        الخصم النسبي لضريبة المدخلات (م٥١)
                        {declaration.proportional.ratio !== null && <span className="badge draft"> النسبة {(declaration.proportional.ratio * 100).toFixed(2)}%</span>}
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td style={{ paddingRight: 20, color: 'var(--muted)' }}>منسوبة حصراً لتوريد خاضع — تُخصم كاملة</td>
                      <td></td>
                      <td className="num">{fmt(declaration.proportional.buckets.taxableOnly)}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingRight: 20, color: 'var(--muted)' }}>منسوبة حصراً لتوريد معفى — لا تُخصم</td>
                      <td></td>
                      <td className="num">{fmt(declaration.proportional.buckets.exemptOnly)}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingRight: 20, color: 'var(--muted)' }}>
                        مشتركة تُخصم بالنسبة
                        {declaration.proportional.buckets.legacyCount > 0 && ` (منها ${declaration.proportional.buckets.legacyCount} فاتورة سبقت بناء الإسناد بضريبة ${fmt(declaration.proportional.buckets.legacyUnassigned)})`}
                      </td>
                      <td className="num" style={{ color: 'var(--muted)' }}>{fmt(declaration.proportional.apportionedBase)}</td>
                      <td className="num">{fmt(declaration.proportional.apportionedDeductible)}</td>
                    </tr>
                    <tr style={{ fontWeight: 700 }}>
                      <td data-testid="deductible-input-vat">ضريبة المدخلات القابلة للخصم</td>
                      <td className="num" style={{ color: 'var(--muted)' }}>غير القابلة: {fmt(declaration.proportional.nonDeductibleInputVat)}</td>
                      <td className="num">{fmt(declaration.proportional.deductibleInputVat)}</td>
                    </tr>
                    {declaration.proportional.settlement && (
                      <tr data-testid="proportional-settlement">
                        <td style={{ paddingRight: 20 }}>
                          تسوية السنة {declaration.proportional.settlement.year} (م٥١/٧) — النسبة المطبَّقة {(declaration.proportional.settlement.appliedRatio * 100).toFixed(2)}% والفعلية{' '}
                          {(declaration.proportional.settlement.actualRatio * 100).toFixed(2)}%
                        </td>
                        <td className="num" style={{ color: 'var(--muted)' }}>{fmt(declaration.proportional.settlement.yearApportionedBase)}</td>
                        <td className="num">{fmt(declaration.proportional.settlement.differenceText)}</td>
                      </tr>
                    )}
                  </>
                )}
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: netVat >= 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                  <td>{netVat >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة القابلة للاسترداد'}</td>
                  <td></td>
                  <td className="num">{fmt(Math.abs(netVat))}</td>
                </tr>
              </tbody>
            </table>

            {/* ⑧ ما يُعدّ ولا يدخل الخانات — يُعلَن حيث يُقرأ الرقم (ق-١٢١١/⑤ · ق-١٢٢٥). */}
            <p className="hint" style={{ marginTop: 10, color: 'var(--muted)' }}>{declaration.salesCitizensNote}</p>
            {declaration.salesOutOfScope.lineCount > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                <b>{declaration.salesOutOfScope.lineCount}</b> سطراً خارجَ نطاق الضريبة ({fmt(declaration.salesOutOfScope.net)}) — يُعدّ ولا يدخل خانات الإقرار.
              </p>
            )}
            {declaration.legacyZeroLines.lineCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--amber)' }}>
                <b>{declaration.legacyZeroLines.lineCount}</b> سطراً بنسبة صفر سبقت البناء بلا فئةٍ معلَنة ({fmt(declaration.legacyZeroLines.net)}) — لا يُعرف أهي صفرٌ أم معفاةٌ أم خارجَ النطاق، فتُعدّ ولا تدخل الخانات؛ ومستندُها لا يُختم حتى يُعاد إصدارُه بفئة.
              </p>
            )}

            {/* ⚠️ حدودُ الإيجار تُعلَن حيث يُقرأ الرقم لا في وثيقة (ق-٤٤٩ · ق-٩١٨ · ق-٩٢٦). */}
            {declaration.rent.legacyCount > 0 && (
              <p className="hint" style={{ marginTop: 10 }}>
                <b>{declaration.rent.legacyCount}</b> قسطاً/دفعةً سبقت بناءَ الاستحقاق: <b>في الإقرار لا في الدفتر</b> — {declaration.rent.legacyNote}
                {num0(declaration.rent.legacyExempt) > 0 ? ` (معفى: ${fmt(declaration.rent.legacyExempt)})` : ''}
              </p>
            )}
            {declaration.rent.unclassifiedCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--amber)' }}>
                <b>{declaration.rent.unclassifiedCount}</b> قسطاً/دفعةً لعقودٍ قديمةٍ غيرِ مصنَّفة لا تدخل الإقرار حتى تُصنَّف — {declaration.rent.unclassifiedNote}
              </p>
            )}
            {declaration.rent.managedCount > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                <b>{declaration.rent.managedCount}</b> استحقاقاً لعقاراتِ تشغيلٍ ({fmt(declaration.rent.managedExcluded)}) — توريدُ مالكها، لا يدخل إقرارك.
              </p>
            )}
            {declaration.rent.pendingCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--amber)' }}>
                <b>{declaration.rent.pendingCount}</b> قسطاً حلّ ولم يُرحَّل استحقاقُه بعد — {declaration.rent.pendingNote}
              </p>
            )}
            {declaration.rent.unpostedCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--rose)' }}>
                <b>{declaration.rent.unpostedCount}</b> استحقاقاً بلا قيدٍ في الدفتر (نقصُ حسابٍ في دليل الحسابات) — الإقرارُ يحسبه والدفترُ لا يحمله.
              </p>
            )}
            <p className="hint" style={{ marginTop: 6 }}>
              الإيجارُ التجاريُّ يوجب فاتورةً ضريبية، والنظامُ لا يُصدرها بعد — أصدرها خارجه (ق-٩١١).
            </p>

            {/* ⭐ علَمُ «قُدِّم» (ق-٩١٩): سطرٌ واحد بيد التاجر — فتُعرض رسالةُ التصحيح لمن قدّم وتغيّر رقمُه وحدَه. */}
            <div className="card" style={{ marginTop: 12, borderInlineStart: `4px solid ${declaration.changedSinceFiled ? 'var(--rose)' : declaration.filed ? 'var(--emerald)' : 'var(--line)'}` }}>
              {declaration.filed ? (
                <div style={{ fontWeight: 600 }}>
                  قُدِّم هذا الإقرارُ للهيئة في {dfmt(declaration.filed.filedAt)} بصافي <span className="num">{fmt(declaration.filed.netVat)}</span>
                  {declaration.changedSinceFiled ? ' — وتغيّر بعده' : ' — ولم يتغيّر'}
                </div>
              ) : (
                <div style={{ fontWeight: 600 }}>لم يُوسَم هذا الربعُ مقدَّماً بعد — وسمْه بعد تقديمه للهيئة</div>
              )}
              {declaration.filedNote && (
                <p className="hint" style={{ marginTop: 4, color: 'var(--rose)' }}>
                  {declaration.filedNote}
                </p>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={toggleFiled} disabled={marking}>
                {declaration.filed ? 'إلغاء وسم «قُدِّم»' : '✓ قُدِّم للهيئة'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
