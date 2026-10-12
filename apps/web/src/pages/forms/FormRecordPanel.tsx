import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteContractForm,
  setContractFormValues,
  verifyContractForm,
  type FormInstance,
  type FormValueInput,
  type FormVerification,
} from '../../api/forms';
import { ConfirmModal } from '../../components/ConfirmModal';
import { apiErrorMessage } from '../../lib/apiError';
import { dfmt } from '../../lib/format';
import {
  CONDITION_LABELS,
  CONDITION_SCALE,
  dateTimeText,
  isConditionValue,
  NUMERIC_TYPES,
  valueChanged,
  valueDraftOf,
  valueInputOf,
  valueText,
  type FormContractRef,
  type ValueDraft,
} from './formItems';
import { FormSigningSection } from './FormSigningSection';
import { statusOf } from './formStatus';

/**
 * A filled record: the draft is filled by item type, then sealed with its
 * fingerprint, number and place in the chain, then verified and printed with the
 * verification fingerprint. Filling is "record" and sealing is "review" on the
 * contracts screen (the server decides; the button is hidden from those without
 * the action). A sealed record is read only; correction needs a corrective form
 * that is not built yet.
 *
 * Sealing happens when the party signs: staff sign and send from the signing
 * section, what was sent is neither edited nor deleted, and the answer to an
 * objection is a revised copy opened in its place.
 */
