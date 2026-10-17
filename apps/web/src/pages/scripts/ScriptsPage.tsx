import { tagOf } from '../../lib/statusBadge';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { createScript, deleteScript, listScripts, setScriptArchived, updateScript, type MessageScript, type ScriptAudience, type ScriptInput } from '../../api/scripts';
import { usePermissions } from '../../auth/PermissionsContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { ScriptModal } from './ScriptModal';
import i18n from '../../i18n';

const audienceMeta = (t: TFunction): Record<ScriptAudience, { label: string; tagClass: string }> => ({
  TENANT: { label: t('scripts.audience.TENANT'), tagClass: 'type-asset' },
  CUSTOMER: { label: t('scripts.audience.CUSTOMER'), tagClass: 'type-rev' },
  EMPLOYEE: { label: t('scripts.audience.EMPLOYEE'), tagClass: 'type-exp' },
});

export function ScriptsPage() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const canAdd = can('scripts', 'add');
  const canEdit = can('scripts', 'edit');
  const canDelete = can('scripts', 'delete');
  const AUDIENCE_META = audienceMeta(t);
  const [scripts, setScripts] = useState<MessageScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Include archived records; off by default for day-to-day work.
  const [showArchived, setShowArchived] = useState(false);
  const [audienceFilter, setAudienceFilter] = useState<'all' | ScriptAudience>('all');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; script: MessageScript } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MessageScript | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    setScripts(await listScripts(showArchived));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scripts.filter((s) => {
      const matchesAudience = audienceFilter === 'all' || s.audience === audienceFilter;
      const matchesQuery = !q || s.title.toLowerCase().includes(q) || s.text.toLowerCase().includes(q);
      return matchesAudience && matchesQuery;
    });
  }, [scripts, search, audienceFilter]);

  async function handleSave(data: ScriptInput) {
    if (modal?.mode === 'edit') {
      await updateScript(modal.script.id, data);
    } else {
      await createScript(data);
    }
    setModal(null);
    await reload();
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await deleteScript(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (e) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setDeleteError(message ?? i18n.t('err_script_delete'));
    }
  }

  if (loading) return null;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('scripts.title')}</div>
          <div className="page-sub">{t('scripts.subtitle')}</div>
        </div>
        <div className="topbar-actions">
          {canAdd && (
            <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
              {t('scripts.new_button')}
            </button>
          )}
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder={t('scripts.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <button className={showArchived ? 'chip active' : 'chip'} onClick={() => setShowArchived((v) => !v)}>
          {t('scripts.show_archived')}
        </button>
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value as 'all' | ScriptAudience)}>
            <option value="all">{t('scripts.all_audiences')}</option>
            {(Object.keys(AUDIENCE_META) as ScriptAudience[]).map((a) => (
              <option key={a} value={a}>
                {tagOf(AUDIENCE_META, a).label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('scripts.col.audience')}</th>
              <th>{t('scripts.col.title')}</th>
              <th>{t('scripts.col.text')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">{t('scripts.empty')}</div>
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className={`type-tag ${tagOf(AUDIENCE_META, s.audience).tagClass}`}>{tagOf(AUDIENCE_META, s.audience).label}</span>
                </td>
                <td>{s.title}{s.archived && <span className="badge draft" style={{ marginInlineStart: 6 }}>{t('scripts.archived')}</span>}</td>
                <td style={{ maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.text}</td>
                <td>
                  <RowMenu
                    actions={[
                      canEdit && { label: t('scripts.menu.edit'), onClick: () => setModal({ mode: 'edit', script: s }) },
                      canEdit && { label: s.archived ? t('scripts.menu.unarchive') : t('scripts.menu.archive'), onClick: () => setScriptArchived(s.id, !s.archived).then(reload) },
                      canDelete && { label: t('scripts.menu.delete'), onClick: () => setPendingDelete(s), danger: true },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && <ScriptModal editing={modal.mode === 'edit' ? modal.script : null} onCancel={() => setModal(null)} onSave={handleSave} />}

      {pendingDelete && (
        <ConfirmModal
          title={t('scripts.delete_title')}
          body={deleteError ?? t('scripts.delete_body', { title: pendingDelete.title })}
          confirmLabel={t('scripts.delete')}
          onCancel={() => {
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
