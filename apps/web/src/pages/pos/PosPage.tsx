import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listProducts, type Product } from '../../api/products';
import { listBranches, type Branch } from '../../api/branches';
import { rateForCategory } from '../../lib/vat';
import { BranchPicker } from '../../components/BranchPicker';
import {
  chargePaymentAttempt,
  closeShift,
  createPaymentAttempt,
  getCurrentShift,
  getPaymentMode,
  listCardVerifications,
  listOpenPaymentAttempts,
  openShift,
  resolvePaymentAttempt,
  resolvePaymentAttemptWithEvidence,
  syncPosSale,
  type CardVerificationList,
  type ClosedShift,
  type PosPaymentAttempt,
  type PosPaymentMethod,
  type PosPaymentMode,
  type PosPaymentPart,
  type PosSaleInput,
  type PosSaleResponse,
  type PosShift,
} from '../../api/pos';
import { useAuth } from '../../auth/AuthContext';
import { usePermissions } from '../../auth/PermissionsContext';
import {
  cachePaymentMode,
  cacheProducts,
  cacheSellerProfile,
  enqueueSale,
  isNetworkError,
  newClientSaleId,
  newOfflineRef,
  readCachedPaymentMode,
  readCachedProducts,
  readCachedSellerProfile,
  readQueue,
  removeFromQueue,
  wireSaleOf,
  type QueuedSale,
} from '../../lib/posQueue';
import { getCompanyProfile } from '../../api/companyProfile';
import { ZatcaQr } from '../../components/ZatcaQr';
import { buildPhase1Qr } from '../../lib/zatcaQr';
import { wallClockOf } from '../../lib/wallClock';
import { fmt } from '../../lib/format';
import { documentTotals, num0, round2, roundProduct, type QtyText } from '../../lib/money';
import { formatDateTime } from '../../i18n/format';

interface CartLine {
  product: Product;
  quantity: number;
  /** Line discount as an amount (zero when absent). */
  discount: number;
}

/** A sale rung on this device: its moment, clock offset and temporary reference set the invoice day and receipt stamp. */
type RungSale = PosSaleInput & { offlineRef: string; ringAt: string; ringOffsetMin: number };

/** The server's message as is; validation returns an array, which is joined. */
function messageOf(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : (m ?? fallback);
}

/** Payment attempt status as the cashier reads it (translation keys). */
const ATTEMPT_LABEL_KEY: Record<PosPaymentAttempt['status'], string> = {
  CREATED: 'pos.attempt.created',
  CHARGING: 'pos.attempt.charging',
  APPROVED: 'pos.attempt.approved',
  COMPLETED: 'pos.attempt.completed',
  DECLINED: 'pos.attempt.declined',
  UNKNOWN: 'pos.attempt.unknown',
  CANCELLED: 'pos.attempt.cancelled',
};

/**
 * Cashier screen.
 *
 * Touch first: large buttons, one search/barcode field, a cart, and two pay
 * buttons. A sale issues a real paid invoice on the normal invoice numbering,
 * and the drawer is computed on the server.
 */
