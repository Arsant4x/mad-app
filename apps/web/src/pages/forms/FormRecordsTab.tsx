import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
 * Form records: pick a contract, see its records, create a record from a
 * published company template, then fill, seal and print it. The contract is read
 * from the URL (?contract=) so the new contract screen can open this screen on a
 * given contract. Actions are those of the contracts screen: filling is "record"
 * and sealing is "review".
 */
export function FormRecordsTab() {
  const { t } = useTranslation();
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

  // The contract from the URL: its header and records.
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
      .catch((e) => !cancelled && setError(apiErrorMessage(e, t('forms.records.load_failed'))));
    return () => {
      cancelled = true;
    };
  }, [contractId]);

  // What can be filled in: the company's published templates.
  useEffect(() => {
    listCompanyFormTemplates()
      .then((rows) => setTemplates(rows.filter((r) => r.status === 'PUBLISHED')))
      .catch(() => setTemplates([]));
  }, []);

  // Contract search on the server, by number, tenant or unit.
  useEffect(() => {
    if (contractId) return;
    const q = search.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      listContracts({ search: q || undefined, pageSize: 10 })
        .then((r) => !cancelled && setResults(r.items))
        .catch(() => !cancelled && setResults([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
      setError(apiErrorMessage(e, t('forms.records.create_failed')));
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
            <input placeholder={t('forms.records.search_placeholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>{t('forms.records.col_contract')}</th>
                <th>{t('forms.records.col_tenant')}</th>
                <th>{t('forms.records.col_unit')}</th>
                <th>{t('forms.records.col_property')}</th>
                <th>{t('forms.records.col_period')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">{t('forms.records.no_contracts')}</div>
                  </td>
                </tr>
              )}
              {results.map((c) => (
                <tr key={c.id} data-testid="contract-pick-row">
                  <td className="num">{c.no}</td>
                  <td>{c.tenant}</td>
                  <td className="num">{c.unit.unitNo}</td>
                  <td>{c.unit.property.name}</td>
                  <td className="num">{t('forms.records.period', { start: dfmt(c.start), end: dfmt(c.end) })}</td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => choose(c.id)}>
                      {t('forms.records.contract_forms')}
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
              {t('forms.common.contract')} <span className="num">{contract.no}</span> · {t('forms.common.unit')} <span className="num">{contract.unitNo}</span> · {contract.propertyName} ·{' '}
              {contract.tenant}
            </>
          ) : null}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => choose(null)}>
          {t('forms.records.other_contract')}
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      {canRecord && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="two-col" style={{ alignItems: 'end' }}>
            <div className="field">
              <label>{t('forms.records.new_from_template')}</label>
              <select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)} aria-label={t('forms.records.template_aria')}>
                <option value="">{templates.length ? t('forms.records.choose_template') : t('forms.records.no_published_template')}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {t('forms.common.name_version', { name: tpl.name, version: tpl.version })}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t('forms.records.form_date')}</label>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={create} disabled={!newTemplateId || creating}>
            {t('forms.records.create')}
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>{t('forms.records.col_no')}</th>
              <th>{t('forms.records.col_template')}</th>
              <th>{t('forms.records.col_type')}</th>
              <th>{t('forms.records.form_date')}</th>
              <th>{t('forms.records.col_filled_by')}</th>
              <th>{t('forms.records.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('forms.records.no_records')}</div>
                </td>
              </tr>
            )}
            {records.map((r) => (
              <tr key={r.id} data-testid="form-record-row">
                <td className="num">{r.no ?? ''}</td>
                <td>{t('forms.common.name_version', { name: r.template.name, version: r.template.version })}</td>
                <td>{r.template.formType.name}</td>
                <td className="num">{dfmt(r.formDate)}</td>
                <td>{r.filledByName}</td>
                <td>
                  <span className={`badge ${statusOf(r.status).badge}`}>{statusOf(r.status).label}</span>
                  {r.revisionNo > 1 && <span className="hint num"> · {r.revisionNo}</span>}
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpen(r)}>
                    {t('forms.records.open')}
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
            // A revised copy is a new record in the set: it is added and opened, the previous one stays objected.
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
