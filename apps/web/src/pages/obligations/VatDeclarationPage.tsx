import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getVatDeclaration, type VatDeclaration } from '../../api/obligations';
import { dfmt, fmt } from '../../lib/format';

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

  useEffect(() => {
    setLoading(true);
    getVatDeclaration(year, quarter)
      .then(setDeclaration)
      .finally(() => setLoading(false));
  }, [year, quarter]);

  const years = useMemo(() => [currentYear - 1, currentYear, currentYear + 1], [currentYear]);

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
                  <td>المبيعات</td>
                  <td></td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>إجمالي المبيعات الخاضعة ({declaration.invoiceCount} فاتورة)</td>
                  <td className="num">{fmt(declaration.salesStandard)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>ضريبة المبيعات المستحقة</td>
                  <td className="num">{fmt(declaration.salesStandardVat)}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td>المشتريات</td>
                  <td></td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>المشتريات الخاضعة ({declaration.purchaseCount} فاتورة شراء)</td>
                  <td className="num">{fmt(declaration.purchasesStandard)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>ضريبة المشتريات القابلة للخصم</td>
                  <td className="num">{fmt(declaration.purchasesStandardVat)}</td>
                </tr>
                <tr>
                  <td style={{ paddingRight: 20 }}>المشتريات المعفاة</td>
                  <td className="num">{fmt(declaration.purchasesExempt)}</td>
                </tr>
                <tr style={{ borderTop: '1.5px solid var(--line)', fontWeight: 700 }}>
                  <td>إجمالي المشتريات</td>
                  <td className="num">{fmt(declaration.totalPurchases)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--ink)', fontWeight: 700, color: declaration.netVat >= 0 ? 'var(--rose)' : 'var(--emerald)' }}>
                  <td>{declaration.netVat >= 0 ? 'صافي الضريبة المستحقة' : 'صافي الضريبة القابلة للاسترداد'}</td>
                  <td className="num">{fmt(Math.abs(declaration.netVat))}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
