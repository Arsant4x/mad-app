import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Customer, CustomerInput, NewCustomerKind } from '../../api/customers';
import type { Property } from '../../api/properties';
import type { Unit } from '../../api/units';
import type { ContractCycle, CreateContractInput, DeclaredClassification, DeclaredVatInclusion, Furnished } from '../../api/contracts';
import { today } from '../../lib/format';
import i18n from '../../i18n';
import { CLASSIFICATION_OPTIONS, VAT_INCLUSION_OPTIONS, isTaxedClassification } from './contractMeta';
import { MixedShareFields, mixedSharePayload } from './MixedShareFields';

const CYCLE_OPTIONS: { value: ContractCycle; label: string }[] = [
  { value: 'monthly', get label() { return i18n.t('contracts.meta.cycle.monthly'); } },
  { value: 'quarterly', get label() { return i18n.t('contracts.meta.cycle.quarterly'); } },
  { value: 'semiannual', get label() { return i18n.t('contracts.meta.cycle.semiannual'); } },
  { value: 'annual', get label() { return i18n.t('contracts.meta.cycle.annual'); } },
];

const FURNISHED_OPTIONS: { value: Furnished; label: string }[] = [
  { value: 'unfurnished', get label() { return i18n.t('contracts.modal.furnished.unfurnished'); } },
  { value: 'furnished', get label() { return i18n.t('contracts.modal.furnished.furnished'); } },
  { value: 'partial', get label() { return i18n.t('contracts.modal.furnished.partial'); } },
];

