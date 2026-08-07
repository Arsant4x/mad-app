import { useEffect, useState } from 'react';
import { listTrash, purgeFromTrash, restoreFromTrash, type TrashList } from '../../api/trash';
import { ConfirmModal } from '../../components/ConfirmModal';
import { dfmt } from '../../lib/format';

/**
 * سلة المحذوفات. Deleting a master record hides it everywhere without losing
 * it; this is where it comes back from — or goes for good.
 *
 * Records are shown by their own name and how long is left, because the two
 * questions someone opening this screen has are "which one was it" and "how
 * long do I have".
 */
export function TrashPage() {
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
      .catch(() => setError('تعذّر تحميل سلة المحذوفات'))
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
          <div className="page-title">سلة المحذوفات</div>
          <div className="page-sub">
            كل ما حُذف يبقى قابلاً للاسترجاع {data?.retentionDays ?? 30} يوماً، ثم يُمسح نهائياً
          </div>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {total === 0 ? (
        <div className="empty-state">السلة فارغة — لا سجلات محذوفة.</div>
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
                  <th>السجل</th>
                  <th>تاريخ الحذف</th>
                  <th>المتبقّي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="num">{dfmt(item.deletedAt)}</td>
                    <td>
                      {/* Colour carries urgency: a week or less is the point at
                          which someone should actually decide. */}
                      <span className={`badge ${item.daysLeft <= 7 ? 'overdue' : 'draft'}`}>{item.daysLeft} يوم</span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => restoreFromTrash(group.entity, item.id), 'تعذّر الاسترجاع')}>
                        استرجاع
                      </button>{' '}
                      <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setPendingPurge({ entity: group.entity, id: item.id, name: item.name })}>
                        حذف نهائي
                      </button>
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
          title="حذف نهائي"
          body={`سيُمسح "${pendingPurge.name}" نهائياً ولا يمكن استرجاعه بعدها.`}
          confirmLabel="حذف نهائي"
          onConfirm={() => {
            const target = pendingPurge;
            setPendingPurge(null);
            return run(() => purgeFromTrash(target.entity, target.id), 'تعذّر الحذف النهائي');
          }}
          onCancel={() => setPendingPurge(null)}
        />
      )}
    </div>
  );
}
