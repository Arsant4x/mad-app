import { useEffect, useState } from 'react';
import { SECTOR_LABELS, SECTORS, type Sector } from '../../api/activities';
import {
  createFormType,
  createPublicFormTemplate,
  deletePublicFormTemplate,
  getPublicFormTemplate,
  listFormTypes,
  listPublicFormTemplates,
  newPublicFormTemplateVersion,
  publishPublicFormTemplate,
  updatePublicFormTemplate,
  type FormTemplate,
  type FormTemplateRow,
  type FormType,
} from '../../api/forms';
import { ConfirmModal } from '../../components/ConfirmModal';
import { RowMenu } from '../../components/RowMenu';
import { apiErrorMessage } from '../../lib/apiError';
import { badgeOf } from '../../lib/statusBadge';
import { itemDraftOf } from '../forms/formItems';
import { TemplateEditorModal } from '../forms/TemplateEditorModal';
import { sortTemplateRows, TEMPLATE_STATUS_META } from '../forms/templateStatus';

type Editing = { mode: 'create' } | { mode: 'edit'; template: FormTemplate; readOnly: boolean };
type Pending = { kind: 'publish' | 'delete'; row: FormTemplateRow };

/**
 * ⚖️ **القوالبُ العامّةُ الجاهزة** (الموجة ١ب · `ق-١٦٣٨`، والنموذجُ المرئيّ المُقرّ «القوالبُ العامّةُ الجاهزة»؛ قرارُ الخطّة ٤٣:
 * «المنصّةُ تملك القوالب، والتاجرُ يعدّل نسختَه»). **الفاعلُ مدير المنصّة في لوحة المطوّر** (`CLAUDE.md §3.5`)، ولمالك المنصّة
 * وحدَه حتى يُحكم في الدور (`@RequiresPlatformRole()` في الخادم، و`PlatformRoleGate` هنا إخفاءٌ لا منع). وهذا القسمُ لا يقرأ
 * الفاعلَ الحاليّ (حارسُ «لا نظام صلاحيات ثانٍ»): المحرِّرُ يحرّر محتوى، والبوّابةُ حولَه.
 */
