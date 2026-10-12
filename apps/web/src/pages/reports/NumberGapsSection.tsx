import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getNumberGaps, type NumberGaps } from '../../api/reports';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt } from '../../lib/format';

/**
 * Numbers taken but never used, so an auditor asking about a missing number gets an answer.
 * For each series: what was taken since logging began, and what was taken but not used
 * because its transaction did not complete. An empty list is an answer, so the tab always shows.
 */
export function NumberGapsSection() {
  const { t } = useTranslation();
  const [report, setReport] = useState<NumberGaps | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getNumberGaps()
      .then(setReport)
      .catch((e) => setError(apiErrorMessage(e, t('reports.load_failed'))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) return <div className="empty">{error}</div>;
  if (!report) return <div className="empty">{t('reports.loading')}</div>;

  const unusedTotal = report.series.reduce((n, s) => n + s.unused.length, 0);

  return (
    <>
      <div className="card-title" style={{ marginBottom: 6 }}>
        {t('reports.gaps.title')}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
        {t('reports.gaps.intro')}
      </p>
      {report.series.length === 0 ? (
        <div className="empty">{t('reports.gaps.none_taken')}</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t('reports.gaps.series')}</th>
              <th>{t('reports.gaps.year')}</th>
              <th className="num">{t('reports.gaps.taken')}</th>
              <th>{t('reports.gaps.since')}</th>
              <th>{t('reports.gaps.unused')}</th>
              <th>{t('reports.gaps.pending')}</th>
            </tr>
          </thead>
          <tbody>
            {report.series.map((s) => (
              <tr key={`${s.kind}-${s.year}`}>
                <td>{s.kind}</td>
                <td>{s.year === 0 ? '—' : s.year}</td>
                <td className="num">{s.taken}</td>
                <td>{s.recordedSince ? dfmt(s.recordedSince) : ''}</td>
                <td>{s.unused.length === 0 ? t('reports.gaps.nothing') : s.unused.map((u) => u.no).join(t('reports.list_sep'))}</td>
                <td>{s.pending.map((u) => u.no).join(t('reports.list_sep'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ fontSize: 12.5, marginTop: 10 }}>
        {unusedTotal === 0 ? t('reports.gaps.no_unused') : t('reports.gaps.unused_total', { n: unusedTotal })}
      </p>
    </>
  );
}
