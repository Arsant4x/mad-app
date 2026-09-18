import { useEffect, useState } from 'react';
import { getExpiringStock, type ExpiringBatch } from '../../api/inventory';
import { dfmt } from '../../lib/format';

const HORIZONS = [30, 60, 90, 180];

/**
 * ٥+٦ قربُ الانتهاء **بالمتبقّي لا بالمستلَم** (ق-١٠٨٠ · ق-١٠٨٦): كلُّ صفٍّ دفعةٌ في مستودع بما بقي في طبقاتها؛ وما بيع أو
 * شُطب لا يظهر. والحركاتُ القديمة بدفعةٍ نصّاً تبقى وتُعدّ بكمّيتها الواردة — موسومةً كذلك. والحدودُ الثلاثة المعلَنة
 * يردّها الخادم وتُعرض هنا (ق-١٠٨٥) — فمن يستعمل التقرير يقرأ حدَّه.
 */
export function ExpiringStockPage() {
  const [withinDays, setWithinDays] = useState(90);
  const [rows, setRows] = useState<ExpiringBatch[]>([]);
  const [limits, setLimits] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getExpiringStock(withinDays)
      .then((res) => {
        setRows(res.rows);
        setLimits(res.declaredLimits);
      })
      .finally(() => setLoading(false));
  }, [withinDays]);

  const legacyCount = rows.filter((r) => r.source === 'LEGACY_MOVEMENT').length;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">قرب انتهاء الصلاحية</div>
          <div className="page-sub">دفعات بلغت أو تقترب من تاريخ انتهائها — بما بقي منها على الرفّ، الأقرب انتهاءً أولاً</div>
        </div>
      </div>

      {limits.length > 0 && (
        <ul className="hint" style={{ margin: '0 0 12px', paddingInlineStart: 18 }} aria-label="حدودٌ معلَنة">
          {limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}

      <div className="chip-group" style={{ marginBottom: 12 }}>
        {HORIZONS.map((d) => (
          <button key={d} className={withinDays === d ? 'chip active' : 'chip'} onClick={() => setWithinDays(d)}>
            خلال {d} يوم
          </button>
        ))}
      </div>

      {legacyCount > 0 && (
        <p className="hint">
          {legacyCount} صفّاً من حركاتِ إدخالٍ قديمة بدفعةٍ نصّاً — لا طبقةَ لها فيُعرض الواردُ لا المتبقّي؛ تبقى وتُعدّ ولا تُخمَّن دفعتُها.
        </p>
      )}

      {loading ? (
        <p className="hint">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state">لا دفعات تنتهي خلال {withinDays} يوم.</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>المنتج</th>
                <th>الدفعة</th>
                <th>المستودع</th>
                <th>الكمية</th>
                <th>تاريخ الانتهاء</th>
                <th>المتبقّي من المهلة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.productName} {r.sku ? <span className="hint">({r.sku})</span> : null}
                  </td>
                  <td>
                    {r.batchNo ?? '—'}
                    {r.source === 'LEGACY_MOVEMENT' && (
                      <span className="badge draft" style={{ marginInlineStart: 6 }} title="حركةُ إدخالٍ قديمة بدفعةٍ نصّاً — بلا طبقة">
                        قديمة
                      </span>
                    )}
                  </td>
                  <td>{r.warehouseName}</td>
                  <td className="num" title={r.qtyKind === 'REMAINING' ? 'المتبقّي من الطبقات' : 'الواردُ على الحركة — لا يُعرف متبقّيها'}>
                    {r.qty} {r.qtyKind === 'REMAINING' ? <span className="hint">متبقٍّ</span> : <span className="hint">وارد</span>}
                  </td>
                  <td className="num">{dfmt(r.expiryDate)}</td>
                  <td>
                    {r.expired ? (
                      <span className="badge overdue">منتهية منذ {Math.abs(r.daysLeft)} يوم</span>
                    ) : (
                      <span className={`badge ${r.daysLeft <= 30 ? 'due' : 'draft'}`}>{r.daysLeft} يوم</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
