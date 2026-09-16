import { useEffect, useState } from 'react';
import { listBranches, type Branch } from '../../api/branches';
import { useLocation } from 'react-router-dom';
import { createCustomer, listCustomers, type Customer } from '../../api/customers';
import { apiErrorCode } from '../../lib/apiError';
import {
  CREDIT_LIMIT_EXCEEDED,
  createInvoice,
  type Invoice,
  type InvoiceLineInput,
  type InvoiceStatus,
  issueCreditNote,
  issueDebitNote,
  issueReplacement,
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

/** البنّاءُ للإنشاء وحدَه: الصادرُ لا يُعدَّل ولا يُحذف (ق-٩٤٣) — والمخرجُ الإشعاران. */
type View = { mode: 'list' } | { mode: 'builder' };

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
  const [view, setView] = useState<View>((location.state as { openBuilder?: boolean } | null)?.openBuilder ? { mode: 'builder' } : { mode: 'list' });
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * مسوّدةُ الفاتورة المرفوضة **لتجاوزٍ ممكن** — تُحفظ لتُعاد بتصريح.
   *
   * ⚠️ **وتُحفظ المسوّدةُ لا علَمٌ منطقيّ**: التاجرُ ما زال في المُنشئ وبياناتُه
   * فيه، **وإعادةُ الإرسال تحتاج ما أُرسل بعينه** — فلو حُفظ علَمٌ وحده لوجب
   * على المُنشئ أن يُرسل ثانيةً، **وهو ما لا يقع ما دام الخطأُ مُلتقَطاً هنا**.
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

  /**
   * ⚖️ بدلٌ عن مردودة (ق-٩٥٨): الخادمُ ينسخ البيعَ كلَّه من المردودة ويُغلقها — لا بنودَ
   * تُرسَل. وتُرسَل ساعةُ الجهاز كما في الإنشاء (ق-١٨٥) للقياسية التي يُحدَّث تاريخُها.
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
      setSubmitError(Array.isArray(data?.message) ? data.message.join(' — ') : (data?.message ?? 'تعذّر إصدار البدل'));
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
  /**
   * ⚖️ **ورفضُ حدّ الائتمان يُعرض بزرِّ تجاوزٍ لا بـ«حسناً» وحدها** (`ق-٣٣٩`).
   *
   * **الرسالةُ تحمل الحدَّ والقائمَ والمطلوب**، فيقرؤها التاجر **ثم يقرّر**.
   * ⚠️ **ولا يُرسَل التصريحُ مع أول طلب**: تصريحٌ مسبقٌ يجعل الحدَّ زخرفةً —
   * وهو عينُ «شيءٍ يُرى ولا يفعل» الذي بُنيت الميزةُ لعلاجه.
   *
   * ⚠️ **والزرُّ يُعرض على `CREDIT_LIMIT_EXCEEDED` وحده**: المنعُ الصلب ورفضُ
   * الصلاحية **يُقرآن ولا زرَّ لهما** — **وزرٌّ يُعرض ويُرفض دائماً أسوأ من
   * غيابه**، فيُقرأ النظامُ عابثاً.
   */
  async function handleSave(
    data: { customerId: string; issueDate: string; issuedAt?: string; issuedOffsetMin?: number; dueDate: string; notes: string; branchId: string; lines: { description: string; quantity: number; unitPrice: number; taxRate: number }[] },
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
      setSaveError(Array.isArray(body?.message) ? body.message.join(' — ') : (body?.message ?? 'تعذّر حفظ الفاتورة'));
      // **الرمزُ يقرّر لا نصُّ الرسالة** — فالنصُّ مترجَمٌ ويتغيّر بلا شكوى.
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
          <ConfirmModal title="تعذّر الحفظ" body={saveError} confirmLabel="حسناً" hideCancel onCancel={() => setSaveError(null)} onConfirm={() => setSaveError(null)} />
        )}
        {saveError && overridable && (
          <ConfirmModal
            title="تجاوز حدّ الائتمان؟"
            body={saveError}
            confirmLabel="تجاوز وإصدار — ويُسجَّل باسمك"
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
        onChangeStatus={handleChangeStatus}
        onSubmitToZatca={(invoice) => setPendingSubmit(invoice)}
        onIssueCreditNote={(invoice) => setCreditNoteFor(invoice)}
        onIssueDebitNote={(invoice) => setDebitNoteFor(invoice)}
        onIssueReplacement={(invoice) => setReplacementFor(invoice)}
        canSubmitToZatca={user?.actorType === 'COMPANY'}
        submittingId={submittingId}
      />
      {creditNoteFor && <CreditNoteModal invoice={creditNoteFor} onCancel={() => setCreditNoteFor(null)} onConfirm={handleIssueCreditNote} />}
      {debitNoteFor && <DebitNoteModal invoice={debitNoteFor} onCancel={() => setDebitNoteFor(null)} onConfirm={handleIssueDebitNote} />}
      {replacementFor && (
        <ConfirmModal
          title="إصدار بدل عن الفاتورة المردودة"
          body={`تُغلق الفاتورة ${replacementFor.no} كما هي (عدّادها وتجزئتها لا يُمسّان)، ويصدر بدلها مستند جديد برقم جديد بالبنود نفسها؛ يُعكس قيدها وتعود بضاعتها إلى الرفّ ثم تُخصم للبدل، ويُنقل ما قُبض عليها إلى البدل ويُسجَّل النقل باسمك. ${replacementFor.customer.vatNumber ? 'فاتورة قياسية: يحمل البدل تاريخ اليوم.' : 'فاتورة مبسَّطة: يحتفظ البدل بتاريخ المعاملة الأصلي ولا يُعاد للعميل.'}`}
          confirmLabel="إصدار البدل"
          onCancel={() => setReplacementFor(null)}
          onConfirm={confirmReplacement}
        />
      )}
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
    </>
  );
}
