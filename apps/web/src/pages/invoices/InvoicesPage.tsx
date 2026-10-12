import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listBranches, type Branch } from '../../api/branches';
import { useLocation } from 'react-router-dom';
import { createCustomer, listCustomers, type Customer, type NewCustomerKind } from '../../api/customers';
import { apiErrorCode } from '../../lib/apiError';
import {
  CREDIT_LIMIT_EXCEEDED,
  createInvoice,
  downloadClearedXml,
  type Invoice,
  type InvoiceLineInput,
  issueCreditNote,
  issueDebitNote,
  issueReplacement,
  listInvoices,
} from '../../api/invoices';
import { submitInvoiceToZatca } from '../../api/zatca';
import { useAuth } from '../../auth/AuthContext';
import { today } from '../../lib/format';
import { ConfirmModal } from '../../components/ConfirmModal';
import { CreditNoteModal } from './CreditNoteModal';
import { DebitNoteModal } from './DebitNoteModal';
import { InvoiceBuilderView } from './InvoiceBuilderView';
import { InvoiceListView } from './InvoiceListView';

/** The builder only creates: an issued document is never edited or deleted; the remedy is a credit or debit note. */
type View = { mode: 'list' } | { mode: 'builder' };

export function InvoicesPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  // The dashboard's "new invoice" button navigates here with this nav state to
  // jump straight into the builder.
  const [view, setView] = useState<View>((location.state as { openBuilder?: boolean } | null)?.openBuilder ? { mode: 'builder' } : { mode: 'list' });
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * The draft refused for an overridable reason, kept so it can be resent with
   * the override. The draft itself is kept, not a flag: the resend needs exactly
   * what was sent, and the builder does not resend while the error is caught here.
   */
  const [overridable, setOverridable] = useState<Parameters<typeof handleSave>[0] | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<Invoice | null>(null);
  const [creditNoteFor, setCreditNoteFor] = useState<Invoice | null>(null);
  const [debitNoteFor, setDebitNoteFor] = useState<Invoice | null>(null);
  const [replacementFor, setReplacementFor] = useState<Invoice | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function reload() {
    // listBranches already returns only what this user may see, so it doubles
    // as the picker's option list without any extra filtering here.
    const [inv, cust, brs] = await Promise.all([listInvoices(), listCustomers(), listBranches()]);
    setInvoices(inv);
    setCustomers(cust);
    setBranches(brs);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  /**
   * Sending an invoice to the authority is irreversible — a cleared invoice
   * cannot be recalled — so it is confirmed first, and any refusal is shown
   * rather than swallowed.
   *
   * A rejection comes back as a normal 201 with `zatcaStatus: 'REJECTED'`; only
   * a refusal *before* submission (profile incomplete, not onboarded) throws.
   */
  async function confirmSubmit() {
    if (!pendingSubmit) return;
    const invoice = pendingSubmit;
    setPendingSubmit(null);
    setSubmitError(null);
    setSubmittingId(invoice.id);
    try {
      await submitInvoiceToZatca(invoice.id);
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('invoices.page.err_submit')));
    } finally {
      setSubmittingId(null);
      await reload();
    }
  }

  /** Full credit of the whole invoice — the server derives the amounts from
   * the original's lines and refuses over-crediting; any refusal (e.g. an
   * already fully-credited invoice) surfaces in the same error modal as a
   * ZATCA refusal. */
  async function handleIssueCreditNote(reason: string) {
    if (!creditNoteFor) return;
    const invoice = creditNoteFor;
    setCreditNoteFor(null);
    try {
      await issueCreditNote(invoice.id, { reason, issueDate: today() });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('invoices.page.err_credit_note')));
    } finally {
      await reload();
    }
  }

  /** Additional billing against the invoice — the lines are the merchant's,
   * never copied from the original (that would be double-billing). */
  async function handleIssueDebitNote(reason: string, lines: InvoiceLineInput[]) {
    if (!debitNoteFor) return;
    const invoice = debitNoteFor;
    setDebitNoteFor(null);
    try {
      await issueDebitNote(invoice.id, { reason, issueDate: today(), lines });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('invoices.page.err_debit_note')));
    } finally {
      await reload();
    }
  }

  /**
   * A replacement for a rejected invoice: the server copies the whole sale from
   * the rejected one and closes it, so no lines are sent. The device clock is
   * sent as on creation, for a standard invoice whose date is refreshed.
   */
  async function confirmReplacement() {
    if (!replacementFor) return;
    const invoice = replacementFor;
    setReplacementFor(null);
    try {
      const now = new Date();
      await issueReplacement(invoice.id, { issuedAt: now.toISOString(), issuedOffsetMin: -now.getTimezoneOffset() });
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('invoices.page.err_replacement')));
    } finally {
      await reload();
    }
  }

  /**
   * A standard invoice is delivered as the XML file cleared by the authority.
   * A server refusal (not cleared, cleared without a copy, simplified) is shown
   * as is, with no fallback: our pre-clearance copy is not delivered in its place.
   */
  async function handleDownloadClearedXml(invoice: Invoice) {
    try {
      await downloadClearedXml(invoice);
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? t('invoices.page.err_download_cleared')));
    }
  }

  async function handleCreateCustomer(name: string, kind: NewCustomerKind): Promise<Customer> {
    const customer = await createCustomer({ name, kind });
    setCustomers((cs) => [...cs, customer].sort((a, b) => a.name.localeCompare(b.name)));
    return customer;
  }

  /**
   * The server refuses to edit the content of an invoice that entered the
   * ZATCA chain (409) — the builder posts the whole document, so that refusal
   * covers this screen. Show its reason and **stay in the builder**:
   * closing back to the list would throw away everything the user typed for a
   * save that never happened.
   */
  /**
   * A credit limit refusal is shown with an override button, not just "OK".
   *
   * The message carries the limit, the current exposure and the request, so the
   * merchant reads it and then decides. The override is never sent with the
   * first request: a pre-declared override would make the limit decorative.
   *
   * The button appears only on `CREDIT_LIMIT_EXCEEDED`: a hard block or a
   * permission refusal is read without a button, since a button that is always
   * refused is worse than none.
   */
  async function handleSave(
    data: { customerId: string; issueDate: string; issuedAt?: string; issuedOffsetMin?: number; dueDate: string; notes: string; branchId: string; lines: InvoiceLineInput[]; prepaymentInvoiceIds?: string[] },
    creditOverride = false,
  ) {
    // An empty picker means company-wide — send it as omitted, not as ''.
    const payload = { ...data, branchId: data.branchId || undefined, ...(creditOverride ? { creditOverride: true } : {}) };
    setSaveError(null);
    setOverridable(null);
    try {
      await createInvoice(payload);
    } catch (e) {
      const body = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSaveError(Array.isArray(body?.message) ? body.message.join(' — ') : (body?.message ?? t('invoices.page.err_save')));
      // The error code decides, not the message text, which is translated.
      if (apiErrorCode(e) === CREDIT_LIMIT_EXCEEDED) setOverridable(data);
      return;
    }
    setView({ mode: 'list' });
    await reload();
  }

  if (loading) return null;

  if (view.mode === 'builder') {
    return (
      <>
        <InvoiceBuilderView
          customers={customers}
          branches={branches}
          editing={null}
          nextNumberHint={`INV-${new Date().getFullYear()}-${String(invoices.filter((i) => i.docType === 'INVOICE').length + 1).padStart(4, '0')}`}
          onCancel={() => setView({ mode: 'list' })}
          onSave={handleSave}
          onCreateCustomer={handleCreateCustomer}
        />
        {saveError && !overridable && (
          <ConfirmModal title={t('invoices.page.save_failed_title')} body={saveError} confirmLabel={t('invoices.page.ok')} hideCancel onCancel={() => setSaveError(null)} onConfirm={() => setSaveError(null)} />
        )}
        {saveError && overridable && (
          <ConfirmModal
            title={t('invoices.page.credit_override_title')}
            body={saveError}
            confirmLabel={t('invoices.page.credit_override_confirm')}
            onCancel={() => {
              setSaveError(null);
              setOverridable(null);
            }}
            onConfirm={() => void handleSave(overridable, true)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <InvoiceListView
        invoices={invoices}
        onNew={() => setView({ mode: 'builder' })}
        onSubmitToZatca={(invoice) => setPendingSubmit(invoice)}
        onIssueCreditNote={(invoice) => setCreditNoteFor(invoice)}
        onIssueDebitNote={(invoice) => setDebitNoteFor(invoice)}
        onIssueReplacement={(invoice) => setReplacementFor(invoice)}
        onDownloadClearedXml={handleDownloadClearedXml}
        canSubmitToZatca={user?.actorType === 'COMPANY'}
        submittingId={submittingId}
      />
      {creditNoteFor && <CreditNoteModal invoice={creditNoteFor} onCancel={() => setCreditNoteFor(null)} onConfirm={handleIssueCreditNote} />}
      {debitNoteFor && <DebitNoteModal invoice={debitNoteFor} onCancel={() => setDebitNoteFor(null)} onConfirm={handleIssueDebitNote} />}
      {replacementFor && (
        <ConfirmModal
          title={t('invoices.page.replacement_title')}
          body={t('invoices.page.replacement_body', {
            no: replacementFor.no,
            tail: replacementFor.customer.vatNumber ? t('invoices.page.replacement_standard') : t('invoices.page.replacement_simplified'),
          })}
          confirmLabel={t('invoices.page.replacement_confirm')}
          onCancel={() => setReplacementFor(null)}
          onConfirm={confirmReplacement}
        />
      )}
      {pendingSubmit && (
        <ConfirmModal
          title={t('invoices.page.submit_title')}
          body={t('invoices.page.submit_body', { no: pendingSubmit.no })}
          confirmLabel={t('invoices.page.submit_confirm')}
          onCancel={() => setPendingSubmit(null)}
          onConfirm={confirmSubmit}
        />
      )}
      {submitError && (
        <ConfirmModal title={t('invoices.page.submit_failed_title')} body={submitError} confirmLabel={t('invoices.page.ok')} hideCancel onCancel={() => setSubmitError(null)} onConfirm={() => setSubmitError(null)} />
      )}
    </>
  );
}
