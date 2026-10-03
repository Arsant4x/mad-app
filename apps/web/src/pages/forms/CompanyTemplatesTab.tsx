import { useEffect, useMemo, useState } from 'react';
import { SECTOR_LABELS } from '../../api/activities';
import {
  copyFormTemplate,
  deleteCompanyFormTemplate,
  formTemplateCatalog,
  getCompanyFormTemplate,
  listCompanyFormTemplates,
  newCompanyFormTemplateVersion,
  publishCompanyFormTemplate,
  updateCompanyFormTemplate,
  type FormTemplate,
  type FormTemplateRow,
} from '../../api/forms';
import { useAuth } from '../../auth/AuthContext';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { apiErrorMessage } from '../../lib/apiError';
import { badgeOf } from '../../lib/statusBadge';
import { itemDraftOf } from './formItems';
import { TemplateEditorModal } from './TemplateEditorModal';
import { sortTemplateRows, TEMPLATE_STATUS_META } from './templateStatus';

type Pending = { kind: 'publish' | 'delete'; row: FormTemplateRow };

/**
 * ⚖️ **قوالبُ المنشأة** (الموجة ١ب · `ق-١٦٣٨`، والنموذجُ المرئيّ المُقرّ «قوالبُ المنشأة»): الفاعلُ **مالكُ المنشأة** في شاشاتها
 * (`CLAUDE.md §3.5`) — ينسخ من القوالب العامّة ويحرّر مسوّدةَ نسخته وينشرها، والمنشورُ لا يُعدَّل بل يُبنى بعده إصدار.
 * **والموظّفُ يرى ولا يحرّر** (الخادمُ يكتب للمالك وحدَه حتى يُحكم فيمن يعدّل قوالبَ المنشأة). ومعها «أحدثُ من أصل نسختك»:
 * إصدارُ المنصّة الأحدثُ من الذي نُسخت منه.
 */
