import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listTrash, purgeFromTrash, restoreFromTrash, type TrashList } from '../../api/trash';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

/**
 * Recycle bin. Deleting a master record hides it everywhere without losing
 * it; this is where it comes back from, or goes for good.
 *
 * Records are shown by their own name and how long is left, because the two
 * questions someone opening this screen has are "which one was it" and "how
 * long do I have".
 */
export function TrashPage() {
  const { t } = useTranslation();
  // The bin lives on the audit screen: restoring reviews, purging deletes.
  const { can } = usePermissions();
  const canRestore = can('audit', 'review');
  const canPurge = can('audit', 'delete');
  const [data, setData] = useState<TrashList | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPurge, setPendingPurge] = useState<{ entity: string; id: string; name: string } | null>(null);

  async function reload() {
    setData(await listTrash());
  }

  useEffect(() => {
    reload()
      .catch(() => setError(t('trash.load_failed')))
      .finally(() => setLoading(false));
  }, []);

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setError(null);
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setError(Array.isArray(d?.message) ? d.message.join(' — ') : (d?.message ?? fallback));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const total = data?.groups.reduce((s, g) => s + g.items.length, 0) ?? 0;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('trash.title')}</div>
          <div className="page-sub">
            {t('trash.subtitle', { n: data?.retentionDays ?? 30 })}
          </div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {total === 0 ? (
        <div className="empty-state">{t('trash.empty')}</div>
      ) : (
        data!.groups.map((group) => (
          <div className="card" key={group.entity} style={{ marginBottom: 14 }}>
            <div className="card-head">
              <div className="card-title">
                {group.label} ({group.items.length})
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('trash.col.record')}</th>
                  <th>{t('trash.col.deleted_at')}</th>
                  <th>{t('trash.col.remaining')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="num">{dfmt(item.deletedAt)}</td>
                    <td>
                      {item.retainedUntil ? (
                        /* Legally retained: no countdown on what will not be erased; show the date and what holds it */
                        <span className="badge draft" title={item.retainedBy.join(' · ')} data-testid="retained">
                          {t('trash.retained', { until: item.retainedUntil, by: item.retainedBy.join(' · ') })}
                        </span>
                      ) : (
                        /* Colour carries urgency: a week or less is the point at
                            which someone should actually decide. */
                        <span className={`badge ${item.daysLeft <= 7 ? 'overdue' : 'draft'}`}>{t('trash.days_left', { n: item.daysLeft })}</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {canRestore && (
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => restoreFromTrash(group.entity, item.id), t('trash.restore_failed'))}>
                          {t('trash.restore')}
                        </button>
                      )}{' '}
                      {/* The server refuses to purge a retained record with a named 409; the button is disabled, not hidden, so the title can explain why */}
                      {canPurge && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busy || Boolean(item.retainedUntil)}
                          title={item.retainedUntil ? t('trash.retained_until', { until: item.retainedUntil }) : undefined}
                          onClick={() => setPendingPurge({ entity: group.entity, id: item.id, name: item.name })}
                        >
                          {t('trash.purge')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {pendingPurge && (
        <ConfirmModal
          title={t('trash.purge')}
          body={t('trash.purge_body', { name: pendingPurge.name })}
          confirmLabel={t('trash.purge')}
          onConfirm={() => {
            const target = pendingPurge;
            setPendingPurge(null);
            return run(() => purgeFromTrash(target.entity, target.id), t('trash.purge_failed'));
          }}
          onCancel={() => setPendingPurge(null)}
        />
      )}
    </div>
  );
}
