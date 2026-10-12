import type { InvoiceStatus } from '../../api/invoices';
// The authority's status type comes from its generated module, not the general invoices file.
import type { ZatcaInvoiceStatus } from '@mad-app/shared/api/zatca-enums';
import i18n from '../../i18n';

/** A badge whose label is read in the current language each time it is shown. */
const badge = (key: string, badgeClass: string) => ({
  get label() {
    return i18n.t(key);
  },
  badgeClass,
});

export const STATUS_META: Record<InvoiceStatus, { label: string; badgeClass: string }> = {
  DUE: badge('invoices.status.due', 'due'),
  // PARTIAL was once missing here, which made every badge reading it crash.
  PARTIAL: badge('invoices.status.partial', 'due'),
  PAID: badge('invoices.status.paid', 'paid'),
  OVERDUE: badge('invoices.status.overdue', 'overdue'),
};

/** PARTIAL is left out on purpose: it is derived from allocations and never set by hand.
 *  The list only orders the statuses for display. */
export const STATUS_ORDER: InvoiceStatus[] = ['DUE', 'PAID', 'OVERDUE'];

/** Clearance state with the authority, separate from the payment status above:
 *  a paid invoice may be uncleared, and a cleared one unpaid. */
export const ZATCA_STATUS_META: Record<ZatcaInvoiceStatus, { label: string; badgeClass: string }> = {
  NOT_SUBMITTED: badge('invoices.einvoice_status.not_submitted', ''),
  SUBMITTING: badge('invoices.einvoice_status.submitting', 'due'),
  STAMPED: badge('invoices.einvoice_status.stamped', 'due'),
  CLEARED: badge('invoices.einvoice_status.cleared', 'paid'),
  REJECTED: badge('invoices.einvoice_status.rejected', 'overdue'),
};
