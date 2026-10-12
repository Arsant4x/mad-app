import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { declareVatRatio, getVatDeclaration, getVatRatio, markVatFiled, settleVatRatio, unmarkVatFiled, type VatDeclaration, type VatPeriodQuery, type VatPeriodType, type VatRatioView } from '../../api/obligations';
import { dfmt, fmt } from '../../lib/format';
import { num0, pct, sumMoney } from '../../lib/money';

const QUARTER_OPTIONS = [1, 2, 3, 4].map((value) => ({ value, labelKey: `obligations.vat.quarter_${value}` }));

/** The twelve months by name; monthly returns apply above forty million in sales. */
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, labelKey: `obligations.vat.month_${i + 1}` }));

export function VatDeclarationPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  /**
   * Both period types stay readable: a merchant now filing monthly still filed quarters
   * before switching. The business setting only picks which one opens first, read from
   * the server's first answer so the screen never guesses.
   */
  const [periodType, setPeriodType] = useState<VatPeriodType | null>(null);
  const [declaration, setDeclaration] = useState<VatDeclaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  /** The year's declared and suggested ratio, read only when proportional deduction applies. */
  const [ratioView, setRatioView] = useState<VatRatioView | null>(null);
  const [ratioInput, setRatioInput] = useState('');
  const [ratioBusy, setRatioBusy] = useState(false);

  const period: VatPeriodQuery = periodType === 'MONTHLY' ? { year, month } : { year, quarter };

  function reload() {
    setLoading(true);
    return getVatDeclaration(period)
      .then(async (d) => {
        setDeclaration(d);
        // The first answer reveals the business's period; after that the user's choice rules.
        setPeriodType((p) => p ?? d.companyVatPeriod);
        // A fully taxable business has no ratio to read.
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
      // A complete previous year gives a computed ratio; otherwise it is an estimate (Art. 51/6).
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
  // Net VAT arrives as two-decimal text; read it as a number once for sign and size.
  const netVat = num0(declaration?.netVat);
  const periodName = (type: VatPeriodType, n: number) => (type === 'MONTHLY' ? t('obligations.vat.month_n', { n }) : t('obligations.vat.quarter_n', { n }));

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('obligations.vat.title')}</div>
          <div className="page-sub">{t('obligations.vat.sub')}</div>
        </div>
      </div>
      <button className="btn btn-ghost" style={{ marginBottom: 14 }} onClick={() => navigate('/obligations')}>
        {t('obligations.vat.back')}
      </button>

      <div className="card">
        <div className="two-col" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>{t('obligations.vat.year')}</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('obligations.vat.period')}</label>
            <select data-testid="vat-period-type" value={periodType ?? 'QUARTERLY'} onChange={(e) => setPeriodType(e.target.value as VatPeriodType)}>
              <option value="QUARTERLY">{t('obligations.vat.quarterly')}</option>
              <option value="MONTHLY">{t('obligations.vat.monthly')}</option>
            </select>
          </div>
          {periodType === 'MONTHLY' ? (
            <div className="field">
              <label>{t('obligations.vat.month')}</label>
              <select data-testid="vat-month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {t(m.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>{t('obligations.vat.quarter')}</label>
              <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
                {QUARTER_OPTIONS.map((q) => (
                  <option key={q.value} value={q.value}>
                    {t(q.labelKey)}
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
                {t('obligations.vat.period_mismatch', {
                  period: declaration.companyVatPeriod === 'MONTHLY' ? t('obligations.vat.period_word_monthly') : t('obligations.vat.period_word_quarterly'),
                })}
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
                <strong>{l.severity === 'blocking' ? t('obligations.vat.limit_blocking') : t('obligations.vat.limit_notice')}</strong>
                <p style={{ margin: '6px 0 0' }}>{l.message}</p>
              </div>
            ))}
            <p className="hint" style={{ marginBottom: 10 }}>
              {t('obligations.vat.period_range', { from: dfmt(declaration.from), to: dfmt(declaration.to) })}
            </p>

            {/* The system computes and shows the ratio; the merchant declares it (Art. 51/4 to 51/6).
                A ratio from incomplete data is wrong without a symptom, so the caveat comes before declaring. */}
            {ratioView && (
              <div className="card" data-testid="vat-ratio-card" style={{ marginBottom: 12 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  {t('obligations.vat.ratio_title', { year: ratioView.year })}
                </div>
                <p className="hint" style={{ marginTop: 0 }}>
                  {ratioView.suggestion.note}
                  {ratioView.suggestion.ratio !== null && (
                    <>
                      {' '}
                      {t('obligations.vat.ratio_suggested')} <span className="num">{pct(ratioView.suggestion.ratio)}</span>{' '}
                      {t('obligations.vat.ratio_split', { taxable: fmt(ratioView.suggestion.taxableSupplies), exempt: fmt(ratioView.suggestion.exemptSupplies) })}
                    </>
                  )}
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="field" style={{ maxWidth: 200, marginBottom: 0 }}>
                    <label>{t('obligations.vat.ratio_applied')}</label>
                    <input data-testid="vat-ratio-input" className="num" value={ratioInput} onChange={(e) => setRatioInput(e.target.value)} placeholder="0.75" />
                  </div>
                  <button className="btn btn-primary" data-testid="vat-ratio-save" disabled={ratioBusy || ratioInput.trim() === ''} onClick={saveRatio}>
                    {ratioView.declared ? t('obligations.vat.ratio_update') : t('obligations.vat.ratio_declare')}
                  </button>
                  {declaration.proportional.settlement && !declaration.proportional.settlement.settledAt && (
                    <button className="btn btn-ghost" data-testid="vat-ratio-settle" disabled={ratioBusy} onClick={confirmSettlement}>
                      {t('obligations.vat.ratio_settle')}
                    </button>
                  )}
                </div>
                {ratioView.declared?.settledAt && (
                  <p className="hint" style={{ marginBottom: 0 }}>
                    {t('obligations.vat.ratio_settled', { date: dfmt(ratioView.declared.settledAt) })} <span className="num">{pct(ratioView.declared.settledRatio)}</span>
                  </p>
                )}
              </div>
            )}
            <table>
              <tbody>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('obligations.vat.sales_head')}</td>
                  <td className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                    {t('obligations.vat.net')}
                  </td>
                  <td className="num" style={{ color: 'var(--muted)', fontWeight: 400 }}>
                    {t('obligations.vat.vat')}
                  </td>
                </tr>
                {/* Boxes come from line categories: 1 standard, 2 citizens (disabled), 3 domestic zero rated, 4 exports, 5 exempt, 6 total. */}
                <tr>
                  <td style={{ paddingInlineStart: 20 }}>
                    <span className="num">1</span>{' '}
                    {t('obligations.vat.box1', {
                      n: declaration.invoiceCount,
                      rent:
                        declaration.rent.accrualCount + declaration.rent.legacyCount > 0
                          ? t('obligations.vat.box1_rent', { n: declaration.rent.accrualCount + declaration.rent.legacyCount })
                          : '',
                    })}
                  </td>
                  <td className="num">{fmt(declaration.salesStandard)}</td>
                  <td className="num">{fmt(declaration.salesStandardVat)}</td>
                </tr>
                {/* Commercial rent enters the standard box at its tax point; shown separately so it can be read. */}
                {/* Amounts are two-decimal text: shown as is and added with sumMoney, never with + (that would join strings). */}
                {(num0(declaration.rent.standard) !== 0 || num0(declaration.rent.legacyStandard) !== 0) && (
                  <tr>
                    <td style={{ paddingInlineStart: 36, color: 'var(--muted)' }}>
                      {t('obligations.vat.rent_commercial', { ledger: fmt(declaration.rent.standard), legacy: fmt(declaration.rent.legacyStandard) })}
                    </td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(sumMoney([declaration.rent.standard, declaration.rent.legacyStandard]))}</td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(sumMoney([declaration.rent.standardVat, declaration.rent.legacyStandardVat]))}</td>
                  </tr>
                )}
                {declaration.legacyStandardLines.lineCount > 0 && (
                  <tr>
                    <td style={{ paddingInlineStart: 36, color: 'var(--muted)' }}>
                      {t('obligations.vat.legacy_standard_lines', { n: declaration.legacyStandardLines.lineCount })}
                    </td>
                    <td className="num" style={{ color: 'var(--muted)' }}>{fmt(declaration.legacyStandardLines.net)}</td>
                    <td></td>
                  </tr>
                )}
                {/* Box 2 is shown disabled with its reason: it depends on the buyer, not the product, so it is a declared zero kept out of box 3. */}
                <tr style={{ color: 'var(--muted)' }} title={declaration.salesCitizensNote}>
                  <td style={{ paddingInlineStart: 20 }}>
                    <span className="num">2</span> {t('obligations.vat.box2')} <span className="badge draft">{t('obligations.vat.box2_badge')}</span>
                  </td>
                  <td className="num">{fmt(declaration.salesCitizens)}</td>
                  <td className="num">{fmt(declaration.boxes[2].vat)}</td>
                </tr>
                <tr>
                  <td style={{ paddingInlineStart: 20 }}>
                    <span className="num">3</span> {t('obligations.vat.box3')}
                  </td>
                  <td className="num">{fmt(declaration.salesZeroRatedDomestic)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr>
                  <td style={{ paddingInlineStart: 20 }}>
                    <span className="num">4</span> {t('obligations.vat.box4')}
                  </td>
                  <td className="num">{fmt(declaration.salesExports)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr>
                  <td style={{ paddingInlineStart: 20 }}>
                    <span className="num">5</span> {t('obligations.vat.box5')}
                  </td>
                  <td className="num">{fmt(declaration.salesExempt)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>
                    <span className="num">6</span> {t('obligations.vat.box6')}
                  </td>
                  <td className="num">{fmt(declaration.totalSales)}</td>
                  <td className="num">{fmt(declaration.salesStandardVat)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>{t('obligations.vat.purchases_head')}</td>
                  <td></td>
                  <td></td>
                </tr>
                <tr>
                  <td style={{ paddingInlineStart: 20 }}>{t('obligations.vat.purchases_standard', { n: declaration.purchaseCount })}</td>
                  <td className="num">{fmt(declaration.purchasesStandard)}</td>
                  <td className="num">{fmt(declaration.purchasesStandardVat)}</td>
                </tr>
                <tr>
                  <td style={{ paddingInlineStart: 20 }}>{t('obligations.vat.purchases_exempt')}</td>
                  <td className="num">{fmt(declaration.purchasesExempt)}</td>
                  <td className="num">{fmt(0)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>{t('obligations.vat.purchases_total')}</td>
                  <td className="num">{fmt(declaration.totalPurchases)}</td>
                  <td className="num">{fmt(declaration.purchasesStandardVat)}</td>
                </tr>
                {/* Proportional deduction by its parts (Art. 51), shown only when it applies, so a fully taxable business is not burdened with rows that do not concern it. */}
                {declaration.proportional.applies && (
                  <>
                    <tr style={{ fontWeight: 700 }}>
                      <td data-testid="proportional-head">
                        {t('obligations.vat.proportional_head')}
                        {declaration.proportional.ratio !== null && (
                          <span className="badge draft"> {t('obligations.vat.proportional_ratio', { ratio: pct(declaration.proportional.ratio) })}</span>
                        )}
                      </td>
                      <td></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td style={{ paddingInlineStart: 20, color: 'var(--muted)' }}>{t('obligations.vat.taxable_only')}</td>
                      <td></td>
                      <td className="num">{fmt(declaration.proportional.buckets.taxableOnly)}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingInlineStart: 20, color: 'var(--muted)' }}>{t('obligations.vat.exempt_only')}</td>
                      <td></td>
                      <td className="num">{fmt(declaration.proportional.buckets.exemptOnly)}</td>
                    </tr>
                    <tr>
                      <td style={{ paddingInlineStart: 20, color: 'var(--muted)' }}>
                        {t('obligations.vat.mixed')}
                        {declaration.proportional.buckets.legacyCount > 0 &&
                          t('obligations.vat.mixed_legacy', { n: declaration.proportional.buckets.legacyCount, vat: fmt(declaration.proportional.buckets.legacyUnassigned) })}
                      </td>
                      <td className="num" style={{ color: 'var(--muted)' }}>{fmt(declaration.proportional.apportionedBase)}</td>
                      <td className="num">{fmt(declaration.proportional.apportionedDeductible)}</td>
                    </tr>
                    <tr style={{ fontWeight: 700 }}>
                      <td data-testid="deductible-input-vat">{t('obligations.vat.deductible')}</td>
                      <td className="num" style={{ color: 'var(--muted)' }}>{t('obligations.vat.non_deductible', { amount: fmt(declaration.proportional.nonDeductibleInputVat) })}</td>
                      <td className="num">{fmt(declaration.proportional.deductibleInputVat)}</td>
                    </tr>
                    {declaration.proportional.settlement && (
                      <tr data-testid="proportional-settlement">
                        <td style={{ paddingInlineStart: 20 }}>
                          {t('obligations.vat.settlement_row', {
                            year: declaration.proportional.settlement.year,
                            applied: pct(declaration.proportional.settlement.appliedRatio),
                            actual: pct(declaration.proportional.settlement.actualRatio),
                          })}
                        </td>
                        <td className="num" style={{ color: 'var(--muted)' }}>{fmt(declaration.proportional.settlement.yearApportionedBase)}</td>
                        <td className="num">{fmt(declaration.proportional.settlement.differenceText)}</td>
                      </tr>
                    )}
                  </>
                )}
                {/* Corrections enter the net with their sign (Art. 63/2). */}
                {declaration.corrections.rows.map((c) => (
                  <tr key={c.id} data-testid="vat-correction-row">
                    <td style={{ paddingInlineStart: 20, color: 'var(--muted)' }}>
                      {t('obligations.vat.correction', { period: periodName(c.correctedPeriodType, c.correctedPeriodNo), year: c.correctedYear, reason: c.reason })}
                    </td>
                    <td></td>
                    <td className="num">{fmt(c.amount)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: netVat >= 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                  <td>{netVat >= 0 ? t('obligations.vat.net_due') : t('obligations.vat.net_refundable')}</td>
                  <td></td>
                  <td className="num">{fmt(Math.abs(netVat))}</td>
                </tr>
                {/* A carried balance shows only when there is one, with its source named. */}
                {num0(declaration.carriedForward) !== 0 && declaration.carriedForwardFrom && (
                  <>
                    <tr data-testid="vat-carry-forward">
                      <td style={{ paddingInlineStart: 20, color: 'var(--muted)' }}>
                        {t('obligations.vat.carried_from', {
                          period: periodName(declaration.carriedForwardFrom.periodType, declaration.carriedForwardFrom.periodNo),
                          year: declaration.carriedForwardFrom.year,
                        })}
                      </td>
                      <td></td>
                      <td className="num">−{fmt(declaration.carriedForward)}</td>
                    </tr>
                    <tr style={{ fontWeight: 700, color: num0(declaration.netVatAfterCarryForward) >= 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                      <td>{num0(declaration.netVatAfterCarryForward) >= 0 ? t('obligations.vat.due_after_carry') : t('obligations.vat.surplus_after_carry')}</td>
                      <td></td>
                      <td className="num">{fmt(Math.abs(num0(declaration.netVatAfterCarryForward)))}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>

            {/* What is not built is stated on the return itself: a number without a notice reads as complete. */}
            {declaration.notBuilt.map((n) => (
              <p key={n.code} className="hint" data-testid="vat-not-built" style={{ marginTop: 10, color: 'var(--muted)' }}>
                ⓘ {n.note}
              </p>
            ))}

            {/* What is counted but kept out of the boxes is stated where the number is read. */}
            <p className="hint" style={{ marginTop: 10, color: 'var(--muted)' }}>{declaration.salesCitizensNote}</p>
            {declaration.salesOutOfScope.lineCount > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                <b>{declaration.salesOutOfScope.lineCount}</b> {t('obligations.vat.out_of_scope', { amount: fmt(declaration.salesOutOfScope.net) })}
              </p>
            )}
            {declaration.legacyZeroLines.lineCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--amber)' }}>
                <b>{declaration.legacyZeroLines.lineCount}</b> {t('obligations.vat.legacy_zero', { amount: fmt(declaration.legacyZeroLines.net) })}
              </p>
            )}

            {/* Rent limits are stated where the number is read, not in a document. */}
            {declaration.rent.legacyCount > 0 && (
              <p className="hint" style={{ marginTop: 10 }}>
                <b>{declaration.rent.legacyCount}</b> {t('obligations.vat.legacy_rent')} <b>{t('obligations.vat.legacy_rent_where')}</b> — {declaration.rent.legacyNote}
                {num0(declaration.rent.legacyExempt) > 0 ? t('obligations.vat.legacy_rent_exempt', { amount: fmt(declaration.rent.legacyExempt) }) : ''}
              </p>
            )}
            {declaration.rent.unclassifiedCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--amber)' }}>
                <b>{declaration.rent.unclassifiedCount}</b> {t('obligations.vat.unclassified', { note: declaration.rent.unclassifiedNote })}
              </p>
            )}
            {declaration.rent.managedCount > 0 && (
              <p className="hint" style={{ marginTop: 6 }}>
                <b>{declaration.rent.managedCount}</b> {t('obligations.vat.managed', { amount: fmt(declaration.rent.managedExcluded) })}
              </p>
            )}
            {/* When the owner is the lessor, the rent is counted but not entered; your commission on it is in the standard rated sales above. */}
            {declaration.rent.ownerCount > 0 && (
              <p className="hint" style={{ marginTop: 6 }} data-testid="vat-owner-rent">
                <b>{declaration.rent.ownerCount}</b>{' '}
                {t('obligations.vat.owner_rent', {
                  collected: fmt(declaration.rent.ownerCollected),
                  commission: fmt(declaration.rent.commissionStandard),
                  vat: fmt(declaration.rent.commissionStandardVat),
                })}
              </p>
            )}
            {/* Taxable claims and deposit deductions are already in the standard rated sales above. */}
            {num0(declaration.rent.chargesStandard) !== 0 && (
              <p className="hint" style={{ marginTop: 6 }} data-testid="vat-rent-charges">
                {t('obligations.vat.rent_charges', { amount: fmt(declaration.rent.chargesStandard), vat: fmt(declaration.rent.chargesStandardVat) })}
              </p>
            )}
            {declaration.rent.pendingCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--amber)' }}>
                <b>{declaration.rent.pendingCount}</b> {t('obligations.vat.pending', { note: declaration.rent.pendingNote })}
              </p>
            )}
            {declaration.rent.unpostedCount > 0 && (
              <p className="hint" style={{ marginTop: 6, color: 'var(--rose)' }}>
                <b>{declaration.rent.unpostedCount}</b> {t('obligations.vat.unposted')}
              </p>
            )}
            <p className="hint" style={{ marginTop: 6 }}>
              {t('obligations.vat.rent_invoice_note')}
            </p>

            {/* The "filed" flag is one line set by the merchant, so the correction message shows only to someone who filed and whose number changed. */}
            <div className="card" style={{ marginTop: 12, borderInlineStart: `4px solid ${declaration.changedSinceFiled ? 'var(--rose)' : declaration.filed ? 'var(--emerald)' : 'var(--line)'}` }}>
              {declaration.filed ? (
                <div style={{ fontWeight: 600 }}>
                  {t('obligations.vat.filed_on', { date: dfmt(declaration.filed.filedAt) })} <span className="num">{fmt(declaration.filed.netVat)}</span>
                  {declaration.changedSinceFiled ? t('obligations.vat.filed_changed') : t('obligations.vat.filed_unchanged')}
                </div>
              ) : (
                <div style={{ fontWeight: 600 }}>{t('obligations.vat.not_filed')}</div>
              )}
              {declaration.filedNote && (
                <p className="hint" style={{ marginTop: 4, color: 'var(--rose)' }}>
                  {declaration.filedNote}
                </p>
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={toggleFiled} disabled={marking}>
                {declaration.filed ? t('obligations.vat.unmark_filed') : t('obligations.vat.mark_filed')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
