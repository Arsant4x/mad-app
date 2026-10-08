import { useEffect, useState } from 'react';
import { getNumberGaps, type NumberGaps } from '../../api/reports';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt } from '../../lib/format';

/**
 * ⚖️ الأرقامُ المأخوذة غير المستعملة (`ق-٣٤٥`): «فمراجعٌ يسأل عن رقمٍ ناقص يجد جواباً، لا سكوتاً».
 * لكلِّ سلسلةٍ ما أُخذ منها منذ بدأ التسجيل، وما أُخذ ولم يُستعمل لأن معاملتَه لم تكتمل.
 * والقائمةُ الفارغةُ جوابٌ لا غياب، فالتبويبُ يُعرض دائماً.
 */
export function NumberGapsSection() {
  const [report, setReport] = useState<NumberGaps | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNumberGaps()
      .then(setReport)
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل التقرير')));
  }, []);

  if (error) return <div className="empty">{error}</div>;
  if (!report) return <div className="empty">جارٍ التحميل…</div>;

  const unusedTotal = report.series.reduce((n, s) => n + s.unused.length, 0);

  return (
    <>
      <div className="card-title" style={{ marginBottom: 6 }}>
        الأرقام المأخوذة غير المستعملة
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        رقمٌ يؤخذ لمستندٍ ثم لا يكتمل المستند (فترةٌ مقفلة، أو رفضٌ، أو انقطاع) يبقى مأخوذاً ولا يُعاد لغيره، فيظهر هنا باسمه ووقت أخذه.
        والسجلُّ يبدأ من أوّل رقمٍ سُجّل في كلِّ سلسلة، وما قبله صدر قبل بناء هذا التقرير.
      </p>
      {report.series.length === 0 ? (
        <div className="empty">لم يُؤخذ رقمٌ بعد بدء التسجيل.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>السلسلة</th>
              <th>السنة</th>
              <th className="num">المأخوذ</th>
              <th>منذ</th>
              <th>أُخذ ولم يُستعمل</th>
              <th>قيد المعالجة</th>
            </tr>
          </thead>
          <tbody>
            {report.series.map((s) => (
              <tr key={`${s.kind}-${s.year}`}>
                <td>{s.kind}</td>
                <td>{s.year === 0 ? '—' : s.year}</td>
                <td className="num">{s.taken}</td>
                <td>{s.recordedSince ? dfmt(s.recordedSince) : ''}</td>
                <td>{s.unused.length === 0 ? 'لا شيء' : s.unused.map((u) => u.no).join('، ')}</td>
                <td>{s.pending.map((u) => u.no).join('، ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 12.5, marginTop: 10 }}>
        {unusedTotal === 0 ? 'لا رقمَ مأخوذاً غيرَ مستعمَل.' : `${unusedTotal} رقماً مأخوذاً غيرَ مستعمَل.`}
      </p>
    </>
  );
}
