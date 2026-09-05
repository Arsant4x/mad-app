import { useEffect, useMemo, useRef, useState } from 'react';
import { listProducts, type Product } from '../../api/products';
import { listBranches, type Branch } from '../../api/branches';
import { BranchPicker } from '../../components/BranchPicker';
import { closeShift, getCurrentShift, openShift, syncPosSale, type ClosedShift, type PosPaymentMethod, type PosPaymentPart, type PosShift } from '../../api/pos';
import { useAuth } from '../../auth/AuthContext';
import { cacheProducts, enqueueSale, isNetworkError, newClientSaleId, newOfflineRef, readCachedProducts, readQueue, removeFromQueue, type QueuedSale } from '../../lib/posQueue';
import type { Invoice } from '../../api/invoices';
import { fmt } from '../../lib/format';
import { round2 } from '../../lib/money';

interface CartLine {
  product: Product;
  quantity: number;
}

/**
 * شاشة الكاشير (مستند §6 — النسخة الأولى، أونلاين).
 *
 * touch-first: أزرار كبيرة، بحث/باركود واحد، سلة، ودفع بزرّين. البيع يخرج
 * فاتورة حقيقية مدفوعة على نفس ترقيم الفواتير، والدرج يُحسب في الخادم.
 */
export function PosPage() {
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
  const [receipt, setReceipt] = useState<Invoice | null>(null);
  const [closing, setClosing] = useState(false);
  const [declared, setDeclared] = useState('');
  const [closed, setClosed] = useState<ClosedShift | null>(null);
  const [offline, setOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [offlineReceipt, setOfflineReceipt] = useState<QueuedSale | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  /** بنود هبط رصيدها تحت الصفر بهذا البيع — تحذير ناعم داخل الإيصال، لا يمنع البيع. */
  const [stockWarnings, setStockWarnings] = useState<{ name: string; resultingQty: number }[]>([]);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  async function reload() {
    try {
      const [s, p] = await Promise.all([getCurrentShift(), listProducts()]);
      setShift(s);
      setProducts(p);
      cacheProducts(companyId, p);
      setOffline(false);
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // انقطاع: نبيع من آخر كتالوج معروف، والمناوبة كما كانت في الذاكرة.
      setProducts((prev) => (prev.length ? prev : readCachedProducts(companyId)));
      setOffline(true);
    }
    // بمعزل عن الكتلة أعلاه: فشلُ الفروع لا يُسقط البيع في الأوفلاين، وإعادةُ
    // المحاولة مع كل reload تعني أن انقطاعاً لحظةَ الفتح لا يُخفي المُنتقي بقيةَ
    // اليوم — وإخفاؤه صامتاً يعني مناوبةً بلا فرع، أي بيعاً كاملاً بلا خصم مخزون.
    try {
      setBranches(await listBranches());
    } catch {
      /* بلا فروع معروفة يختفي المُنتقي وتُفتح المناوبة على مستوى الشركة كما قبل. */
    }
    setQueueCount(readQueue(companyId).length);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** تفريغ الطابور: كل بيع مصفوف يُعاد إرساله — الخادم يبتلع التكرار بأمان. */
  async function flushQueue() {
    const queue = readQueue(companyId);
    for (const sale of queue) {
      try {
        await syncPosSale(sale);
        removeFromQueue(companyId, sale.clientSaleId);
      } catch (e) {
        if (isNetworkError(e)) return; // ما زلنا أوفلاين — نحاول لاحقاً.
        // رفض حقيقي (مثل مناوبة مقفلة): يبقى في الطابور ويُعرض للمستخدم.
        const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
        setError(d?.message ?? 'تعذّرت مزامنة بيع مصفوف');
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

  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0);
    const tax = subtotal * 0.15;
    return { subtotal, tax, total: subtotal + tax };
  }, [cart]);

  function addToCart(p: Product) {
    setCart((prev) => {
      const hit = prev.find((l) => l.product.id === p.id);
      if (hit) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product: p, quantity: 1 }];
    });
  }

  function changeQty(id: string, delta: number) {
    setCart((prev) => prev.flatMap((l) => (l.product.id === id ? (l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]) : [l])));
  }

  /** باركود: Enter مع تطابق واحد يضيفه مباشرة ويصفّي البحث. */
  function handleSearchEnter() {
    if (visible.length === 1) {
      addToCart(visible[0]);
      setQuery('');
      searchRef.current?.focus();
    }
  }

  async function pay(method: PosPaymentMethod, payments?: PosPaymentPart[]) {
    if (!cart.length || paying) return;
    setPaying(true);
    setError(null);
    // كل بيع — أونلاين أو أوفلاين — يحمل هوية طرفية من لحظة الرنّ: المسار
    // واحد (sync) والخادم يبتلع أي تكرار، فلا فقدان ولا ازدواج (مستند §6).
    const sale = {
      clientSaleId: newClientSaleId(),
      offlineRef: newOfflineRef(),
      ringAt: new Date().toISOString(),
      // انحرافُ الجهاز مع اللحظة: يومُ الفاتورة ووقتُها يومُ التاجر لا يومُ UTC (ق-١٨٥).
      ringOffsetMin: -new Date().getTimezoneOffset(),
      lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      paymentMethod: method,
      payments,
    };
    try {
      const invoice = await syncPosSale(sale);
      // الخادم يعيد ids فقط في belowZero — الأسماء تُحلّ من السلة قبل تفريغها.
      const deduction = invoice.stockDeduction;
      if (deduction?.deducted && deduction.belowZero.length > 0) {
        const nameById = new Map(cart.map((l) => [l.product.id, l.product.name]));
        setStockWarnings(deduction.belowZero.map((b) => ({ name: nameById.get(b.productId) ?? b.productId, resultingQty: b.resultingQty })));
      } else {
        setStockWarnings([]);
      }
      // تخطي الخصم سلوك مقصود لا خطأ — تلميح خافت فقط لوردية على فرع بلا
      // مستودع مربوط (وردية بلا فرع أصلاً أو سلة كلها خدمات لا تستحق أي إشارة).
      setStockNotice(deduction?.deducted === false && deduction.reason === 'NO_BRANCH_WAREHOUSE' && shift?.branchId ? 'لم يُخصم المخزون تلقائياً — لا مستودع مرتبطاً بفرع المناوبة' : null);
      setCart([]);
      setReceipt(invoice);
      await reload();
    } catch (e) {
      if (isNetworkError(e)) {
        // انقطاع: البيع يصطفّ محلياً بإيصال مؤقت، ويتزامن وحده لاحقاً.
        const queued = {
          ...sale,
          display: cart.map((l) => ({ name: l.product.name, quantity: l.quantity, unitPrice: Number(l.product.price) })),
          total: totals.total,
        };
        enqueueSale(companyId, queued);
        setQueueCount(readQueue(companyId).length);
        setOffline(true);
        setCart([]);
        setOfflineReceipt(queued);
      } else {
        const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
        setError(d?.message ?? 'تعذّر إتمام البيع');
      }
    } finally {
      setPaying(false);
    }
  }

  /** تقسيم: الكاشير يُدخل النقد، والبطاقة تكمل الباقي تلقائياً. */
  async function confirmSplit() {
    const cash = Number(splitCash || '0');
    const card = round2(totals.total - cash);
    if (cash <= 0 || card <= 0) {
      setError('أدخل مبلغاً نقدياً أكبر من صفر وأقل من الإجمالي.');
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
      // فرع الوردية يحدد مستودع الخصم (Branch.warehouseId) — بلا فرع يمضي
      // البيع بلا خصم مخزون، وهو التراجع الصريح لا خطأ.
      await openShift(Number(floatInput || '0'), branchInput || undefined);
      setFloatInput('');
      await reload();
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string } } })?.response?.data;
      setError(d?.message ?? 'تعذّر فتح المناوبة');
    }
  }

  async function handleCloseShift() {
    if (!shift) return;
    // الدرج لا يُختم وفي الطابور مبيعات لم تصل — العدّ سيكون ناقصاً حتماً.
    if (readQueue(companyId).length > 0) {
      setError('توجد مبيعات غير متزامنة — انتظر عودة الاتصال حتى يفرغ الطابور ثم أقفل.');
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
      setError(d?.message ?? 'تعذّر إقفال المناوبة');
    }
  }

  if (loading) return null;

  // ---- لا مناوبة: بطاقة فتح ----
  if (!shift) {
    return (
      <div>
        <div className="topbar">
          <div>
            <div className="page-title">الكاشير</div>
            <div className="page-sub">افتح مناوبة لبدء البيع</div>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 420 }}>
          <div className="card-title" style={{ marginBottom: 10 }}>
            فتح مناوبة
          </div>
          <div className="field">
            <label>العهدة الافتتاحية (نقد الدرج)</label>
            <input type="number" min="0" value={floatInput} onChange={(e) => setFloatInput(e.target.value)} placeholder="0.00" />
          </div>
          <BranchPicker branches={branches} value={branchInput} onChange={setBranchInput} label="فرع المناوبة (يحدد مستودع خصم المخزون)" />
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 16 }} onClick={handleOpenShift}>
            🧾 فتح المناوبة
          </button>
        </div>

        {closed && (
          <div className="card" style={{ maxWidth: 420, marginTop: 14 }}>
            <div className="card-title">ملخص المناوبة المقفلة</div>
            <table>
              <tbody>
                <tr>
                  <td>عدد المبيعات</td>
                  <td className="num">{closed.salesCount}</td>
                </tr>
                <tr>
                  <td>نقدي</td>
                  <td className="num">{fmt(closed.cashTotal)}</td>
                </tr>
                <tr>
                  <td>شبكة</td>
                  <td className="num">{fmt(closed.cardTotal)}</td>
                </tr>
                <tr>
                  <td>المتوقع في الدرج</td>
                  <td className="num">{fmt(closed.expectedCash)}</td>
                </tr>
                <tr>
                  <td>المعدود فعلياً</td>
                  <td className="num">{fmt(Number(closed.declaredClosing))}</td>
                </tr>
                <tr>
                  <td>
                    <b>{closed.variance === 0 ? 'مطابق' : closed.variance > 0 ? 'زيادة' : 'عجز'}</b>
                  </td>
                  <td className="num" style={{ color: closed.variance === 0 ? 'var(--emerald)' : 'var(--rose)', fontWeight: 700 }}>
                    {fmt(Math.abs(closed.variance))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ---- مناوبة مفتوحة: الكاشير ----
  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">الكاشير</div>
          <div className="page-sub">
            مناوبة {shift.openedByName} · {shift.salesCount} عملية · الدرج المتوقع {fmt(shift.expectedCash)}
            {shift.branchId && <span className="badge draft" style={{ marginRight: 8 }}>{branches.find((b) => b.id === shift.branchId)?.name ?? 'فرع'}</span>}
            {offline && <span className="badge draft" style={{ marginRight: 8 }}>⚠ أوفلاين — البيع مستمر</span>}
            {queueCount > 0 && <span className="badge draft" style={{ marginRight: 8 }}>بانتظار المزامنة: {queueCount}</span>}
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={() => setClosing(true)}>
            إقفال المناوبة
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, alignItems: 'start' }}>
        {/* الأصناف */}
        <div className="card">
          <div className="search-box" style={{ marginBottom: 12, maxWidth: 'none' }}>
            <input
              ref={searchRef}
              autoFocus
              placeholder="ابحث بالاسم أو امسح الباركود ثم Enter..."
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
            {visible.length === 0 && <div className="empty-state">لا صنف مطابقاً</div>}
          </div>
        </div>

        {/* السلة */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            السلة
          </div>
          {cart.length === 0 && <div className="empty-state">اضغط صنفاً لإضافته</div>}
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
            </div>
          ))}

          <table style={{ marginTop: 10 }}>
            <tbody>
              <tr>
                <td>الإجمالي قبل الضريبة</td>
                <td className="num">{fmt(totals.subtotal)}</td>
              </tr>
              <tr>
                <td>الضريبة 15%</td>
                <td className="num">{fmt(totals.tax)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 700 }}>الإجمالي</td>
                <td className="num" style={{ fontWeight: 700, fontSize: 16 }}>
                  {fmt(totals.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {error && <p className="error-text">{error}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ padding: 16, fontSize: 16 }} disabled={!cart.length || paying} onClick={() => pay('CASH')}>
              💵 نقدي
            </button>
            <button className="btn btn-primary" style={{ padding: 16, fontSize: 16 }} disabled={!cart.length || paying} onClick={() => pay('CARD')}>
              💳 شبكة
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} disabled={!cart.length || paying} onClick={() => setSplitting(true)}>
            ✂ تقسيم نقدي + شبكة
          </button>
        </div>
      </div>

      {/* تقسيم الدفع */}
      {splitting && (
        <div className="overlay" onClick={() => setSplitting(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <div className="modal-title">تقسيم الدفع</div>
              <button className="modal-close" onClick={() => setSplitting(false)}>✕</button>
            </div>
            <p className="num" style={{ textAlign: 'center', fontWeight: 700, fontSize: 18 }}>{fmt(totals.total)}</p>
            <div className="field">
              <label>المبلغ النقدي</label>
              <input type="number" min="0" autoFocus value={splitCash} onChange={(e) => setSplitCash(e.target.value)} placeholder="0.00" />
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              الشبكة تُكمل الباقي: <b className="num">{fmt(Math.max(0, totals.total - Number(splitCash || '0')))}</b>
            </p>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setSplitting(false)}>إلغاء</button>
              <button className="btn btn-primary" onClick={confirmSplit}>تأكيد التقسيم</button>
            </div>
          </div>
        </div>
      )}

      {/* إيصال أوفلاين — مرجع مؤقت، الرقم الحقيقي يأتي مع المزامنة */}
      {offlineReceipt && (
        <div className="overlay" onClick={() => setOfflineReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <div className="modal-title">بيع مسجَّل أوفلاين ✓</div>
              <button className="modal-close" onClick={() => setOfflineReceipt(null)}>✕</button>
            </div>
            <div className="print-receipt">
              <p className="num" style={{ textAlign: 'center', fontWeight: 700 }}>مرجع مؤقت: {offlineReceipt.offlineRef}</p>
              <table>
                <tbody>
                  {offlineReceipt.display.map((l, i) => (
                    <tr key={i}>
                      <td style={{ fontSize: 12 }}>{l.name}</td>
                      <td className="num" style={{ fontSize: 12 }}>{l.quantity} × {fmt(l.unitPrice)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700 }}>الإجمالي (شامل الضريبة)</td>
                    <td className="num" style={{ fontWeight: 700 }}>{fmt(offlineReceipt.total)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                سيُرقَّم كفاتورة رسمية تلقائياً فور عودة الاتصال
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setOfflineReceipt(null)}>إغلاق</button>
              <button className="btn btn-primary" onClick={() => window.print()}>🖨 طباعة</button>
            </div>
          </div>
        </div>
      )}

      {/* إيصال */}
      {receipt && (
        <div className="overlay" onClick={() => setReceipt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 360 }}>
            <div className="modal-head">
              <div className="modal-title">تم البيع ✓</div>
              <button className="modal-close" onClick={() => setReceipt(null)}>
                ✕
              </button>
            </div>
            <div id="pos-receipt" className="print-receipt">
              <p className="num" style={{ textAlign: 'center', fontWeight: 700 }}>
                فاتورة {receipt.no}
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
                    <td style={{ fontWeight: 700 }}>الإجمالي (شامل الضريبة)</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {fmt(Number(receipt.total))}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                {receipt.paymentMethod === 'CASH' && 'دفع نقدي'}
                {receipt.paymentMethod === 'CARD' && 'دفع بالشبكة'}
                {receipt.paymentMethod === 'SPLIT' &&
                  (receipt.posPayments ?? [])
                    .map((p) => (p.method === 'CASH' ? `نقدي ${fmt(Number(p.amount))}` : `شبكة ${fmt(Number(p.amount))}`))
                    .join(' + ')}
                {' · '}
                {new Date().toLocaleString('ar-SA')}
              </p>
            </div>
            {/* خارج .print-receipt عمداً — تنبيه للكاشير لا سطراً على إيصال العميل. */}
            {stockWarnings.length > 0 && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                تنبيه: الرصيد الناتج سالب — {stockWarnings.map((w) => `${w.name} (${fmt(w.resultingQty)})`).join('، ')} — تحقق من الجرد
              </p>
            )}
            {stockNotice && (
              <p className="hint" style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>
                {stockNotice}
              </p>
            )}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setReceipt(null)}>
                إغلاق
              </button>
              <button className="btn btn-primary" onClick={() => window.print()}>
                🖨 طباعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* إقفال المناوبة */}
      {closing && (
        <div className="overlay" onClick={() => setClosing(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <div className="modal-title">إقفال المناوبة</div>
              <button className="modal-close" onClick={() => setClosing(false)}>
                ✕
              </button>
            </div>
            <table>
              <tbody>
                <tr>
                  <td>العهدة الافتتاحية</td>
                  <td className="num">{fmt(Number(shift.openingFloat))}</td>
                </tr>
                <tr>
                  <td>مبيعات نقدية</td>
                  <td className="num">{fmt(shift.cashTotal)}</td>
                </tr>
                <tr>
                  <td>مبيعات شبكة</td>
                  <td className="num">{fmt(shift.cardTotal)}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>المتوقع في الدرج</td>
                  <td className="num" style={{ fontWeight: 700 }}>
                    {fmt(shift.expectedCash)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="field" style={{ marginTop: 10 }}>
              <label>النقد المعدود فعلياً</label>
              <input type="number" min="0" value={declared} onChange={(e) => setDeclared(e.target.value)} placeholder="0.00" />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setClosing(false)}>
                إلغاء
              </button>
              <button className="btn btn-primary" onClick={handleCloseShift}>
                إقفال وحساب الفرق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
