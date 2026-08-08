import { useEffect, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { useLocation } from 'react-router-dom';
import { createCustomer, listCustomers, type Customer } from '../../api/customers';
import {
  createInvoice,
  deleteInvoice,
  type Invoice,
  type InvoiceLineInput,
  type InvoiceStatus,
  issueCreditNote,
  issueDebitNote,
  listInvoices,
  updateInvoice,
} from '../../api/invoices';
import { submitInvoiceToZatca } from '../../api/zatca';
import { useAuth } from '../../auth/AuthContext';
import { today } from '../../lib/format';
import { ConfirmModal } from '../../components/ConfirmModal';
import { CreditNoteModal } from './CreditNoteModal';
import { DebitNoteModal } from './DebitNoteModal';
import { InvoiceBuilderView } from './InvoiceBuilderView';
import { InvoiceListView } from './InvoiceListView';

type View = { mode: 'list' } | { mode: 'builder'; editing: Invoice | null };

export function InvoicesPage() {
  const location = useLocation();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  // Dashboard's "+ فاتورة جديدة" navigates here with this nav state to jump
  // straight into the builder, matching the mockup's goTo('invoice');
  // showInvoiceBuilder() combo.
  const [view, setView] = useState<View>((location.state as { openBuilder?: boolean } | null)?.openBuilder ? { mode: 'builder', editing: null } : { mode: 'list' });
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<Invoice | null>(null);
  const [creditNoteFor, setCreditNoteFor] = useState<Invoice | null>(null);
  const [debitNoteFor, setDebitNoteFor] = useState<Invoice | null>(null);
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
   * The server refuses to delete an invoice that entered the ZATCA chain
   * (409) — that refusal must reach the user as its Arabic reason, not
   * disappear as an unhandled rejection leaving the row silently in place.
   */
  async function confirmDelete() {
    if (!pendingDelete) return;
    const invoice = pendingDelete;
    setPendingDelete(null);
    try {
      await deleteInvoice(invoice.id);
    } catch (e) {
      const data = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setDeleteError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر حذف الفاتورة'));
    }
    await reload();
  }

  async function handleChangeStatus(invoice: Invoice, status: InvoiceStatus) {
    await updateInvoice(invoice.id, { status });
    await reload();
  }

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
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إرسال الفاتورة'));
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
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إصدار إشعار الدائن'));
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
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إصدار الإشعار المدين'));
    } finally {
      await reload();
    }
  }

  async function handleCreateCustomer(name: string): Promise<Customer> {
    const customer = await createCustomer({ name });
    setCustomers((cs) => [...cs, customer].sort((a, b) => a.name.localeCompare(b.name)));
    return customer;
  }

  /**
   * The server refuses to edit the content of an invoice that entered the
   * ZATCA chain (409) — the builder posts the whole document, so that refusal
   * covers this screen. Show its Arabic reason and **stay in the builder**:
   * closing back to the list would throw away everything the user typed for a
   * save that never happened.
   */
  async function handleSave(data: { customerId: string; issueDate: string; dueDate: string; notes: string; branchId: string; lines: { description: string; quantity: number; unitPrice: number; taxRate: number }[] }) {
    // An empty picker means company-wide — send it as omitted, not as ''.
    const payload = { ...data, branchId: data.branchId || undefined };
    setSaveError(null);
    try {
      if (view.mode === 'builder' && view.editing) {
        await updateInvoice(view.editing.id, payload);
      } else {
        await createInvoice(payload);
      }
    } catch (e) {
      const body = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data;
      setSaveError(Array.isArray(body?.message) ? body.message.join(' — ') : (body?.message ?? 'تعذّر حفظ الفاتورة'));
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
          editing={view.editing}
          nextNumberHint={`INV-${new Date().getFullYear()}-${String(invoices.filter((i) => i.docType === 'INVOICE').length + 1).padStart(4, '0')}`}
          onCancel={() => setView({ mode: 'list' })}
          onSave={handleSave}
          onCreateCustomer={handleCreateCustomer}
        />
        {saveError && (
          <ConfirmModal title="تعذّر الحفظ" body={saveError} confirmLabel="حسناً" hideCancel onCancel={() => setSaveError(null)} onConfirm={() => setSaveError(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <InvoiceListView
        invoices={invoices}
        onNew={() => setView({ mode: 'builder', editing: null })}
        onEdit={(invoice) => setView({ mode: 'builder', editing: invoice })}
        onDelete={(invoice) => setPendingDelete(invoice)}
        onChangeStatus={handleChangeStatus}
        onSubmitToZatca={(invoice) => setPendingSubmit(invoice)}
        onIssueCreditNote={(invoice) => setCreditNoteFor(invoice)}
        onIssueDebitNote={(invoice) => setDebitNoteFor(invoice)}
        canSubmitToZatca={user?.actorType === 'COMPANY'}
        submittingId={submittingId}
      />
      {creditNoteFor && <CreditNoteModal invoice={creditNoteFor} onCancel={() => setCreditNoteFor(null)} onConfirm={handleIssueCreditNote} />}
      {debitNoteFor && <DebitNoteModal invoice={debitNoteFor} onCancel={() => setDebitNoteFor(null)} onConfirm={handleIssueDebitNote} />}
      {pendingSubmit && (
        <ConfirmModal
          title="إرسال الفاتورة لهيئة الزكاة"
          body={`إرسال الفاتورة ${pendingSubmit.no} للتصديق؟ لا يمكن سحب الفاتورة بعد تصديقها.`}
          confirmLabel="إرسال"
          onCancel={() => setPendingSubmit(null)}
          onConfirm={confirmSubmit}
        />
      )}
      {submitError && (
        <ConfirmModal title="تعذّر الإرسال" body={submitError} confirmLabel="حسناً" hideCancel onCancel={() => setSubmitError(null)} onConfirm={() => setSubmitError(null)} />
      )}
      {pendingDelete && (
        <ConfirmModal
          title="حذف الفاتورة"
          body={`حذف الفاتورة ${pendingDelete.no}؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
      {deleteError && (
        <ConfirmModal title="تعذّر الحذف" body={deleteError} confirmLabel="حسناً" hideCancel onCancel={() => setDeleteError(null)} onConfirm={() => setDeleteError(null)} />
      )}
    </>
  );
}
