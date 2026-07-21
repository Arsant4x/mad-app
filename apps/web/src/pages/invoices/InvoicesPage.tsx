import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { createCustomer, listCustomers, type Customer } from '../../api/customers';
import { createInvoice, deleteInvoice, type Invoice, type InvoiceStatus, listInvoices, updateInvoice } from '../../api/invoices';
import { ConfirmModal } from '../../components/ConfirmModal';
import { InvoiceBuilderView } from './InvoiceBuilderView';
import { InvoiceListView } from './InvoiceListView';

type View = { mode: 'list' } | { mode: 'builder'; editing: Invoice | null };

export function InvoicesPage() {
  const location = useLocation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  // Dashboard's "+ فاتورة جديدة" navigates here with this nav state to jump
  // straight into the builder, matching the mockup's goTo('invoice');
  // showInvoiceBuilder() combo.
  const [view, setView] = useState<View>((location.state as { openBuilder?: boolean } | null)?.openBuilder ? { mode: 'builder', editing: null } : { mode: 'list' });
  const [pendingDelete, setPendingDelete] = useState<Invoice | null>(null);

  async function reload() {
    const [inv, cust] = await Promise.all([listInvoices(), listCustomers()]);
    setInvoices(inv);
    setCustomers(cust);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    await deleteInvoice(pendingDelete.id);
    setPendingDelete(null);
    await reload();
  }

  async function handleChangeStatus(invoice: Invoice, status: InvoiceStatus) {
    await updateInvoice(invoice.id, { status });
    await reload();
  }

  async function handleCreateCustomer(name: string): Promise<Customer> {
    const customer = await createCustomer({ name });
    setCustomers((cs) => [...cs, customer].sort((a, b) => a.name.localeCompare(b.name)));
    return customer;
  }

  async function handleSave(data: { customerId: string; issueDate: string; dueDate: string; notes: string; lines: { description: string; quantity: number; unitPrice: number; taxRate: number }[] }) {
    if (view.mode === 'builder' && view.editing) {
      await updateInvoice(view.editing.id, data);
    } else {
      await createInvoice(data);
    }
    setView({ mode: 'list' });
    await reload();
  }

  if (loading) return null;

  if (view.mode === 'builder') {
    return (
      <InvoiceBuilderView
        customers={customers}
        editing={view.editing}
        nextNumberHint={`INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, '0')}`}
        onCancel={() => setView({ mode: 'list' })}
        onSave={handleSave}
        onCreateCustomer={handleCreateCustomer}
      />
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
      />
      {pendingDelete && (
        <ConfirmModal
          title="حذف الفاتورة"
          body={`حذف الفاتورة ${pendingDelete.no}؟ لا يمكن التراجع عن هذا الإجراء.`}
          confirmLabel="حذف"
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </>
  );
}
