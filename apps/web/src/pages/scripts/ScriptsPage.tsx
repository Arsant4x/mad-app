import { useEffect, useMemo, useState } from 'react';
import { createScript, deleteScript, listScripts, updateScript, type MessageScript, type ScriptAudience, type ScriptInput } from '../../api/scripts';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { ScriptModal } from './ScriptModal';
import i18n from '../../i18n';

const AUDIENCE_META: Record<ScriptAudience, { label: string; tagClass: string }> = {
  TENANT: { label: 'مستأجرون', tagClass: 'type-asset' },
  CUSTOMER: { label: 'عملاء', tagClass: 'type-rev' },
  EMPLOYEE: { label: 'موظفون', tagClass: 'type-exp' },
};

export function ScriptsPage() {
  const [scripts, setScripts] = useState<MessageScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [audienceFilter, setAudienceFilter] = useState<'all' | ScriptAudience>('all');
  const [modal, setModal] = useState<{ mode: 'create' } | { mode: 'edit'; script: MessageScript } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MessageScript | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function reload() {
    setScripts(await listScripts());
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

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
          <div className="page-title">قوالب الرسائل</div>
          <div className="page-sub">نصوص جاهزة للتواصل مع المستأجرين والعملاء والموظفين</div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>
            + قالب جديد
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-box">
          <input placeholder="ابحث بأي تفاصيل القالب..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <select value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value as 'all' | ScriptAudience)}>
            <option value="all">كل الفئات</option>
            {(Object.keys(AUDIENCE_META) as ScriptAudience[]).map((a) => (
              <option key={a} value={a}>
                {AUDIENCE_META[a].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الفئة</th>
              <th>العنوان</th>
              <th>النص</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">لا توجد قوالب مطابقة</div>
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <span className={`type-tag ${AUDIENCE_META[s.audience].tagClass}`}>{AUDIENCE_META[s.audience].label}</span>
                </td>
                <td>{s.title}</td>
                <td style={{ maxWidth: 420, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.text}</td>
                <td>
                  <RowMenu
                    actions={[
                      { label: '✎ تعديل', onClick: () => setModal({ mode: 'edit', script: s }) },
                      { label: '🗑 حذف', onClick: () => setPendingDelete(s), danger: true },
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
          title="حذف القالب"
          body={deleteError ?? `حذف قالب "${pendingDelete.title}"؟`}
          confirmLabel="حذف"
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
