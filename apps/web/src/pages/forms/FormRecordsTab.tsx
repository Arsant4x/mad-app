import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getContract, listContracts, type ContractListItem } from '../../api/contracts';
import { createContractForm, listCompanyFormTemplates, listContractForms, type FormInstance, type FormTemplateRow } from '../../api/forms';
import { usePermissions } from '../../auth/PermissionsContext';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt, today } from '../../lib/format';
import type { FormContractRef } from './formItems';
import { FormRecordPanel } from './FormRecordPanel';
import { statusOf } from './formStatus';

const contractRefOf = (c: Pick<ContractListItem, 'id' | 'no' | 'tenant' | 'unit'>): FormContractRef => ({
  id: c.id,
  no: c.no,
  tenant: c.tenant,
  unitNo: c.unit.unitNo,
  propertyName: c.unit.property.name,
});

/**
 * ⚖️ **سجلّاتُ النماذج** (الموجة ١د · `ق-١٦٣٨`): يُختار العقدُ ثم تُعرض سجلّاتُه، ويُنشأ سجلٌّ من إصدارٍ منشورٍ من قوالب المنشأة،
 * ويُعبّأ ويُختم ويُطبع. **والعقدُ يُقرأ من الرابط** (`?contract=`) فيفتح زرُّ شاشة العقد الجديدة هذه الشاشةَ على عقده بعينه.
 * والأفعالُ أفعالُ شاشة العقود: التعبئةُ «تسجيل» والختمُ «مراجعة».
 */
export function FormRecordsTab() {
  const { can } = usePermissions();
  const canRecord = can('contracts', 'record');
  const canReview = can('contracts', 'review');
  const [params, setParams] = useSearchParams();
  const contractId = params.get('contract');

  const [contract, setContract] = useState<FormContractRef | null>(null);
  const [records, setRecords] = useState<FormInstance[]>([]);
  const [templates, setTemplates] = useState<FormTemplateRow[]>([]);
  const [open, setOpen] = useState<FormInstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ContractListItem[]>([]);

  const [newTemplateId, setNewTemplateId] = useState('');
  const [newDate, setNewDate] = useState(today());
  const [creating, setCreating] = useState(false);

  // العقدُ من الرابط: رأسُه وسجلّاتُه.
  useEffect(() => {
    if (!contractId) {
      setContract(null);
      setRecords([]);
      return;
    }
    let cancelled = false;
    setError(null);
    Promise.all([getContract(contractId), listContractForms(contractId)])
      .then(([c, list]) => {
        if (cancelled) return;
        setContract(contractRefOf(c));
        setRecords(list);
      })
      .catch((e) => !cancelled && setError(apiErrorMessage(e, 'تعذّر تحميل العقد وسجلّاته')));
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  // ما يُعبّأ عليه: المنشورُ من قوالب المنشأة.
  useEffect(() => {
    listCompanyFormTemplates()
      .then((rows) => setTemplates(rows.filter((r) => r.status === 'PUBLISHED')))
      .catch(() => setTemplates([]));
  }, []);

  // البحثُ عن عقد: من الخادم برقمه أو مستأجره أو وحدته.
  useEffect(() => {
    if (contractId) return;
    const q = search.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      listContracts({ search: q || undefined, pageSize: 10 })
        .then((r) => !cancelled && setResults(r.items))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, contractId]);

  const choose = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('contract', id);
    else next.delete('contract');
    setParams(next, { replace: true });
  };

  async function create() {
    if (!contractId || !newTemplateId) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createContractForm(contractId, { templateId: newTemplateId, formDate: newDate });
      setRecords((rs) => [created, ...rs]);
      setOpen(created);
      setNewTemplateId('');
    } catch (e) {
      setError(apiErrorMessage(e, 'تعذّر إنشاء السجلّ'));
    } finally {
      setCreating(false);
    }
  }

  const replace = (updated: FormInstance) => {
    setRecords((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    setOpen(updated);
  };

  if (!contractId) {
    return (
      <div>
        <div className="toolbar">
          <div className="search-box">
            <input placeholder="ابحث عن العقد برقمه أو المستأجر أو الوحدة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>العقد</th>
                <th>المستأجر</th>
                <th>الوحدة</th>
                <th>العقار</th>
                <th>المدّة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">لا عقودَ مطابقة</div>
                  </td>
                </tr>
              )}
              {results.map((c) => (
                <tr key={c.id} data-testid="contract-pick-row">
                  <td className="num">{c.no}</td>
                  <td>{c.tenant}</td>
                  <td className="num">{c.unit.unitNo}</td>
                  <td>{c.unit.property.name}</td>
                  <td className="num">
                    {dfmt(c.start)} إلى {dfmt(c.end)}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => choose(c.id)}>
                      نماذجُ هذا العقد
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13 }}>
          {contract ? (
            <>
              العقد <span className="num">{contract.no}</span> · الوحدة <span className="num">{contract.unitNo}</span> · {contract.propertyName} · {contract.tenant}
            </>
          ) : null}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => choose(null)}>
          عقدٌ آخر
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {canRecord && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="two-col" style={{ alignItems: 'end' }}>
            <div className="field">
              <label>نموذجٌ جديد من قالب</label>
              <select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} aria-label="القالب">
                <option value="">{templates.length ? 'اختر قالباً منشوراً' : 'لا قالبَ منشوراً للمنشأة بعد'}</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · إصدار {t.version}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>تاريخُ النموذج</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={create} disabled={!newTemplateId || creating}>
            + إنشاءُ السجلّ
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>الرقم</th>
              <th>القالب</th>
              <th>النوع</th>
              <th>تاريخُ النموذج</th>
              <th>عبّأه</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">لا نماذجَ لهذا العقد بعد</div>
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} data-testid="form-record-row">
                <td className="num">{r.no ?? ''}</td>
                <td>
                  {r.template.name} · إصدار {r.template.version}
                </td>
                <td>{r.template.formType.name}</td>
                <td className="num">{dfmt(r.formDate)}</td>
                <td>{r.filledByName}</td>
                <td>
                  <span className={`badge ${statusOf(r.status).badge}`}>{statusOf(r.status).label}</span>
                  {r.revisionNo > 1 && <span className="hint num"> · {r.revisionNo}</span>}
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpen(r)}>
                    فتح
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && contract && (
        <FormRecordPanel
          key={open.id}
          contract={contract}
          record={open}
          canRecord={canRecord}
          canReview={canReview}
          onChanged={replace}
          onRevised={(created) => {
            // النسخةُ المعدّلة سجلٌّ جديد في المجموعة (`ق-١٦٦٩`): تُضاف وتُفتح، والسابقةُ تبقى «معترَضاً عليها».
            setRecords((rs) => [created, ...rs]);
            setOpen(created);
          }}
          onDeleted={() => {
            setRecords((rs) => rs.filter((r) => r.id !== open.id));
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