export function PosPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const companyId = user?.companyId ?? '';
  const [shift, setShift] = useState<PosShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [floatInput, setFloatInput] = useState('');
  const [branchInput, setBranchInput] = useState('');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PosSaleResponse | null>(null);
  const [closing, setClosing] = useState(false);
  const [declared, setDeclared] = useState('');
  const [closed, setClosed] = useState<ClosedShift | null>(null);
  const [offline, setOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [offlineReceipt, setOfflineReceipt] = useState<QueuedSale | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  /** Lines whose stock went below zero with this sale: a soft warning on the receipt, never a block. */
  const [stockWarnings, setStockWarnings] = useState<{ name: string; resultingQty: QtyText }[]>([]);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ───── Card payment attempts ─────
  const { can } = usePermissions();
  // Opening a shift, selling and querying an attempt record; closing the shift and resolving with evidence review.
  const canRecord = can('pos', 'record');
  const canReview = can('pos', 'review');
  /** Whether the gateway link is active: it picks the path, an attempt through the provider or a direct sale. */
  const [paymentMode, setPaymentMode] = useState<PosPaymentMode | null>(null);
  /** The attempt that locks the cart until it is resolved ("do not charge again"). */
  const [pendingAttempt, setPendingAttempt] = useState<PosPaymentAttempt | null>(null);
  /** Unresolved attempts in the shift, which the cashier can check. */
  const [openAttempts, setOpenAttempts] = useState<PosPaymentAttempt[]>([]);
  /**
   * A card sale waiting for the terminal reference from its receipt, either
   * offline with the link active, or on a standalone terminal with no link.
   * The first is queued locally; the second is sent now with its reference.
   */
  const [deviceRefFor, setDeviceRefFor] = useState<RungSale | null>(null);
  const [deviceRefMode, setDeviceRefMode] = useState<'offline' | 'standalone'>('offline');
  const [deviceRef, setDeviceRef] = useState('');
  /** Manual resolution with evidence, for a reviewer. */
  const [evidenceFor, setEvidenceFor] = useState<PosPaymentAttempt | null>(null);
  const [evidence, setEvidence] = useState({ deviceReference: '', approvalCode: '', note: '' });
  /** Unverified card payments, for review. */
  const [verifications, setVerifications] = useState<CardVerificationList | null>(null);

  async function reload() {
    try {
      const [s, p, mode, attempts] = await Promise.all([getCurrentShift(), listProducts(), getPaymentMode(), listOpenPaymentAttempts()]);
      setShift(s);
      setProducts(p);
      cacheProducts(companyId, p);
      setPaymentMode(mode);
      cachePaymentMode(companyId, mode);
      setOpenAttempts(attempts.filter((a) => a.shiftId === s?.id));
      setOffline(false);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // Offline: sell from the last known catalog, keep the shift in memory, and use the last known payment mode.
      setProducts((prev) => (prev.length ? prev : readCachedProducts(companyId)));
      setPaymentMode((prev) => prev ?? readCachedPaymentMode(companyId));
      setOffline(true);
    }
    // Separate from the block above: a branch failure must not break offline
    // selling, and retrying on every reload means an outage at open time does
    // not hide the picker for the rest of the day. Hiding it silently would mean
    // a shift with no branch, i.e. sales with no stock deduction.
    try {
      setBranches(await listBranches());
    } catch {
      /* With no known branches the picker hides and the shift opens at company level. */
    }
    // The company profile is cached on every successful connection so the
    // offline receipt code has the legal name and VAT number when there is no
    // server. A failure keeps the last cached copy.
    try {
      const profile = await getCompanyProfile();
      cacheSellerProfile(companyId, { legalName: profile.legalName, vatNumber: profile.vatNumber });
    } catch {
      /* Offline or no profile yet: the last cached copy stays, and its absence is flagged on the receipt. */
    }
    setQueueCount(readQueue(companyId).length);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Flush the queue: every queued sale is resent; the server absorbs duplicates safely. */
  async function flushQueue() {
    const queue = readQueue(companyId);
    for (const sale of queue) {
      try {
        // Only the sale fields go on the wire; display fields are for the temporary receipt and the server rejects unknown fields.
        await syncPosSale(wireSaleOf(sale));
        removeFromQueue(companyId, sale.clientSaleId);
      } catch (e) {
        if (isNetworkError(e)) return; // Still offline; try later.
        // A real rejection (such as a closed shift): it stays queued and is shown to the user.
        const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
        setError(d?.message ?? t('pos.errors.sync_failed'));
        return;
      }
    }
    setQueueCount(readQueue(companyId).length);
    if (queue.length) await reload();
  }

  useEffect(() => {
    const timer = setInterval(flushQueue, 12000);
    window.addEventListener('online', flushQueue);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', flushQueue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q) || (p.barcode ?? '').includes(q));
  }, [products, query]);

  const totals = useMemo(
    () =>
      // The server's totals function: the line net after its discount (BT-131), and VAT per category and rate on
      // the sum of the nets. The offline receipt code and the split are built from these, so they match the server.
      documentTotals(
        cart.map((l) => {
          const unitPrice = Number(l.product.price);
          return {
            quantity: l.quantity,
            unitPrice,
            // A discount above the line shows a zero net; the server refuses it.
            discount: Math.min(l.discount || 0, roundProduct(l.quantity, unitPrice)),
            taxRate: rateForCategory(l.product.taxCategory),
            taxCategory: l.product.taxCategory,
            taxExemptionReasonCode: l.product.taxExemptionReasonCode,
            taxExemptionReason: l.product.taxExemptionReason,
          };
        }),
      ),
    [cart],
  );

  function setDiscount(id: string, discount: number) {
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, discount } : l)));
  }

  function addToCart(p: Product) {
    setCart((prev) => {
      const hit = prev.find((l) => l.product.id === p.id);
      if (hit) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product: p, quantity: 1, discount: 0 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.flatMap((l) => (l.product.id === id ? (l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]) : [l])));
  }

  /** Barcode: Enter with exactly one match adds it and clears the search. */
  function handleSearchEnter() {
    if (visible.length === 1) {
      addToCart(visible[0]);
      setQuery('');
      searchRef.current?.focus();
    }
  }

  /**
   * Every sale, online or offline, carries a client id from the moment it is
   * rung: one path, and the server absorbs any repeat, so nothing is lost or
   * doubled. A payment attempt carries the same id.
   */
  function ringSale(method: PosPaymentMethod, payments?: PosPaymentPart[]): RungSale {
    return {
      clientSaleId: newClientSaleId(),
      offlineRef: newOfflineRef(),
      ringAt: new Date().toISOString(),
      // The device offset with the moment: the invoice day and time are the merchant's, not UTC.
      ringOffsetMin: -new Date().getTimezoneOffset(),
      lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, ...(l.discount > 0 ? { discount: l.discount } : {}) })),
      paymentMethod: method,
      ...(payments ? { payments } : {}),
    };
  }

  /** The card part of the sale: all of it for a card sale, or the card part of a split. */
  function cardPartOf(sale: PosSaleInput): number {
    if (sale.paymentMethod === 'CARD') return totals.total;
    if (sale.paymentMethod === 'SPLIT') return (sale.payments ?? []).filter((p) => p.method === 'CARD').reduce((s, p) => s + p.amount, 0);
    return 0;
  }

  async function pay(method: PosPaymentMethod, payments?: PosPaymentPart[]) {
    if (!cart.length || paying || pendingAttempt) return;
    const sale = ringSale(method, payments);
    // With the link active a card goes through a provider attempt; offline it needs the terminal reference from its receipt.
    if (paymentMode?.active && cardPartOf(sale) > 0) {
      if (offline) {
        setDeviceRef('');
        setDeviceRefMode('offline');
        setDeviceRefFor(sale);
        return;
      }
      await payByAttempt(sale);
      return;
    }
    // With no link, a standalone terminal: the reference from its receipt, as for an offline card sale, never the cashier's word alone.
    if (!paymentMode?.active && cardPartOf(sale) > 0) {
      setDeviceRef('');
      setDeviceRefMode('standalone');
      setDeviceRefFor(sale);
      return;
    }
    setPaying(true);
    setError(null);
    try {
      await completed(await syncPosSale(sale));
    } catch (e) {
      if (isNetworkError(e)) queueOffline(sale);
      else setError(messageOf(e, t('pos.errors.sale_failed')));
    } finally {
      setPaying(false);
    }
  }

  /**
   * Payment attempt: created with no invoice, then charged outside the
   * transaction. Approved gives a receipt; declined shows the reason and keeps
   * the cart; no answer leaves it pending ("do not charge again") with the cart
   * locked until it is resolved.
   */
  async function payByAttempt(sale: RungSale) {
    setPaying(true);
    setError(null);
    let attempt: PosPaymentAttempt;
    try {
      attempt = await createPaymentAttempt(sale);
    } catch (e) {
      setPaying(false);
      // Nothing was charged; the connection dropped before the attempt, so this becomes an offline card sale with the terminal reference.
      if (isNetworkError(e)) {
        setOffline(true);
        setDeviceRef('');
        setDeviceRefMode('offline');
        setDeviceRefFor(sale);
      } else {
        setError(messageOf(e, t('pos.errors.attempt_start_failed')));
      }
      return;
    }
    setPendingAttempt({ ...attempt, status: 'CHARGING' });
    try {
      await applyAttempt(await chargePaymentAttempt(attempt.id), sale);
    } catch (e) {
      // The request is at the provider or on its way: do not charge again; check its status when the connection returns.
      if (isNetworkError(e)) setError(t('pos.errors.connection_lost_charging'));
      else {
        setPendingAttempt(null);
        setError(messageOf(e, t('pos.errors.charge_failed')));
      }
    } finally {
      setPaying(false);
    }
  }

  /** Where the attempt ended: completed gives a receipt, declined gives the reason, otherwise it keeps the cart locked. */
  async function applyAttempt(attempt: PosPaymentAttempt, sale?: PosSaleInput) {
    if (attempt.status === 'COMPLETED' && attempt.sale) {
      setPendingAttempt(null);
      await completed(attempt.sale);
      return;
    }
    if (attempt.status === 'DECLINED' || attempt.status === 'CANCELLED') {
      setPendingAttempt(null);
      const split = (sale?.paymentMethod ?? attempt.paymentMethod) === 'SPLIT';
      setError(t('pos.errors.card_declined', { reason: attempt.declineReason ?? '—' }) + (split ? t('pos.errors.card_declined_split') : ''));
      await refreshAttempts();
      return;
    }
    setPendingAttempt(attempt);
    await refreshAttempts();
  }

  async function refreshAttempts() {
    try {
      const all = await listOpenPaymentAttempts();
      setOpenAttempts(all.filter((a) => a.shiftId === shift?.id));
    } catch {
      /* Offline: refreshed on the next successful load. */
    }
  }

  /** The provider's answer first: querying by reference does not charge again. */
  async function queryAttempt(a: PosPaymentAttempt) {
    setError(null);
    try {
      await applyAttempt(await resolvePaymentAttempt(a.id));
    } catch (e) {
      setError(messageOf(e, t('pos.errors.query_failed')));
    }
  }

  /** Manual resolution by evidence, not by word: the terminal reference and approval code from its receipt. */
  async function submitEvidence() {
    if (!evidenceFor) return;
    setError(null);
    try {
      const out = await resolvePaymentAttemptWithEvidence(evidenceFor.id, {
        deviceReference: evidence.deviceReference.trim(),
        approvalCode: evidence.approvalCode.trim(),
        ...(evidence.note.trim() ? { note: evidence.note.trim() } : {}),
      });
      setEvidenceFor(null);
      setEvidence({ deviceReference: '', approvalCode: '', note: '' });
      await applyAttempt(out);
    } catch (e) {
      setError(messageOf(e, t('pos.errors.resolve_failed')));
    }
  }

  /**
   * A card sale with the terminal reference, never without it: offline it is
   * queued locally; on a standalone terminal it is sent now with its reference
   * (and queued with it if the connection drops on the way).
   */
  async function confirmDeviceRef() {
    if (!deviceRefFor) return;
    const reference = deviceRef.trim();
    if (!reference) {
      setError(t('pos.errors.device_ref_required'));
      return;
    }
    const sale = deviceRefFor;
    setDeviceRefFor(null);
    setDeviceRef('');
    if (deviceRefMode === 'offline') {
      queueOffline(sale, reference);
      return;
    }
    setPaying(true);
    setError(null);
    try {
      await completed(await syncPosSale({ ...sale, cardDeviceReference: reference }));
    } catch (e) {
      if (isNetworkError(e)) queueOffline(sale, reference);
      else setError(messageOf(e, t('pos.errors.sale_failed')));
    } finally {
      setPaying(false);
    }
  }

  async function openVerifications(state: 'open' | 'overdue' | 'matched' | 'all' = 'open') {
    setError(null);
    try {
      setVerifications(await listCardVerifications(state));
    } catch (e) {
      setError(messageOf(e, t('pos.errors.verifications_failed')));
    }
  }

  /** What is shown after a completed sale; shared by the direct sale and the payment attempt. */
  async function completed(invoice: PosSaleResponse) {
    // The server returns only ids in belowZero; names are resolved from the cart before it is cleared.
    const deduction = invoice.stockDeduction;
    if (deduction?.deducted && deduction.belowZero.length > 0) {
      const nameById = new Map(cart.map((l) => [l.product.id, l.product.name]));
      setStockWarnings(deduction.belowZero.map((b) => ({ name: nameById.get(b.productId) ?? b.productId, resultingQty: b.resultingQty })));
    } else {
      setStockWarnings([]);
    }
    // Skipping the deduction is intended, not an error: only a faint hint for a
    // shift on a branch with no linked warehouse (no hint for a shift with no
    // branch, or a cart of services only).
    setStockNotice(deduction?.deducted === false && deduction.reason === 'NO_BRANCH_WAREHOUSE' && shift?.branchId ? t('pos.stock_not_deducted') : null);
    setCart([]);
    setReceipt(invoice);
    await reload();
  }

  /**
   * Offline: the sale is queued locally with a temporary receipt and syncs on
   * its own later; a card sale with the link active carries the terminal
   * reference. The ZATCA code is built here, on the device, with no keys: the
   * five tags come from the cached company profile and the same device clock
   * the server will use for the compliant invoice, so the receipt stamp matches
   * the coming document exactly.
   */
  function queueOffline(sale: RungSale, cardDeviceReference?: string) {
    const seller = readCachedSellerProfile(companyId);
    const queued: QueuedSale = {
      clientSaleId: sale.clientSaleId,
      offlineRef: sale.offlineRef,
      ringAt: sale.ringAt,
      ringOffsetMin: sale.ringOffsetMin,
      lines: sale.lines,
      paymentMethod: sale.paymentMethod,
      ...(sale.payments ? { payments: sale.payments } : {}),
      ...(cardDeviceReference ? { cardDeviceReference } : {}),
      display: cart.map((l) => ({ name: l.product.name, quantity: l.quantity, unitPrice: Number(l.product.price) })),
      total: totals.total,
      vatAmount: totals.tax,
      zatcaQr: buildPhase1Qr({
        sellerName: seller?.legalName,
        vatNumber: seller?.vatNumber,
        issued: wallClockOf(new Date(sale.ringAt), sale.ringOffsetMin),
        total: totals.total,
        vatAmount: totals.tax,
      }),
    };
    enqueueSale(companyId, queued);
    setQueueCount(readQueue(companyId).length);
    setOffline(true);
    setCart([]);
    setOfflineReceipt(queued);
  }

  /** Split: the cashier enters the cash, and the card covers the rest. */
  async function confirmSplit() {
    const cash = Number(splitCash || '0');
    const card = round2(totals.total - cash);
    if (cash <= 0 || card <= 0) {
      setError(t('pos.errors.split_invalid'));
      return;
    }
    setSplitting(false);
    setSplitCash('');
    await pay('SPLIT', [
      { method: 'CASH', amount: cash },
      { method: 'CARD', amount: card },
    ]);
  }

  async function handleOpenShift() {
    setError(null);
    try {
      // The shift branch sets the deduction warehouse (Branch.warehouseId); with
      // no branch the sale goes ahead with no stock deduction, on purpose.
      await openShift(Number(floatInput || '0'), branchInput || undefined);
      setFloatInput('');
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('pos.errors.open_shift_failed'));
    }
  }

  async function handleCloseShift() {
    if (!shift) return;
    // The drawer is not closed while queued sales have not arrived; the count would be short.
    if (readQueue(companyId).length > 0) {
      setError(t('pos.errors.unsynced_sales'));
      return;
    }
    setError(null);
    try {
      const res = await closeShift(shift.id, Number(declared || '0'));
      setClosing(false);
      setDeclared('');
      setClosed(res);
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? t('pos.errors.close_shift_failed'));
    }
  }

  if (loading) return null;

  // The variance arrives as signed text; read it as a number once before comparing and showing it.
  const closedVariance = closed ? num0(closed.variance) : 0;

  // ---- No shift: open card ----
  if (!shift) {
    return (
      <div>
        <div className="topbar">
          <div>
            <div className="page-title">{t('pos.title')}</div>
            <div className="page-sub">{t('pos.open.sub')}</div>
          </div>
        </div>
        {canRecord && (
        <div className="card" style={{ maxWidth: 420 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>
            {t('pos.open.card_title')}
          </div>
          <div className="field">
            <label>{t('pos.open.float_label')}</label>
            <input type="number" min="0" value={floatInput} onChange={(e) => setFloatInput(e.target.value)} placeholder="0.00" />
          </div>
          <BranchPicker branches={branches} value={branchInput} onChange={setBranchInput} label={t('pos.open.branch_label')} />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 16 }} onClick={handleOpenShift}>
            {t('pos.open.button')}
          </button>
        </div>
        )}

        {closed && (
          <div className="card" style={{ maxWidth: 420, marginTop: 14 }}>
            <div className="card-title">{t('pos.closed.title')}</div>
            <table>
              <tbody>
                <tr>
                  <td>{t('pos.closed.sales_count')}</td>
                  <td className="num">{closed.salesCount}</td>
                </tr>
                <tr>
                  <td>{t('pos.closed.cash')}</td>
                  <td className="num">{fmt(closed.cashTotal)}</td>
                </tr>
                <tr>
                  <td>{t('pos.closed.card')}</td>
                  <td className="num">{fmt(closed.cardTotal)}</td>
                </tr>
                <tr>
                  <td>{t('pos.closed.expected')}</td>
                  <td className="num">{fmt(closed.expectedCash)}</td>
                </tr>
                <tr>
                  <td>{t('pos.closed.counted')}</td>
                  <td className="num">{fmt(Number(closed.declaredClosing))}</td>
                </tr>
                <tr>
                  <td>
                    <b>{closedVariance === 0 ? t('pos.closed.match') : closedVariance > 0 ? t('pos.closed.over') : t('pos.closed.short')}</b>
                  </td>
                  <td className="num" style={{ color: closedVariance === 0 ? 'var(--emerald)' : 'var(--rose)', fontWeight: 700 }}>
                    {fmt(Math.abs(closedVariance))}
                  </td>
                </tr>
              </tbody>
            </table>
            {/* A pending attempt does not hold the shift: it is named here and moves to the matching list until resolved. */}
            {(closed.pendingAttempts ?? []).length > 0 && (
              <div data-testid="pos-closed-pending" style={{ marginTop: 10, fontSize: 13 }}>
                <b>{t('pos.closed.pending_title', { n: closed.pendingAttempts.length })}</b>
                {t('pos.closed.pending_body')}
                <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                  {closed.pendingAttempts.map((a) => (
                    <li key={a.id}>
                      <span className="num">{fmt(a.cardAmount)}</span> ·{' '}
                      {a.status === 'UNKNOWN' ? t('pos.closed.status_unknown') : a.status === 'CHARGING' ? t('pos.closed.status_charging') : t('pos.closed.status_approved')} ·{' '}
                      <span className="num">{a.createdAt.slice(0, 16).replace('T', ' ')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ---- Open shift: the cashier ----
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">{t('pos.title')}</div>
          <div className="page-sub">
            {t('pos.shift.sub', { name: shift.openedByName, n: shift.salesCount, expected: fmt(shift.expectedCash) })}
            {shift.branchId && <span className="badge draft" style={{ marginInlineStart: 8 }}>{branches.find((b) => b.id === shift.branchId)?.name ?? t('pos.shift.branch_fallback')}</span>}
            {offline && <span className="badge draft" style={{ marginInlineStart: 8 }}>{t('pos.shift.offline_badge')}</span>}
            {queueCount > 0 && <span className="badge draft" style={{ marginInlineStart: 8 }}>{t('pos.shift.queue_badge', { n: queueCount })}</span>}
          </div>
        </div>
        <div className="topbar-actions">
          {canReview && (
            <button className="btn btn-ghost" onClick={() => openVerifications('open')}>
              {t('pos.shift.unverified_cards')}
            </button>
          )}
          {canReview && (
            <button className="btn btn-ghost" onClick={() => setClosing(true)}>
              {t('pos.shift.close_button')}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, alignItems: 'start' }}>
        {/* Items */}
        <div className="card">
          <div className="search-box" style={{ marginBottom: 12, maxWidth: 'none' }}>
            <input
              ref={searchRef}
              autoFocus
              placeholder={t('pos.search_placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearchEnter()}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" />
            </svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, maxHeight: '60vh', overflowY: 'auto' }}>
            {visible.map((p) => (
              <button
                key={p.id}
                className="btn btn-ghost"
                style={{ padding: '14px 8px', display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--line)', minHeight: 84 }}
                onClick={() => addToCart(p)}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                <span className="num" style={{ color: 'var(--muted)' }}>
                  {fmt(Number(p.price))}
                </span>
              </button>
            ))}
            {visible.length === 0 && <div className="empty-state">{t('pos.no_match')}</div>}
          </div>
        </div>

        {/* Cart */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            {t('pos.cart.title')}
          </div>
          {cart.length === 0 && <div className="empty-state">{t('pos.cart.empty')}</div>}
          {cart.map((l) => (
            <div key={l.product.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.product.name}</div>
                <div className="num" style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {fmt(Number(l.product.price))} × {l.quantity}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => changeQty(l.product.id, -1)}>
                −
              </button>
              <span className="num" style={{ minWidth: 20, textAlign: 'center' }}>
                {l.quantity}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => changeQty(l.product.id, 1)}>
                +
              </button>
              <input
                className="num"
                aria-label={t('pos.cart.discount_aria', { name: l.product.name })}
                title={t('pos.cart.discount_title')}
                style={{ width: 64 }}
                value={l.discount || ''}
                placeholder={t('pos.cart.discount_placeholder')}
                onChange={(e) => setDiscount(l.product.id, Math.max(0, parseFloat(e.target.value) || 0))}
              />
            </div>
          ))}

          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>{t('pos.cart.subtotal')}</td>
                <td className="num">{fmt(totals.subtotal)}</td>
              </tr>
              <tr>
                <td>{t('pos.cart.tax')}</td>
                <td className="num">{fmt(totals.tax)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>{t('pos.cart.total')}</td>
                <td className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                  {fmt(totals.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {error && <p className="error-text">{error}</p>}
          {/* The cart is locked on its attempt until it is resolved ("do not charge again"). */}
          {pendingAttempt && (
            <div className="card" data-testid="pos-pending-attempt" style={{ marginTop: 10, border: '1px solid var(--amber, var(--line))' }}>
              <b>{t(ATTEMPT_LABEL_KEY[pendingAttempt.status])}</b>
              <p className="num" style={{ margin: '6px 0' }}>
                {fmt(pendingAttempt.cardAmount)}
                {pendingAttempt.status === 'CHARGING' && paymentMode?.deadlineMs ? t('pos.pending.deadline', { n: Math.round(paymentMode.deadlineMs / 1000) }) : ''}
              </p>
              {pendingAttempt.detail && <p className="hint">{pendingAttempt.detail}</p>}
              {pendingAttempt.status !== 'CHARGING' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {canRecord && (
                    <button className="btn btn-ghost btn-sm" onClick={() => queryAttempt(pendingAttempt)}>
                      {t('pos.pending.query')}
                    </button>
                  )}
                  {canReview && pendingAttempt.status === 'UNKNOWN' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEvidenceFor(pendingAttempt)}>
                      {t('pos.pending.evidence')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {canRecord && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" style={{ padding: 16, fontSize: 16 }} disabled={!cart.length || paying || !!pendingAttempt} onClick={() => pay('CASH')}>
                  {t('pos.pay.cash')}
                </button>
                <button className="btn btn-primary" style={{ padding: 16, fontSize: 16 }} disabled={!cart.length || paying || !!pendingAttempt} onClick={() => pay('CARD')}>
                  {t('pos.pay.card')}
                </button>
              </div>
              <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} disabled={!cart.length || paying || !!pendingAttempt} onClick={() => setSplitting(true)}>
                {t('pos.pay.split')}
              </button>
            </>
          )}
          {/* Unresolved attempts in the shift; the shift does not close while money is in transit. */}
          {openAttempts.filter((a) => a.id !== pendingAttempt?.id && a.status !== 'CREATED').length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="card-title" style={{ fontSize: 13 }}>{t('pos.open_attempts.title')}</div>
              {openAttempts
                .filter((a) => a.id !== pendingAttempt?.id && a.status !== 'CREATED')
                .map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="num" style={{ flex: 1, fontSize: 12 }}>
                      {fmt(a.cardAmount)} · {t(ATTEMPT_LABEL_KEY[a.status])}
                    </span>
                    {canRecord && (
                      <button className="btn btn-ghost btn-sm" onClick={() => queryAttempt(a)}>
                        {t('pos.open_attempts.query')}
                      </button>
                    )}
                    {canReview && a.status === 'UNKNOWN' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setEvidenceFor(a)}>
                        {t('pos.open_attempts.evidence')}
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Split payment */}
      {splitting && (
        <div className="overlay" onClick={() => setSplitting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <div className="modal-title">{t('pos.split.title')}</div>
              <button className="modal-close" onClick={() => setSplitting(false)}>✕</button>
            </div>
            <p className="num" style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }}>{fmt(totals.total)}</p>
            <div className="field">
              <label>{t('pos.split.cash_label')}</label>
              <input type="number" min="0" autoFocus value={splitCash} onChange={(e) => setSplitCash(e.target.value)} placeholder="0.00" />
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              {t('pos.split.card_rest')}<b className="num">{fmt(Math.max(0, totals.total - Number(splitCash || '0')))}</b>
            </p>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setSplitting(false)}>{t('pos.common.cancel')}</button>
              <button className="btn btn-primary" onClick={confirmSplit}>{t('pos.split.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Card sale with the terminal reference from its receipt: offline with the link active, or a standalone terminal. */}
      {deviceRefFor && (
        <div className="overlay" onClick={() => setDeviceRefFor(null)}>
          <div className="modal" data-testid="pos-device-ref" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <div className="modal-title">{deviceRefMode === 'offline' ? t('pos.device_ref.title_offline') : t('pos.device_ref.title_standalone')}</div>
              <button className="modal-close" onClick={() => setDeviceRefFor(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13 }}>
              {deviceRefMode === 'offline' ? t('pos.device_ref.intro_offline') : t('pos.device_ref.intro_standalone')}
              <b>{t('pos.device_ref.ref_bold')}</b>
              {t('pos.device_ref.outro')}
            </p>
            <div className="field">
              <label>{t('pos.device_ref.label')}</label>
              <input autoFocus value={deviceRef} onChange={(e) => setDeviceRef(e.target.value)} maxLength={64} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setDeviceRefFor(null)}>{t('pos.common.cancel')}</button>
              <button className="btn btn-primary" disabled={!deviceRef.trim()} onClick={confirmDeviceRef}>
                {t('pos.device_ref.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual resolution by evidence, for a reviewer, after the provider has been asked. */}
      {evidenceFor && (
        <div className="overlay" onClick={() => setEvidenceFor(null)}>
          <div className="modal" data-testid="pos-evidence" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <div className="modal-title">{t('pos.evidence.title')}</div>
              <button className="modal-close" onClick={() => setEvidenceFor(null)}>✕</button>
            </div>
            <p className="num" style={{ fontSize: 13 }}>
              {t('pos.evidence.intro', { amount: fmt(evidenceFor.cardAmount) })}
            </p>
            <div className="field">
              <label>{t('pos.evidence.device_ref')}</label>
              <input value={evidence.deviceReference} onChange={(e) => setEvidence({ ...evidence, deviceReference: e.target.value })} maxLength={64} />
            </div>
            <div className="field">
              <label>{t('pos.evidence.approval_code')}</label>
              <input value={evidence.approvalCode} onChange={(e) => setEvidence({ ...evidence, approvalCode: e.target.value })} maxLength={32} />
            </div>
            <div className="field">
              <label>{t('pos.evidence.note')}</label>
              <input value={evidence.note} onChange={(e) => setEvidence({ ...evidence, note: e.target.value })} maxLength={500} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setEvidenceFor(null)}>{t('pos.common.cancel')}</button>
              <button className="btn btn-primary" disabled={!evidence.deviceReference.trim() || !evidence.approvalCode.trim()} onClick={submitEvidence}>
                {t('pos.evidence.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unverified card payments, by cashier, matching state and settlement deadline. */}
      {verifications && (
        <div className="overlay" onClick={() => setVerifications(null)}>
          <div className="modal" data-testid="pos-card-verifications" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-head">
              <div className="modal-title">{t('pos.verifications.title', { n: verifications.settlementDays })}</div>
              <button className="modal-close" onClick={() => setVerifications(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => openVerifications('open')}>{t('pos.verifications.filter_open')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => openVerifications('overdue')}>{t('pos.verifications.filter_overdue')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => openVerifications('matched')}>{t('pos.verifications.filter_matched')}</button>
            </div>
            {verifications.items.length === 0 && <div className="empty-state">{t('pos.verifications.empty')}</div>}
            {verifications.items.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>{t('pos.verifications.col_invoice')}</th>
                    <th>{t('pos.verifications.col_day')}</th>
                    <th>{t('pos.verifications.col_amount')}</th>
                    <th>{t('pos.verifications.col_cashier')}</th>
                    <th>{t('pos.verifications.col_device_ref')}</th>
                    <th>{t('pos.verifications.col_proof')}</th>
                    <th>{t('pos.verifications.col_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {verifications.items.map((r) => (
                    <tr key={r.posPaymentId}>
                      <td className="num">{r.invoiceNo}</td>
                      <td className="num">{r.issueDate}</td>
                      <td className="num">{fmt(r.amount)}</td>
                      <td>{r.cashierName ?? '—'}</td>
                      <td className="num">{r.deviceReference ?? '—'}</td>
                      <td>
                        {r.verification === 'MANUAL_EVIDENCE'
                          ? r.resolvedByName
                            ? t('pos.verifications.proof_evidence_by', { name: r.resolvedByName })
                            : t('pos.verifications.proof_evidence')
                          : t('pos.verifications.proof_device_ref')}
                      </td>
                      <td style={{ color: r.matched ? 'var(--emerald)' : r.overdue ? 'var(--rose)' : undefined }}>
                        {r.matched
                          ? t('pos.verifications.matched', { ref: r.settlementNo ?? t('pos.verifications.settlement') })
                          : r.overdue
                            ? t('pos.verifications.overdue', { n: r.ageDays })
                            : t('pos.verifications.waiting', { n: r.ageDays })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* Pending attempts from a closed shift stay in the matching list until resolved, never guessed. */}
            {verifications.unresolvedAttempts.length > 0 && (
              <div data-testid="pos-unresolved-attempts" style={{ marginTop: 12 }}>
                <div className="card-title">{t('pos.verifications.unresolved_title', { n: verifications.unresolvedAttempts.length })}</div>
                <table>
                  <thead>
                    <tr>
                      <th>{t('pos.verifications.col_amount')}</th>
                      <th>{t('pos.verifications.col_cashier')}</th>
                      <th>{t('pos.verifications.col_started')}</th>
                      <th>{t('pos.verifications.col_status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verifications.unresolvedAttempts.map((a) => (
                      <tr key={a.attemptId}>
                        <td className="num">{fmt(a.amount)}</td>
                        <td>{a.cashierName ?? '—'}</td>
                        <td className="num">{a.createdAt.slice(0, 16).replace('T', ' ')}</td>
                        <td>
                          {a.status === 'UNKNOWN'
                            ? t('pos.verifications.status_unknown')
                            : a.status === 'CHARGING'
                              ? t('pos.verifications.status_charging')
                              : t('pos.verifications.status_approved')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Offline receipt: a temporary reference; the real number comes with the sync. */}
      {offlineReceipt && (
        <div className="overlay" onClick={() => setOfflineReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <div className="modal-title">{t('pos.offline_receipt.title')}</div>
              <button className="modal-close" onClick={() => setOfflineReceipt(null)}>✕</button>
            </div>
            <div className="print-receipt">
              <p className="num" style={{ textAlign: 'center', fontWeight: 700 }}>{t('pos.offline_receipt.temp_ref', { ref: offlineReceipt.offlineRef })}</p>
              <table>
                <tbody>
                  {offlineReceipt.display.map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{l.name}</td>
                      <td className="num" style={{ fontSize: 12 }}>{l.quantity} × {fmt(l.unitPrice)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>{t('pos.offline_receipt.total_incl')}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(offlineReceipt.total)}</td>
                  </tr>
                </tbody>
              </table>
              {/* Visible text on the receipt: the compliant invoice is issued on reconnect, dated this sale. */}
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                {t('pos.offline_receipt.notice')}
              </p>
              {/* Phase one ZATCA code, built on the device, inside the print area. */}
              {offlineReceipt.zatcaQr && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <ZatcaQr payload={offlineReceipt.zatcaQr} size={128} />
                </div>
              )}
            </div>
            {/* Outside the print area on purpose: a note for the cashier, not a line on the customer's receipt. */}
            {!offlineReceipt.zatcaQr && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                {t('pos.offline_receipt.no_qr')}
              </p>
            )}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setOfflineReceipt(null)}>{t('pos.common.close')}</button>
              <button className="btn btn-primary" onClick={() => window.print()}>{t('pos.common.print')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt */}
      {receipt && (
        <div className="overlay" onClick={() => setReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <div className="modal-title">{t('pos.receipt.title')}</div>
              <button className="modal-close" onClick={() => setReceipt(null)}>
                ✕
              </button>
            </div>
            <div id="pos-receipt" className="print-receipt">
              <p className="num" style={{ textAlign: 'center', fontWeight: 700 }}>
                {t('pos.receipt.invoice_no', { no: receipt.no })}
              </p>
              <table>
                <tbody>
                  {receipt.lines?.map((l) => (
                    <tr key={l.id}>
                      <td style={{ fontSize: 12 }}>{l.description}</td>
                      <td className="num" style={{ fontSize: 12 }}>
                        {Number(l.quantity)} × {fmt(Number(l.unitPrice))}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>{t('pos.receipt.total_incl')}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmt(Number(receipt.total))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                {receipt.paymentMethod === 'CASH' && t('pos.receipt.paid_cash')}
                {receipt.paymentMethod === 'CARD' && t('pos.receipt.paid_card')}
                {receipt.paymentMethod === 'SPLIT' &&
                  (receipt.posPayments ?? [])
                    .map((p) =>
                      p.method === 'CASH'
                        ? t('pos.receipt.split_cash', { amount: fmt(Number(p.amount)) })
                        : t('pos.receipt.split_card', { amount: fmt(Number(p.amount)) }),
                    )
                    .join(' + ')}
                {' · '}
                {formatDateTime(new Date())}
              </p>
              {/* The ZATCA code on the customer's receipt is required both generated and printed, so it sits inside the print area. */}
              {receipt.receiptQr && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <ZatcaQr payload={receipt.receiptQr} size={128} />
                </div>
              )}
            </div>
            {/* A full tax invoice is cleared before it is shared: no printing here; it is handed over from the invoices screen after clearance. */}
            {receipt.clearance?.required && (
              <p className="hint" data-testid="pos-clearance-gate" style={{ color: 'var(--rose)' }}>
                {receipt.clearance.message ?? t('pos.receipt.clearance_fallback')}
              </p>
            )}
            {/* Outside .print-receipt on purpose: a note for the cashier, not a line on the customer's receipt. */}
            {!receipt.receiptQr && !receipt.clearance?.required && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                {t('pos.receipt.no_qr')}
              </p>
            )}
            {/* A failed stamp does not fail the sale: the receipt carries the five tags, with a note for the cashier outside it. */}
            {receipt.stampError && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                {t('pos.receipt.stamp_error', { reason: receipt.stampError })}
              </p>
            )}
            {stockWarnings.length > 0 && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                {t('pos.receipt.negative_stock', { items: stockWarnings.map((w) => `${w.name} (${fmt(w.resultingQty)})`).join(t('pos.receipt.list_sep')) })}
              </p>
            )}
            {stockNotice && (
              <p className="hint" style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
                {stockNotice}
              </p>
            )}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setReceipt(null)}>
                {t('pos.common.close')}
              </button>
              {!receipt.clearance?.required && (
                <button className="btn btn-primary" onClick={() => window.print()}>
                  {t('pos.common.print')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Close shift */}
      {canReview && closing && (
        <div className="overlay" onClick={() => setClosing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <div className="modal-title">{t('pos.close.title')}</div>
              <button className="modal-close" onClick={() => setClosing(false)}>
                ✕
              </button>
            </div>
            <table>
              <tbody>
                <tr>
                  <td>{t('pos.close.opening_float')}</td>
                  <td className="num">{fmt(Number(shift.openingFloat))}</td>
                </tr>
                <tr>
                  <td>{t('pos.close.cash_sales')}</td>
                  <td className="num">{fmt(shift.cashTotal)}</td>
                </tr>
                <tr>
                  <td>{t('pos.close.card_sales')}</td>
                  <td className="num">{fmt(shift.cardTotal)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>{t('pos.close.expected')}</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmt(shift.expectedCash)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="field" style={{ marginTop: 10 }}>
              <label>{t('pos.close.counted_label')}</label>
              <input type="number" min="0" value={declared} onChange={(e) => setDeclared(e.target.value)} placeholder="0.00" />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setClosing(false)}>
                {t('pos.common.cancel')}
              </button>
              <button className="btn btn-primary" onClick={handleCloseShift}>
                {t('pos.close.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
