import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVatDeclaration, markVatFiled, unmarkVatFiled, type VatDeclaration } from '../../api/obligations';
import { dfmt, fmt } from '../../lib/format';
import { num0, sumMoney } from '../../lib/money';

const QUARTER_OPTIONS = [
  { value: 1, label: 'الربع الأول (يناير - مارس)' },
  { value: 2, label: 'الربع الثاني (أبريل - يونيو)' },
  { value: 3, label: 'الربع الثالث (يوليو - سبتمبر)' },
  { value: 4, label: 'الربع الرابع (أكتوبر - ديسمبر)' },
];

export function VatDeclarationPage() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [declaration, setDeclaration] = useState<VatDeclaration | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  function reload() {
    setLoading(true);
    return getVatDeclaration(year, quarter)
      .then(setDeclaration)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, quarter]);

  async function toggleFiled() {
    if (!declaration) return;
    setMarking(true);
    try {
      if (declaration.filed) await unmarkVatFiled(year, quarter);
      else await markVatFiled(year, quarter);
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
            <label>الربع</label>
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
              {QUARTER_OPTIONS.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading || !declaration ? null : (
          <>
            <p className="hint" style={{ marginBottom: 10 }}>
              عن الفترة من {dfmt(declaration.from)} إلى {dfmt(declaration.to)}
            </p>
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