export function PublicFormTemplatesSection() {
  const [types, setTypes] = useState<FormType[]>([]);
  const [rows, setRows] = useState<FormTemplateRow[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newType, setNewType] = useState<{ code: string; name: string; sector: Sector | '' }>({ code: '', name: '', sector: '' });

  async function reload() {
    const [t, r] = await Promise.all([listFormTypes(), listPublicFormTemplates()]);
    setTypes(t);
    setRows(sortTemplateRows(r));
  }

  useEffect(() => {
    reload().catch((e) => setError(apiErrorMessage(e, 'تعذّر تحميل القوالب العامّة')));
  }, []);

  async function addType() {
    setError(null);
    try {
      await createFormType({ code: newType.code.trim(), name: newType.name.trim(), sector: newType.sector || undefined });
      setNewType({ code: '', name: '', sector: '' });
      await reload();
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر إضافة النوع'));
    }
  }

  async function open(row: FormTemplateRow, readOnly: boolean) {
    setError(null);
    try {
      setEditing({ mode: 'edit', template: await getPublicFormTemplate(row.id), readOnly });
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر فتح القالب'));
    }
  }

  async function newVersion(row: FormTemplateRow) {
    setError(null);
    try {
      const draft = await newPublicFormTemplateVersion(row.id);
      await reload();
      setEditing({ mode: 'edit', template: draft, readOnly: false });
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر إنشاء إصدارٍ جديد'));
    }
  }

  async function confirmPending() {
    if (!pending) return;
    setError(null);
    try {
      if (pending.kind === 'publish') await publishPublicFormTemplate(pending.row.id);
      else await deletePublicFormTemplate(pending.row.id);
      setPending(null);
      await reload();
    } catch (e) {
      setPending(null);
      setError(apiErrorMessage(e, pending.kind === 'publish' ? 'تعذّر النشر' : 'تعذّر الحذف'));
    }
  }

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-title">القوالبُ العامّةُ الجاهزة</div>
      <p className="hint">المنصّةُ تملك القوالب، والتاجرُ ينسخها ويعدّل نسختَه. والمنشورُ لا يُعدَّل بل يُنشأ إصدارٌ جديد.</p>
      {error && <p className="error-text">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>الرمز</th>
            <th>نوعُ النموذج</th>
            <th>النشاط</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.id} data-testid="form-type-row">
              <td className="num">{t.code}</td>
              <td>{t.name}</td>
              <td>{t.sector ? SECTOR_LABELS[t.sector as Sector] ?? t.sector : 'كلُّ الأنشطة'}</td>
            </tr>
          ))}
          <tr>
            <td>
              <input aria-label="رمز النوع" placeholder="UNIT_HANDOVER" value={newType.code} onChange={(e) => setNewType((n) => ({ ...n, code: e.target.value }))} />
            </td>
            <td>
              <input aria-label="اسم النوع" placeholder="تسليمُ وحدة" value={newType.name} onChange={(e) => setNewType((n) => ({ ...n, name: e.target.value }))} />
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <select aria-label="نشاط النوع" value={newType.sector} onChange={(e) => setNewType((n) => ({ ...n, sector: e.target.value as Sector | '' }))}>
                <option value="">كلُّ الأنشطة</option>
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </option>
                ))}
              </select>{' '}
              <button className="btn btn-ghost btn-sm" onClick={addType} disabled={!newType.code.trim() || !newType.name.trim()}>
                + نوع
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0 6px' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ mode: 'create' })} disabled={types.length === 0}>
          + قالبٌ عامٌّ جديد
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>القالب</th>
            <th>النوع</th>
            <th>النشاط</th>
            <th>الإصدار</th>
            <th>الحالة</th>
            <th>البنود</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7}>
                <div className="empty-state">لا قوالبَ عامّة بعد</div>
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const meta = badgeOf(TEMPLATE_STATUS_META, r.status);
            const actions =
              r.status === 'DRAFT'
                ? [
                    { label: '✎ تحرير', onClick: () => open(r, false) },
                    { label: 'نشر', onClick: () => setPending({ kind: 'publish', row: r }) },
                    { label: 'حذفُ المسوّدة', onClick: () => setPending({ kind: 'delete', row: r }), danger: true },
                  ]
                : r.status === 'PUBLISHED'
                  ? [
                      { label: 'عرض', onClick: () => open(r, true) },
                      { label: 'إصدارٌ جديد', onClick: () => newVersion(r) },
                    ]
                  : [{ label: 'عرض', onClick: () => open(r, true) }];
            return (
              <tr key={r.id} data-testid="public-template-row">
                <td>{r.name}</td>
                <td>{r.formType.name}</td>
                <td>{r.formType.sector ? SECTOR_LABELS[r.formType.sector as Sector] ?? r.formType.sector : 'كلُّ الأنشطة'}</td>
                <td className="num">{r.version}</td>
                <td>
                  <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                </td>
                <td className="num">{r.itemCount}</td>
                <td>
                  <RowMenu actions={actions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing?.mode === 'create' && (
        <TemplateEditorModal
          title="قالبٌ عامٌّ جديد"
          initial={{ name: '', description: '', items: [] }}
          formTypes={types}
          onCancel={() => setEditing(null)}
          onSave={async (v) => {
            await createPublicFormTemplate({ formTypeId: v.formTypeId ?? '', name: v.name, description: v.description || undefined, items: v.items });
            setEditing(null);
            await reload();
          }}
        />
      )}
      {editing?.mode === 'edit' && (
        <TemplateEditorModal
          title={editing.readOnly ? `${editing.template.name} · إصدار ${editing.template.version}` : `تحريرُ ${editing.template.name} · إصدار ${editing.template.version}`}
          initial={{ name: editing.template.name, description: editing.template.description ?? '', items: editing.template.items.map(itemDraftOf) }}
          readOnly={editing.readOnly}
          onCancel={() => setEditing(null)}
          onSave={
            editing.readOnly
              ? undefined
              : async (v) => {
                  await updatePublicFormTemplate(editing.template.id, { name: v.name, description: v.description || undefined, items: v.items });
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
              ? `يُنشر «${pending.row.name}» إصدار ${pending.row.version} فيظهر للمنشآت في كتالوجها، ويُؤرشف ما قبله. ونسخُ المنشآت القائمة لا تتغيّر.`
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