export function CompanyTemplatesTab() {
  const { user } = useAuth();
  const isOwner = user?.actorType === 'COMPANY';
  const [rows, setRows] = useState<FormTemplateRow[]>([]);
  const [catalog, setCatalog] = useState<FormTemplateRow[]>([]);
  const [sources, setSources] = useState<Map<string, { name: string; version: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ template: FormTemplate; readOnly: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const [mine, pub] = await Promise.all([listCompanyFormTemplates(), formTemplateCatalog()]);
    setRows(sortTemplateRows(mine));
    setCatalog(pub);
    // أصلُ كلِّ نسخة: اسمُه وإصدارُه، لتُقابَل بآخر إصدارٍ للمنصّة.
    const ids = [...new Set(mine.map((r) => r.sourceTemplateId).filter((x): x is string => !!x))];
    const found = await Promise.all(ids.map((id) => getCompanyFormTemplate(id).then((t) => [id, { name: t.name, version: t.version }] as const).catch(() => null)));
    setSources(new Map(found.filter((x): x is readonly [string, { name: string; version: number }] => x !== null)));
  }

  useEffect(() => {
    reload()
      .catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل القوالب')))
      .finally(() => setLoading(false));
  }, []);

  const copiedFrom = useMemo(() => new Set(rows.map((r) => r.sourceTemplateId).filter(Boolean)), [rows]);

  async function open(row: FormTemplateRow, readOnly: boolean) {
    setError(null);
    try {
      setEditing({ template: await getCompanyFormTemplate(row.id), readOnly });
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر فتح القالب'));
    }
  }

  async function copy(source: FormTemplateRow) {
    setError(null);
    try {
      const created = await copyFormTemplate({ sourceTemplateId: source.id });
      await reload();
      setEditing({ template: created, readOnly: false });
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر نسخ القالب'));
    }
  }

  async function newVersion(row: FormTemplateRow) {
    setError(null);
    try {
      const draft = await newCompanyFormTemplateVersion(row.id);
      await reload();
      setEditing({ template: draft, readOnly: false });
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر إنشاء إصدارٍ جديد'));
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setError(null);
    try {
      if (pending.kind === 'publish') await publishCompanyFormTemplate(pending.row.id);
      else await deleteCompanyFormTemplate(pending.row.id);
      setPending(null);
      await reload();
    } catch (e) {
      setPending(null);
      setError(apiErrorMessage(e, pending.kind === 'publish' ? 'تعذّر النشر' : 'تعذّر الحذف'));
    }
  }

  if (loading) return null;

  return (
    <div>
      {error && <p className="error-text">{error}</p>}

      <div className="card" style={{ padding: 0 }}>
        <div className="card-title" style={{ padding: '10px 12px' }}>
          نسخُ المنشأة
        </div>
        <table>
          <thead>
            <tr>
              <th>القالب</th>
              <th>النوع</th>
              <th>الإصدار</th>
              <th>الحالة</th>
              <th>البنود</th>
              <th>منسوخةٌ من</th>
              <th>آخرُ إصدارٍ للمنصّة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{isOwner ? 'لا قوالبَ لمنشأتك بعد. انسخ قالباً من القوالب العامّة أدناه.' : 'لا قوالبَ لمنشأتك بعد.'}</div>
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const meta = badgeOf(TEMPLATE_STATUS_META, r.status);
              const source = r.sourceTemplateId ? sources.get(r.sourceTemplateId) : undefined;
              const newer = source && r.sourceLatestVersion !== null && r.sourceLatestVersion > source.version;
              const actions =
                isOwner && r.status === 'DRAFT'
                  ? [
                      { label: '✎ تحرير', onClick: () => open(r, false) },
                      { label: 'نشر', onClick: () => setPending({ kind: 'publish', row: r }) },
                      { label: 'حذفُ المسوّدة', onClick: () => setPending({ kind: 'delete', row: r }), danger: true },
                    ]
                  : isOwner && r.status === 'PUBLISHED'
                    ? [
                        { label: 'عرض', onClick: () => open(r, true) },
                        { label: 'إصدارٌ جديد', onClick: () => newVersion(r) },
                      ]
                    : [{ label: 'عرض', onClick: () => open(r, true) }];
              return (
                <tr key={r.id} data-testid="company-template-row">
                  <td>{r.name}</td>
                  <td>{r.formType.name}</td>
                  <td className="num">{r.version}</td>
                  <td>
                    <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                  </td>
                  <td className="num">{r.itemCount}</td>
                  <td>{source ? `${source.name} · إصدار ${source.version}` : ''}</td>
                  <td>
                    {r.sourceLatestVersion !== null && <span className="num">{r.sourceLatestVersion}</span>}
                    {newer && <div className="hint">أحدثُ من أصل نسختك</div>}
                  </td>
                  <td>
                    <RowMenu actions={actions} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOwner && (
        <div className="card" style={{ padding: 0, marginTop: 14 }}>
          <div className="card-title" style={{ padding: '10px 12px' }}>
            القوالبُ العامّةُ الجاهزة
          </div>
          <table>
            <thead>
              <tr>
                <th>القالب</th>
                <th>النوع</th>
                <th>النشاط</th>
                <th>الإصدار</th>
                <th>البنود</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {catalog.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">لا قوالبَ عامّةً منشورة بعد.</div>
                  </td>
                </tr>
              )}
              {catalog.map((c) => (
                <tr key={c.id} data-testid="catalog-row">
                  <td>{c.name}</td>
                  <td>{c.formType.name}</td>
                  <td>{c.formType.sector ? SECTOR_LABELS[c.formType.sector as keyof typeof SECTOR_LABELS] ?? c.formType.sector : 'كلُّ الأنشطة'}</td>
                  <td className="num">{c.version}</td>
                  <td className="num">{c.itemCount}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => copy(c)}>
                      {copiedFrom.has(c.id) ? 'نسخةٌ أخرى لمنشأتي' : 'نسخُ قالبٍ لمنشأتي'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TemplateEditorModal
          title={editing.readOnly ? `${editing.template.name} · إصدار ${editing.template.version}` : `تحريرُ ${editing.template.name} · إصدار ${editing.template.version}`}
          initial={{ name: editing.template.name, description: editing.template.description ?? '', items: editing.template.items.map(itemDraftOf) }}
          readOnly={editing.readOnly}
          onCancel={() => setEditing(null)}
          onSave={
            editing.readOnly
              ? undefined
              : async (v) => {
                  await updateCompanyFormTemplate(editing.template.id, { name: v.name, description: v.description || undefined, items: v.items });
                  setEditing(null);
                  await reload();
                }
          }
        />
      )}

      {pending && (
        <ConfirmModal
          title={pending.kind === 'publish' ? 'نشرُ الإصدار' : 'حذفُ المسوّدة'}
          body={
            pending.kind === 'publish'
              ? `يُنشر «${pending.row.name}» إصدار ${pending.row.version} فيُعبّأ عليه، ويُؤرشف ما قبله. والمنشورُ لا يُعدَّل بعد ذلك بل يُبنى بعده إصدارٌ جديد.`
              : `تُحذف مسوّدةُ «${pending.row.name}» إصدار ${pending.row.version}.`
          }
          confirmLabel={pending.kind === 'publish' ? 'نشر' : 'حذف'}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