export function FormRecordPanel({
  contract,
  record,
  canRecord,
  canReview,
  onChanged,
  onRevised,
  onDeleted,
  onClose,
}: {
  contract: FormContractRef;
  record: FormInstance;
  canRecord: boolean;
  canReview: boolean;
  onChanged: (updated: FormInstance) => void;
  onRevised: (created: FormInstance) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sealed = record.status === 'SEALED';
  const draft = record.status === 'DRAFT';
  const status = statusOf(record.status);
  const [drafts, setDrafts] = useState<Record<string, ValueDraft>>(() =>
    Object.fromEntries(record.items.map((i) => [i.itemId, valueDraftOf(i)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | null>(null);
  const [verification, setVerification] = useState<FormVerification | null>(null);

  const editable = draft && canRecord;
  const dirty = useMemo(() => record.items.some((i) => valueChanged(i, drafts[i.itemId])), [record.items, drafts]);
  const setDraft = (itemId: string, patch: Partial<ValueDraft>) => setDrafts((d) => ({ ...d, [itemId]: { ...d[itemId], ...patch } }));

  /** Sends only what changed, and returns the record as the server saved it. */
  async function saveChanges(): Promise<FormInstance | null> {
    const values: FormValueInput[] = [];
    for (const item of record.items) {
      if (!valueChanged(item, drafts[item.itemId])) continue;
      const r = valueInputOf(item, drafts[item.itemId]);
      if ('error' in r) {
        setError(r.error);
        return null;
      }
      values.push(r.input);
    }
    if (values.length === 0) return record;
    const updated = await setContractFormValues(contract.id, record.id, values);
    setDrafts(Object.fromEntries(updated.items.map((i) => [i.itemId, valueDraftOf(i)])));
    onChanged(updated);
    return updated;
  }

  async function run(fn: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(async () => void (await saveChanges()), t('forms.record.save_failed'));

  /** Unsaved values are saved before signing, so only what is on screen is signed. */
  const beforeSend = async () => {
    if (!editable || !dirty) return true;
    return (await saveChanges()) !== null;
  };

  const remove = () =>
    run(async () => {
      setConfirm(null);
      await deleteContractForm(contract.id, record.id);
      onDeleted();
    }, t('forms.record.delete_failed'));

  const verify = () => run(async () => setVerification(await verifyContractForm(contract.id, record.id)), t('forms.record.verify_failed'));

  return (
    <>
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }} role="dialog" aria-label={t('forms.record.dialog_aria')}>
        <div className="modal-head">
          <div className="modal-title">
            {t('forms.common.name_version', { name: record.template.name, version: record.template.version })}{' '}
            <span className={`badge ${status.badge}`}>{status.label}</span>
            {record.revisionNo > 1 && <span className="hint">{t('forms.record.revision', { n: record.revisionNo })}</span>}
          </div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="print-receipt" data-testid="form-print-sheet">
          <p style={{ fontSize: 12.5 }}>
            {t('forms.common.contract')} <span className="num">{contract.no}</span> · {t('forms.common.unit')} <span className="num">{contract.unitNo}</span> ·{' '}
            {contract.propertyName} · {t('forms.common.tenant')} {contract.tenant} · {t('forms.record.form_date')} <span className="num">{dfmt(record.formDate)}</span> ·{' '}
            {t('forms.record.filled_by', { name: record.filledByName })}
          </p>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th style={{ width: '30%' }}>{t('forms.record.col_item')}</th>
                <th>{t('forms.record.col_value')}</th>
                <th>{t('forms.record.col_note')}</th>
              </tr>
            </thead>
            <tbody>
              {record.items.map((item) => {
                const d = drafts[item.itemId];
                const numeric = NUMERIC_TYPES.has(item.itemType);
                const range =
                  numeric && (item.minValue !== null || item.maxValue !== null)
                    ? t('forms.record.range', { min: item.minValue ?? '…', max: item.maxValue ?? '…', unit: item.unit ? ` ${item.unit}` : '' })
                    : null;
                return (
                  <tr key={item.itemId} data-testid="form-item-row">
                    <td className="num">{item.lineNo}</td>
                    <td>
                      {item.label}
                      {item.required && <div className="hint">{t('forms.record.required')}</div>}
                      {range && <div className="hint">{item.isBlocking ? t('forms.record.range_blocking', { range }) : range}</div>}
                      {item.helpText && <div className="hint">{item.helpText}</div>}
                    </td>
                    <td>
                      {editable ? (
                        item.itemType === 'BOOLEAN' ? (
                          <select aria-label={item.label} value={d.bool} onChange={(e) => setDraft(item.itemId, { bool: e.target.value as ValueDraft['bool'] })}>
                            <option value=""></option>
                            <option value="yes">{t('forms.items.yes')}</option>
                            <option value="no">{t('forms.items.no')}</option>
                          </select>
                        ) : item.itemType === 'CONDITION' ? (
                          <select aria-label={item.label} value={d.text} onChange={(e) => setDraft(item.itemId, { text: e.target.value })}>
                            <option value=""></option>
                            {CONDITION_SCALE.map((c) => (
                              <option key={c} value={c}>
                                {CONDITION_LABELS[c]}
                              </option>
                            ))}
                            {/* A value filled before the scale is shown but not selectable; sealing rejects it until a scale value is chosen. */}
                            {d.text !== '' && !isConditionValue(d.text) && (
                              <option value={d.text} disabled>
                                {t('forms.record.legacy_value', { value: d.text })}
                              </option>
                            )}
                          </select>
                        ) : numeric ? (
                          <input aria-label={item.label} className="num" inputMode="decimal" value={d.number} onChange={(e) => setDraft(item.itemId, { number: e.target.value })} />
                        ) : (
                          <input aria-label={item.label} value={d.text} onChange={(e) => setDraft(item.itemId, { text: e.target.value })} />
                        )
                      ) : (
                        <span className={numeric ? 'num' : undefined}>{valueText(item)}</span>
                      )}
                      {item.outOfRange && <div className="error-text">{t('forms.record.out_of_range')}</div>}
                    </td>
                    <td>
                      {editable ? (
                        <input aria-label={t('forms.record.note_aria', { label: item.label })} value={d.note} onChange={(e) => setDraft(item.itemId, { note: e.target.value })} />
                      ) : (
                        item.note ?? ''
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {sealed && (
            <div className="card" style={{ marginTop: 10 }} data-testid="form-seal-block">
              <div className="card-title">{t('forms.record.seal_title')}</div>
              <p style={{ fontSize: 12.5 }}>
                {t('forms.record.seal_no')} <span className="num">{record.no}</span> · {t('forms.record.seal_seq')} <span className="num">{record.sealSeq}</span>
              </p>
              <p style={{ fontSize: 12.5 }}>
                {t('forms.record.content_hash')} <span className="num" style={{ wordBreak: 'break-all' }}>{record.contentHash}</span>
              </p>
              <p style={{ fontSize: 12.5 }}>
                {t('forms.record.prev_hash')}{' '}
                <span className="num" style={{ wordBreak: 'break-all' }}>
                  {record.prevHash ?? t('forms.record.no_prev_hash')}
                </span>
              </p>
              <p style={{ fontSize: 12.5 }}>
                {t('forms.record.sealed_by', { name: record.sealedByName })} · {t('forms.record.sealed_at')}{' '}
                <span className="num">{record.sealedAt ? dateTimeText(record.sealedAt) : ''}</span> {t('forms.record.server_clock')}
              </p>
              <p className="hint">{t('forms.record.internal_seal_note')}</p>
            </div>
          )}

          <p className="hint">{t('forms.record.ejar_complement')}</p>
        </div>

        <FormSigningSection
          contract={contract}
          record={record}
          canRecord={canRecord}
          canReview={canReview}
          beforeSend={beforeSend}
          onChanged={onChanged}
          onRevised={onRevised}
        />

        {verification && (
          <p className={verification.valid ? 'hint' : 'error-text'} data-testid="form-verification">
            {verification.valid
              ? t('forms.record.verify_ok')
              : t('forms.record.verify_bad', {
                  content: verification.contentIntact ? '' : t('forms.record.verify_content_changed'),
                  chain: verification.chainLinked ? '' : t('forms.record.verify_chain_broken'),
                })}
          </p>
        )}

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('forms.common.close')}
          </button>
          {draft && canRecord && (
            <button className="btn btn-ghost" onClick={() => setConfirm('delete')} disabled={busy}>
              {t('forms.record.delete_draft')}
            </button>
          )}
          {editable && (
            <button className="btn btn-ghost" onClick={save} disabled={busy || !dirty}>
              {t('forms.record.save_draft')}
            </button>
          )}
          {sealed && (
            <>
              <button className="btn btn-ghost" onClick={verify} disabled={busy}>
                {t('forms.record.verify')}
              </button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                {t('forms.record.print')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>

      {confirm === 'delete' && (
        <ConfirmModal
          title={t('forms.record.delete_draft')}
          body={t('forms.record.delete_body')}
          confirmLabel={t('forms.common.delete')}
          onCancel={() => setConfirm(null)}
          onConfirm={remove}
        />
      )}
    </>
  );
}