/** The server message from an axios error, read the way the other screens read it. */
const serverMessage = (e: unknown): string | undefined => (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
const serverStatus = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;

export function ContractModal({
  units,
  properties,
  customers,
  onCancel,
  onSave,
  onCreateCustomer,
}: {
  units: Unit[];
  properties: Property[];
  /** Live customers: the tenant is picked from them by id, or created explicitly. */
  customers: Customer[];
  onCancel: () => void;
  onSave: (data: CreateContractInput) => Promise<void>;
  onCreateCustomer: (data: CustomerInput) => Promise<Customer>;
}) {
  const { t } = useTranslation();
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const [unitId, setUnitId] = useState(units[0]?.id ?? '');
  // The tenant is a customer by id: no typed name, no phone that overwrites another record.
  const [customerId, setCustomerId] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [createdCustomers, setCreatedCustomers] = useState<Customer[]>([]);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  // The new tenant's legal kind is chosen, never assumed.
  const [newKind, setNewKind] = useState<NewCustomerKind | ''>('');
  const [sameNameAsk, setSameNameAsk] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [value, setValue] = useState('');
  const [cycle, setCycle] = useState<ContractCycle>('monthly');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [deposit, setDeposit] = useState('');
  const [services, setServices] = useState('');
  const [furnished, setFurnished] = useState<Furnished | ''>('');
  const [ejarNo, setEjarNo] = useState('');
  // No preset on purpose: the classification and VAT inclusion are declared, not assumed.
  const [classification, setClassification] = useState<DeclaredClassification | ''>('');
  const [vatInclusion, setVatInclusion] = useState<DeclaredVatInclusion | ''>('');
  // The lessor is declared on an operated property, never assumed: VAT follows whoever signs the contract in their name.
  const [lessor, setLessor] = useState<'COMPANY' | 'OWNER' | ''>('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerVatNumber, setOwnerVatNumber] = useState('');
  // The mixed share and its basis are declared with "mixed" only.
  const [sharePercent, setSharePercent] = useState('');
  const [shareBasis, setShareBasis] = useState('');
  const taxed = isTaxedClassification(classification);
  const selectedProperty = propertyById.get(units.find((u) => u.id === unitId)?.propertyId ?? '');
  const managed = selectedProperty?.ownership === 'managed';
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allCustomers = useMemo(() => [...createdCustomers, ...customers.filter((c) => !createdCustomers.some((n) => n.id === c.id))], [customers, createdCustomers]);
  const visibleCustomers = useMemo(() => {
    const q = customerFilter.trim().toLowerCase();
    const live = allCustomers.filter((c) => !c.archived);
    if (!q) return live;
    return live.filter((c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q));
  }, [allCustomers, customerFilter]);

  /**
   * Creates a customer from inside the contract form through the customers route
   * itself: a repeated name returns `409` asking whether it is the same person,
   * so the question is shown and not answered for the user; confirming resends
   * the request with `allowSameName`.
   */
  async function createCustomerInline(allowSameName = false) {
    const name = newName.trim();
    if (!name) {
      setCustomerError(i18n.t('err_customer_name_required'));
      return;
    }
    if (!newKind) {
      setCustomerError(t('contracts.modal.err_kind'));
      return;
    }
    setCustomerError(null);
    setCreatingCustomer(true);
    try {
      const created = await onCreateCustomer({ name, kind: newKind, phone: newPhone.trim() || undefined, ...(allowSameName ? { allowSameName: true } : {}) });
      setCreatedCustomers((prev) => [created, ...prev]);
      setCustomerId(created.id);
      setSameNameAsk(null);
      setNewCustomerOpen(false);
      setNewName('');
      setNewPhone('');
    } catch (e) {
      const message = serverMessage(e);
      // The server answers in the interface language, so its same-name question is matched in both.
      const sameName = message && (message.includes('أهو نفسُه') || message.includes('is it the same one?')); // i18n-exempt: matches the server's same-name message
      if (serverStatus(e) === 409 && sameName) {
        setSameNameAsk(message);
      } else {
        setCustomerError(message ?? i18n.t('err_customer_save'));
      }
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function submit(draft: boolean) {
    setError(null);
    if (!unitId || !customerId || !value) {
      setError(i18n.t('err_contract_fields'));
      return;
    }
    if (!classification || !vatInclusion) {
      setError(i18n.t('err_contract_classification'));
      return;
    }
    if (managed && !lessor) {
      setError(t('contracts.modal.err_lessor'));
      return;
    }
    if (managed && lessor === 'OWNER' && !ownerName.trim()) {
      setError(t('contracts.modal.err_owner_name'));
      return;
    }
    if (classification === 'MIXED' && (!sharePercent.trim() || !shareBasis.trim())) {
      setError(t('contracts.modal.err_mixed'));
      return;
    }
    setSaving(true);
    try {
      await onSave({
        unitId,
        customerId,
        value: parseFloat(value) || 0,
        cycle,
        start,
        end,
        deposit: parseFloat(String(deposit)) || undefined,
        services: services.trim() || undefined,
        furnished: furnished || undefined,
        ejarNo: ejarNo.trim() || undefined,
        classification,
        vatInclusion,
        ...mixedSharePayload(classification, sharePercent, shareBasis),
        ...(managed && lessor ? { lessor } : {}),
        ...(managed && lessor === 'OWNER' ? { ownerName: ownerName.trim(), ownerVatNumber: ownerVatNumber.trim() || undefined } : {}),
        draft,
      });
    } catch (e) {
      setError(serverMessage(e) ?? i18n.t('err_contract_save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{t('contracts.modal.title')}</div>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="field">
          <label>{t('contracts.modal.unit')}</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {propertyById.get(u.propertyId)?.name ?? '—'} — {u.unitNo}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>{t('contracts.modal.tenant')}</label>
          <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder={t('contracts.modal.tenant_filter_placeholder')} />
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} size={Math.min(6, Math.max(2, visibleCustomers.length + 1))} style={{ marginTop: 6 }}>
            <option value="">{t('contracts.modal.choose_customer')}</option>
            {visibleCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.phone ? ` — ${c.phone}` : ''}
              </option>
            ))}
          </select>
          {!newCustomerOpen && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => setNewCustomerOpen(true)}>
              {t('contracts.modal.new_customer')}
            </button>
          )}
          {newCustomerOpen && (
            <div className="two-col" style={{ marginTop: 8 }}>
              <div className="field">
                <label>{t('contracts.modal.new_customer_name')}</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('contracts.modal.new_customer_name_placeholder')} />
              </div>
              <div className="field">
                <label>{t('contracts.modal.mobile')}</label>
                <input className="num" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder={t('contracts.modal.mobile_placeholder')} />
              </div>
              <div className="field">
                <label htmlFor="contract-new-kind">{t('contracts.modal.kind')}</label>
                <select id="contract-new-kind" value={newKind} onChange={(e) => setNewKind(e.target.value as NewCustomerKind | '')}>
                  <option value="">{t('contracts.lessor.choose')}</option>
                  <option value="NATURAL">{t('contracts.modal.kind_natural')}</option>
                  <option value="ESTABLISHMENT">{t('contracts.modal.kind_establishment')}</option>
                  <option value="LEGAL_PERSON">{t('contracts.modal.kind_legal_person')}</option>
                </select>
              </div>
              {sameNameAsk ? (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <p className="hint">{sameNameAsk}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setSameNameAsk(null)} disabled={creatingCustomer}>
                      {t('contracts.modal.same_name_no')}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => createCustomerInline(true)} disabled={creatingCustomer}>
                      {t('contracts.modal.same_name_yes')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="field" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={() => createCustomerInline(false)} disabled={creatingCustomer}>
                    {t('contracts.modal.save_customer')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => { setNewCustomerOpen(false); setCustomerError(null); }} disabled={creatingCustomer}>
                    {t('contracts.modal.cancel')}
                  </button>
                </div>
              )}
              {customerError && <p className="error-text" style={{ gridColumn: '1 / -1' }}>{customerError}</p>}
            </div>
          )}
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('contracts.modal.classification')}</label>
            <select value={classification} onChange={(e) => setClassification(e.target.value as DeclaredClassification | '')}>
              <option value="">{t('contracts.lessor.choose')}</option>
              {CLASSIFICATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('contracts.modal.vat_inclusion')}</label>
            <select value={vatInclusion} onChange={(e) => setVatInclusion(e.target.value as DeclaredVatInclusion | '')}>
              <option value="">{t('contracts.lessor.choose')}</option>
              {VAT_INCLUSION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {/* Stated at the moment of choosing, not after: inclusive lowers revenue below the installment, exclusive raises what the tenant owes. */}
            {taxed && vatInclusion === 'INCLUSIVE' && (
              <p className="hint" style={{ marginTop: 4 }}>
                {t('contracts.modal.inclusive_hint_start')}{classification === 'MIXED' ? t('contracts.modal.on_taxable_part') : ''} — <b>{t('contracts.modal.inclusive_hint_bold')}</b>{t('contracts.modal.inclusive_hint_end')}
              </p>
            )}
            {taxed && vatInclusion === 'EXCLUSIVE' && (
              <p className="hint" style={{ marginTop: 4 }}>
                {t('contracts.modal.exclusive_hint_start')}{classification === 'MIXED' ? t('contracts.modal.on_taxable_part') : ''} — <b>{t('contracts.modal.exclusive_hint_bold')}</b>{t('contracts.modal.exclusive_hint_end')}
              </p>
            )}
            {classification === 'SERVICED_LODGING' && (
              <p className="hint" style={{ marginTop: 4 }}>
                {t('contracts.modal.serviced_hint')}
              </p>
            )}
            {classification === 'RESIDENTIAL' && vatInclusion !== '' && (
              <p className="hint" style={{ marginTop: 4 }}>
                {t('contracts.modal.residential_hint')}
              </p>
            )}
          </div>
        </div>
        {classification === 'MIXED' && <MixedShareFields idPrefix="contract" percent={sharePercent} onPercent={setSharePercent} basis={shareBasis} onBasis={setShareBasis} />}
        {managed && (
          <div className="two-col">
            <div className="field">
              <label htmlFor="contract-lessor">{t('contracts.lessor.label')}</label>
              <select id="contract-lessor" value={lessor} onChange={(e) => setLessor(e.target.value as 'COMPANY' | 'OWNER' | '')}>
                <option value="">{t('contracts.lessor.choose')}</option>
                <option value="COMPANY">{t('contracts.lessor.company')}</option>
                <option value="OWNER">{t('contracts.lessor.owner')}</option>
              </select>
              {lessor === 'COMPANY' && (
                <p className="hint" style={{ marginTop: 4 }}>
                  {t('contracts.modal.company_lessor_hint')}
                </p>
              )}
              {lessor === 'OWNER' && (
                <p className="hint" style={{ marginTop: 4 }}>
                  {t('contracts.modal.owner_hint_start')}<b>{t('contracts.modal.owner_hint_bold')}</b>{t('contracts.modal.owner_hint_after')}
                  {selectedProperty?.opRate ? t('contracts.modal.op_rate', { rate: selectedProperty.opRate }) : t('contracts.modal.op_rate_missing')}.
                </p>
              )}
            </div>
            {lessor === 'OWNER' && (
              <div className="field">
                <label htmlFor="contract-owner-name">{t('contracts.lessor.owner_name')}</label>
                <input id="contract-owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder={t('contracts.lessor.owner_name_placeholder')} />
                <label htmlFor="contract-owner-vat" style={{ marginTop: 6 }}>
                  {t('contracts.lessor.owner_vat')}{taxed ? '' : t('contracts.lessor.owner_vat_optional')}
                </label>
                <input id="contract-owner-vat" className="num" value={ownerVatNumber} onChange={(e) => setOwnerVatNumber(e.target.value)} placeholder={t('contracts.lessor.owner_vat_placeholder')} />
              </div>
            )}
          </div>
        )}
        <div className="two-col">
          <div className="field">
            <label>{t('contracts.modal.value')}</label>
            <input className="num" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>{t('contracts.modal.cycle')}</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value as ContractCycle)}>
              {CYCLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('contracts.modal.start')}</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <label>{t('contracts.modal.end')}</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <label>{t('contracts.modal.deposit')}</label>
            <input className="num" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>{t('contracts.modal.furnished_label')}</label>
            <select value={furnished} onChange={(e) => setFurnished(e.target.value as Furnished | '')}>
              <option value="">—</option>
              {FURNISHED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t('contracts.modal.services')}</label>
          <input value={services} onChange={(e) => setServices(e.target.value)} placeholder={t('contracts.modal.services_placeholder')} />
        </div>
        <div className="field">
          <label>{t('contracts.modal.ejar_no')}</label>
          <input className="num" value={ejarNo} onChange={(e) => setEjarNo(e.target.value)} placeholder={t('contracts.modal.ejar_no_placeholder')} />
        </div>

        {error && <p className="error-text">{error}</p>}
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onCancel}>
            {t('contracts.modal.cancel')}
          </button>
          <button className="btn btn-ghost" onClick={() => submit(true)} disabled={saving}>
            {t('contracts.modal.save_draft')}
          </button>
          <button className="btn btn-primary" onClick={() => submit(false)} disabled={saving}>
            {t('contracts.modal.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
