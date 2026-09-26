import { useEffect, useMemo, useRef, useState } from 'react';
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
import { num0, round2, type QtyText } from '../../lib/money';

interface CartLine {
  product: Product;
  quantity: number;
  /** ④B1 — خصمٌ مبلغاً على السطر (صفرٌ غياباً). */
  discount: number;
}

/** بيعٌ رُنّ على هذا الجهاز: لحظتُه وانحرافُه ومرجعُه المؤقّت إلزاميّةٌ — منها يومُ الفاتورة وطابعُ إيصاله (ق-١٨٥ · ق-١٨٨). */
type RungSale = PosSaleInput & { offlineRef: string; ringAt: string; ringOffsetMin: number };

/** رسالةُ الخادم كما هي — والتحقّقُ يعيد مصفوفةً فتُضمّ. */
function messageOf(e: unknown, fallback: string): string {
  const m = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  return Array.isArray(m) ? m.join(' · ') : (m ?? fallback);
}

/** حالُ المحاولة كما يقرؤه الكاشير. */
const ATTEMPT_LABEL: Record<PosPaymentAttempt['status'], string> = {
  CREATED: 'لم تُرسل',
  CHARGING: 'بانتظار الجهاز…',
  APPROVED: 'قبلها المزوّد — تُتمّ الفاتورة',
  COMPLETED: 'اكتملت',
  DECLINED: 'رُفضت',
  UNKNOWN: 'لم يصل جوابُ المزوّد — لا تُعِد الشحن',
  CANCELLED: 'أُلغيت',
};

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
  const [receipt, setReceipt] = useState<PosSaleResponse | null>(null);
  const [closing, setClosing] = useState(false);
  const [declared, setDeclared] = useState('');
  const [closed, setClosed] = useState<ClosedShift | null>(null);
  const [offline, setOffline] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [offlineReceipt, setOfflineReceipt] = useState<QueuedSale | null>(null);
  const [splitting, setSplitting] = useState(false);
  const [splitCash, setSplitCash] = useState('');
  /** بنود هبط رصيدها تحت الصفر بهذا البيع — تحذير ناعم داخل الإيصال، لا يمنع البيع. */
  const [stockWarnings, setStockWarnings] = useState<{ name: string; resultingQty: QtyText }[]>([]);
  const [stockNotice, setStockNotice] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ───── محاولةُ دفع البطاقة (`ق-١٤٠١` · `ق-١٣٩٧` … `ق-١٣٩٩`) ─────
  const { can } = usePermissions();
  const canReview = can('pos', 'review');
  /** أفعّالٌ ربطُ البوابة — منه يُختار المسار: محاولةٌ عبر المزوّد، أو بيعٌ مباشر. */
  const [paymentMode, setPaymentMode] = useState<PosPaymentMode | null>(null);
  /** المحاولةُ التي تقفل السلةَ حتى تُحسم — «لا تُعِد الشحن». */
  const [pendingAttempt, setPendingAttempt] = useState<PosPaymentAttempt | null>(null);
  /** ما لم يُحسم في المناوبة — يراه الكاشير ويستعلم عنه. */
  const [openAttempts, setOpenAttempts] = useState<PosPaymentAttempt[]>([]);
  /**
   * بيعٌ ببطاقةٍ ينتظر رقمَ مرجع الجهاز من إيصاله — **دون اتصالٍ والربطُ فعّال** (`ق-١٣٩٧`) **أو على جهازٍ مستقلٍّ بلا ربط**
   * (`ق-١٤١٩` · «فالحكمُ واحد» بنصّ المالك): الأوّلُ يصطفّ محلياً، والثاني يُرسل الآن برقمه.
   */
  const [deviceRefFor, setDeviceRefFor] = useState<RungSale | null>(null);
  const [deviceRefMode, setDeviceRefMode] = useState<'offline' | 'standalone'>('offline');
  const [deviceRef, setDeviceRef] = useState('');
  /** حسمٌ يدويٌّ بدليلٍ — لصاحب المراجعة (`ق-١٣٩٩`). */
  const [evidenceFor, setEvidenceFor] = useState<PosPaymentAttempt | null>(null);
  const [evidence, setEvidence] = useState({ deviceReference: '', approvalCode: '', note: '' });
  /** دفعاتُ البطاقة غيرُ المتحقَّقة — للمراجعة. */
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
      // انقطاع: نبيع من آخر كتالوج معروف، والمناوبة كما كانت في الذاكرة — ووضعُ الدفع آخرَ ما عُرف.
      setProducts((prev) => (prev.length ? prev : readCachedProducts(companyId)));
      setPaymentMode((prev) => prev ?? readCachedPaymentMode(companyId));
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
    // ملفُ المنشأة يُخبَّأ عند كل اتصالٍ ناجح — فرمزُ الإيصال الأوفلاين يجد الاسمَ
    // القانوني والرقمَ الضريبي حين لا خادم (ق-١٨٨). الفشل يترك المخبَّأ الأخير.
    try {
      const profile = await getCompanyProfile();
      cacheSellerProfile(companyId, { legalName: profile.legalName, vatNumber: profile.vatNumber });
    } catch {
      /* أوفلاين أو ملفٌ لم يُكتب — يبقى آخر مخبَّأ، وغيابه يُنبَّه إليه على الإيصال. */
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
        // حقولُ البيع وحدَها على السلك — حقولُ العرض للإيصال المؤقّت، والخادمُ يرفض ما لا يعرفه (`wireSaleOf`).
        await syncPosSale(wireSaleOf(sale));
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
    // ④B1 — الصافي بعد خصم السطر (BT-131)، والضريبةُ منه.
    const net = (l: CartLine) => Math.max(0, Number(l.product.price) * l.quantity - (l.discount || 0));
    const subtotal = cart.reduce((s, l) => s + net(l), 0);
    // ⑧ الضريبةُ من فئة كلِّ صنف (`rateForCategory`) لا نسبةً واحدة على السلة — فسلةٌ فيها دواءٌ بنسبة الصفر لا
    // تُحمَّل ضريبتَه؛ والخادمُ يشتقّ النسبةَ نفسَها من الفئة ويعيد المجاميع المعتمَدة. ⚠️ ورمزُ الإيصال المؤقّت
    // أوفلاين يُبنى من هذا الرقم (ق-١٨٨) فيلزم أن يطابق ما سيحسبه الخادم للسلة نفسِها.
    const tax = cart.reduce((s, l) => s + net(l) * (rateForCategory(l.product.taxCategory) / 100), 0);
    return { subtotal, tax, total: subtotal + tax };
  }, [cart]);

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

  /** باركود: Enter مع تطابق واحد يضيفه مباشرة ويصفّي البحث. */
  function handleSearchEnter() {
    if (visible.length === 1) {
      addToCart(visible[0]);
      setQuery('');
      searchRef.current?.focus();
    }
  }

  /**
   * كل بيع — أونلاين أو أوفلاين — يحمل هوية طرفية من لحظة الرنّ: المسار واحد والخادم يبتلع أي تكرار، فلا فقدان ولا
   * ازدواج (مستند §6). ومحاولةُ الدفع تحمل الهويّةَ نفسَها (`ق-١٤٠١`).
   */
  function ringSale(method: PosPaymentMethod, payments?: PosPaymentPart[]): RungSale {
    return {
      clientSaleId: newClientSaleId(),
      offlineRef: newOfflineRef(),
      ringAt: new Date().toISOString(),
      // انحرافُ الجهاز مع اللحظة: يومُ الفاتورة ووقتُها يومُ التاجر لا يومُ UTC (ق-١٨٥).
      ringOffsetMin: -new Date().getTimezoneOffset(),
      lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity, ...(l.discount > 0 ? { discount: l.discount } : {}) })),
      paymentMethod: method,
      ...(payments ? { payments } : {}),
    };
  }

  /** جزءُ البطاقة من البيع — كلُّه للبطاقة، أو جزؤها من المقسّم. */
  function cardPartOf(sale: PosSaleInput): number {
    if (sale.paymentMethod === 'CARD') return totals.total;
    if (sale.paymentMethod === 'SPLIT') return (sale.payments ?? []).filter((p) => p.method === 'CARD').reduce((s, p) => s + p.amount, 0);
    return 0;
  }

  async function pay(method: PosPaymentMethod, payments?: PosPaymentPart[]) {
    if (!cart.length || paying || pendingAttempt) return;
    const sale = ringSale(method, payments);
    // ⚖️ البطاقةُ والربطُ فعّال تمرّ بمحاولة دفعٍ عبر المزوّد (`ق-١٤٠١`) — وأوفلاين برقم مرجع الجهاز من إيصاله (`ق-١٣٩٧`).
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
    // ⚖️ وبلا ربطٍ — جهازٌ مستقلّ: رقمُ مرجعه من إيصاله كبيع البطاقة دون اتصال (`ق-١٤١٩` «فالحكمُ واحد») — لا «أكّده الكاشير».
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
      else setError(messageOf(e, 'تعذّر إتمام البيع'));
    } finally {
      setPaying(false);
    }
  }

  /**
   * ⭐ **محاولةُ الدفع** (`ق-١٤٠١`): تُنشأ بلا فاتورة ثم تُشحن خارج المعاملة — قُبلت ⟸ إيصال · رُفضت ⟸ السببُ والسلةُ كما هي ·
   * لا جواب ⟸ **معلّقة**: «لا تُعِد الشحن»، والسلةُ مقفلةٌ عليها حتى تُحسم.
   */
  async function payByAttempt(sale: RungSale) {
    setPaying(true);
    setError(null);
    let attempt: PosPaymentAttempt;
    try {
      attempt = await createPaymentAttempt(sale);
    } catch (e) {
      setPaying(false);
      // لم يُشحن شيء — الاتصالُ انقطع قبل المحاولة: فالبيعُ ببطاقةٍ دون اتصالٍ برقم مرجع الجهاز (`ق-١٣٩٧`).
      if (isNetworkError(e)) {
        setOffline(true);
        setDeviceRef('');
        setDeviceRefMode('offline');
        setDeviceRefFor(sale);
      } else {
        setError(messageOf(e, 'تعذّر بدء عملية البطاقة'));
      }
      return;
    }
    setPendingAttempt({ ...attempt, status: 'CHARGING' });
    try {
      await applyAttempt(await chargePaymentAttempt(attempt.id), sale);
    } catch (e) {
      // الطلبُ عند المزوّد أو في الطريق: لا يُعاد الشحن — يُستعلم عنه حين يعود الاتصال.
      if (isNetworkError(e)) setError('انقطع الاتصال أثناء الشحن — لا تُعِد الشحن؛ استعلم عن حال العملية حين يعود الاتصال.');
      else {
        setPendingAttempt(null);
        setError(messageOf(e, 'تعذّر شحن البطاقة'));
      }
    } finally {
      setPaying(false);
    }
  }

  /** ما آلت إليه المحاولة — اكتملت ⟸ إيصال · رُفضت ⟸ السبب · وإلا تبقى تقفل السلة. */
  async function applyAttempt(attempt: PosPaymentAttempt, sale?: PosSaleInput) {
    if (attempt.status === 'COMPLETED' && attempt.sale) {
      setPendingAttempt(null);
      await completed(attempt.sale);
      return;
    }
    if (attempt.status === 'DECLINED' || attempt.status === 'CANCELLED') {
      setPendingAttempt(null);
      const split = (sale?.paymentMethod ?? attempt.paymentMethod) === 'SPLIT';
      setError(`رُفضت البطاقة: ${attempt.declineReason ?? '—'}${split ? ' — أعِد النقد للعميل؛ لم يُسجَّل من البيع شيء.' : ''}`);
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
      /* أوفلاين — يُعاد مع أوّل تحميلٍ ناجح */
    }
  }

  /** «جوابُ المزوّد أوّلاً» (`ق-١٣٩٩`) — الاستعلامُ بالمرجع لا يشحن ثانيةً. */
  async function queryAttempt(a: PosPaymentAttempt) {
    setError(null);
    try {
      await applyAttempt(await resolvePaymentAttempt(a.id));
    } catch (e) {
      setError(messageOf(e, 'تعذّر الاستعلام عن العملية'));
    }
  }

  /** ⚖️ الحسمُ اليدويّ بدليلٍ لا بقول — مرجعُ الجهاز ورمزُ الموافقة من إيصاله (`ق-١٣٩٩`). */
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
      setError(messageOf(e, 'تعذّر الحسم'));
    }
  }

  /**
   * بيعٌ ببطاقةٍ برقم مرجع الجهاز — ولا يُقبل بدونه (`ق-١٣٩٧`/١ · `ق-١٤١٩`): **دون اتصالٍ** يصطفّ محلياً، **وعلى جهازٍ مستقلّ**
   * يُرسل الآن برقمه (وإن انقطع الاتصالُ في الطريق اصطفّ برقمه كذلك).
   */
  async function confirmDeviceRef() {
    if (!deviceRefFor) return;
    const reference = deviceRef.trim();
    if (!reference) {
      setError('أدخل رقمَ مرجع الجهاز من إيصاله — لا يُقبل البيعُ بالبطاقة بتأكيدك وحدَه.');
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
      else setError(messageOf(e, 'تعذّر إتمام البيع'));
    } finally {
      setPaying(false);
    }
  }

  async function openVerifications(state: 'open' | 'overdue' | 'matched' | 'all' = 'open') {
    setError(null);
    try {
      setVerifications(await listCardVerifications(state));
    } catch (e) {
      setError(messageOf(e, 'تعذّر جلب دفعات البطاقة'));
    }
  }

  /** ما يُعرض بعد بيعٍ اكتمل — مشتركٌ بين البيع المباشر ومحاولة الدفع. */
  async function completed(invoice: PosSaleResponse) {
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
  }

  /**
   * انقطاع: البيع يصطفّ محلياً بإيصال مؤقت، ويتزامن وحده لاحقاً — وبطاقةٌ والربطُ فعّال تحمل رقمَ مرجع الجهاز (`ق-١٣٩٧`).
   * رمزُ الهيئة يُبنى **هنا، على الجهاز، بلا مفاتيح** (ق-١٨٨): الوسوم الخمسة من ملف المنشأة المخبَّأ وساعة الجهاز نفسها التي
   * سيأخذها الخادم للفاتورة الممتثلة — فالطابع على الإيصال هو طابعُ المستند القادم حرفاً.
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

  // ② الانحرافُ يصل نصّاً بإشارته (`ق-١٢٣٥`) — يُقرأ رقماً مرّةً واحدة قبل المقارنة والعرض.
  const closedVariance = closed ? num0(closed.variance) : 0;

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
                    <b>{closedVariance === 0 ? 'مطابق' : closedVariance > 0 ? 'زيادة' : 'عجز'}</b>
                  </td>
                  <td className="num" style={{ color: closedVariance === 0 ? 'var(--emerald)' : 'var(--rose)', fontWeight: 700 }}>
                    {fmt(Math.abs(closedVariance))}
                  </td>
                </tr>
              </tbody>
            </table>
            {/* ⚖️ المعلّقُ لا يحبس المناوبة — يُسمّى هنا وينتقل إلى قائمة المطابقة حتى يُحسم (`ق-١٤١٨`). */}
            {(closed.pendingAttempts ?? []).length > 0 && (
              <div data-testid="pos-closed-pending" style={{ marginTop: 10, fontSize: 13 }}>
                <b>عملياتُ بطاقةٍ لم تُحسم ({closed.pendingAttempts.length})</b> — أُقفلت المناوبةُ وهي فيها، وتنتقل إلى قائمة المطابقة بالتسوية حتى يحسمها
                جوابُ المزوّد أو الدليل:
                <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                  {closed.pendingAttempts.map((a) => (
                    <li key={a.id}>
                      <span className="num">{fmt(a.cardAmount)}</span> · {a.status === 'UNKNOWN' ? 'معلّقة' : a.status === 'CHARGING' ? 'تُشحن' : 'قُبلت ولم تكتمل'} ·{' '}
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
          {canReview && (
            <button className="btn btn-ghost" onClick={() => openVerifications('open')}>
              💳 بطاقاتٌ غيرُ متحقَّقة
            </button>
          )}
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
              <input
                className="num"
                aria-label={`خصم ${l.product.name}`}
                title="خصم على السطر (مبلغ)"
                style={{ width: 64 }}
                value={l.discount || ''}
                placeholder="خصم"
                onChange={(e) => setDiscount(l.product.id, Math.max(0, parseFloat(e.target.value) || 0))}
              />
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
          {/* السلةُ مقفلةٌ على محاولتها حتى تُحسم — «لا تُعِد الشحن» (الموجز ٢.٩). */}
          {pendingAttempt && (
            <div className="card" data-testid="pos-pending-attempt" style={{ marginTop: 10, border: '1px solid var(--amber, var(--line))' }}>
              <b>{ATTEMPT_LABEL[pendingAttempt.status]}</b>
              <p className="num" style={{ margin: '6px 0' }}>
                {fmt(pendingAttempt.cardAmount)}
                {pendingAttempt.status === 'CHARGING' && paymentMode?.deadlineMs ? ` · المهلة ${Math.round(paymentMode.deadlineMs / 1000)} ثانية` : ''}
              </p>
              {pendingAttempt.detail && <p className="hint">{pendingAttempt.detail}</p>}
              {pendingAttempt.status !== 'CHARGING' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => queryAttempt(pendingAttempt)}>
                    🔎 استعلام عن حالها
                  </button>
                  {canReview && pendingAttempt.status === 'UNKNOWN' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setEvidenceFor(pendingAttempt)}>
                      حسمٌ بدليل
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ padding: 16, fontSize: 16 }} disabled={!cart.length || paying || !!pendingAttempt} onClick={() => pay('CASH')}>
              💵 نقدي
            </button>
            <button className="btn btn-primary" style={{ padding: 16, fontSize: 16 }} disabled={!cart.length || paying || !!pendingAttempt} onClick={() => pay('CARD')}>
              💳 شبكة
            </button>
          </div>
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 8 }} disabled={!cart.length || paying || !!pendingAttempt} onClick={() => setSplitting(true)}>
            ✂ تقسيم نقدي + شبكة
          </button>
          {/* ما لم يُحسم في المناوبة — والمناوبةُ لا تُقفل والمالُ في الطريق (الموجز ٢.٧). */}
          {openAttempts.filter((a) => a.id !== pendingAttempt?.id && a.status !== 'CREATED').length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="card-title" style={{ fontSize: 13 }}>عملياتُ بطاقةٍ لم تُحسم</div>
              {openAttempts
                .filter((a) => a.id !== pendingAttempt?.id && a.status !== 'CREATED')
                .map((a) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                    <span className="num" style={{ flex: 1, fontSize: 12 }}>
                      {fmt(a.cardAmount)} · {ATTEMPT_LABEL[a.status]}
                    </span>
                    <button className="btn btn-ghost btn-sm" onClick={() => queryAttempt(a)}>
                      استعلام
                    </button>
                    {canReview && a.status === 'UNKNOWN' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setEvidenceFor(a)}>
                        بدليل
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
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

      {/* ⚖️ بيعٌ ببطاقةٍ برقم مرجع الجهاز من إيصاله — دون اتصالٍ والربطُ فعّال (`ق-١٣٩٧`/١) أو جهازٌ مستقلٌّ بلا ربط (`ق-١٤١٩`). */}
      {deviceRefFor && (
        <div className="overlay" onClick={() => setDeviceRefFor(null)}>
          <div className="modal" data-testid="pos-device-ref" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-head">
              <div className="modal-title">{deviceRefMode === 'offline' ? 'بطاقةٌ دون اتصال' : 'بطاقةٌ على جهازٍ مستقلّ'}</div>
              <button className="modal-close" onClick={() => setDeviceRefFor(null)}>✕</button>
            </div>
            <p style={{ fontSize: 13 }}>
              {deviceRefMode === 'offline'
                ? 'الاتصالُ منقطع وبوابةُ الدفع مربوطة: اشحن على الجهاز مباشرةً، ثم أدخل '
                : 'لا بوابةَ دفعٍ مربوطة: اشحن على جهاز الشبكة، ثم أدخل '}
              <b>رقمَ المرجع المطبوع على إيصاله</b>. يُسجَّل البيعُ غيرَ متحقَّقٍ حتى تطابقه تسويةُ الشبكة.
            </p>
            <div className="field">
              <label>رقمُ مرجع الجهاز</label>
              <input autoFocus value={deviceRef} onChange={(e) => setDeviceRef(e.target.value)} maxLength={64} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setDeviceRefFor(null)}>إلغاء</button>
              <button className="btn btn-primary" disabled={!deviceRef.trim()} onClick={confirmDeviceRef}>
                تسجيلُ البيع
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚖️ الحسمُ اليدويّ بدليلٍ لا بقول — لصاحب المراجعة، بعد أن يُسأل المزوّد (`ق-١٣٩٩`). */}
      {evidenceFor && (
        <div className="overlay" onClick={() => setEvidenceFor(null)}>
          <div className="modal" data-testid="pos-evidence" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-head">
              <div className="modal-title">حسمُ عمليةٍ معلّقة بدليل</div>
              <button className="modal-close" onClick={() => setEvidenceFor(null)}>✕</button>
            </div>
            <p className="num" style={{ fontSize: 13 }}>
              {fmt(evidenceFor.cardAmount)} · يُسأل المزوّدُ أوّلاً — فإن أجاب فجوابُه يحسمها. والحسمُ بدليلٍ لا يُعدّ نهائياً حتى تطابقه تسويةُ الشبكة.
            </p>
            <div className="field">
              <label>رقمُ مرجع الجهاز (من إيصاله)</label>
              <input value={evidence.deviceReference} onChange={(e) => setEvidence({ ...evidence, deviceReference: e.target.value })} maxLength={64} />
            </div>
            <div className="field">
              <label>رمزُ الموافقة (من إيصاله)</label>
              <input value={evidence.approvalCode} onChange={(e) => setEvidence({ ...evidence, approvalCode: e.target.value })} maxLength={32} />
            </div>
            <div className="field">
              <label>ملاحظة</label>
              <input value={evidence.note} onChange={(e) => setEvidence({ ...evidence, note: e.target.value })} maxLength={500} />
            </div>
            {error && <p className="error-text">{error}</p>}
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setEvidenceFor(null)}>إلغاء</button>
              <button className="btn btn-primary" disabled={!evidence.deviceReference.trim() || !evidence.approvalCode.trim()} onClick={submitEvidence}>
                حسمٌ بالدليل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚖️ دفعاتُ البطاقة غيرُ المتحقَّقة — باسم الكاشير وبحال المطابقة ومهلة التسوية (`ق-١٣٩٧`/٢–٣). */}
      {verifications && (
        <div className="overlay" onClick={() => setVerifications(null)}>
          <div className="modal" data-testid="pos-card-verifications" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-head">
              <div className="modal-title">دفعاتُ بطاقةٍ غيرُ متحقَّقة — مهلةُ التسوية {verifications.settlementDays} أيام</div>
              <button className="modal-close" onClick={() => setVerifications(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => openVerifications('open')}>غيرُ مطابَقة</button>
              <button className="btn btn-ghost btn-sm" onClick={() => openVerifications('overdue')}>تجاوزت المهلة</button>
              <button className="btn btn-ghost btn-sm" onClick={() => openVerifications('matched')}>طابقتها تسوية</button>
            </div>
            {verifications.items.length === 0 && <div className="empty-state">لا شيء هنا</div>}
            {verifications.items.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>الفاتورة</th>
                    <th>اليوم</th>
                    <th>المبلغ</th>
                    <th>الكاشير</th>
                    <th>مرجعُ الجهاز</th>
                    <th>بمَ ثبت</th>
                    <th>الحال</th>
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
                      <td>{r.verification === 'MANUAL_EVIDENCE' ? `حسمٌ بدليل${r.resolvedByName ? ` (${r.resolvedByName})` : ''}` : 'برقم مرجع الجهاز'}</td>
                      <td style={{ color: r.matched ? 'var(--emerald)' : r.overdue ? 'var(--rose)' : undefined }}>
                        {r.matched ? `طابقتها ${r.settlementNo ?? 'تسوية'}` : r.overdue ? `تجاوزت المهلة (${r.ageDays} يوماً)` : `تنتظر (${r.ageDays} يوماً)`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {/* ⚖️ المعلّقُ من مناوبةٍ مقفلة — في قائمة المطابقة حتى يُحسم، لا يُخمَّن (`ق-١٤١٨`). */}
            {verifications.unresolvedAttempts.length > 0 && (
              <div data-testid="pos-unresolved-attempts" style={{ marginTop: 12 }}>
                <div className="card-title">عملياتُ بطاقةٍ لم تُحسم من مناوباتٍ مقفلة ({verifications.unresolvedAttempts.length})</div>
                <table>
                  <thead>
                    <tr>
                      <th>المبلغ</th>
                      <th>الكاشير</th>
                      <th>البدء</th>
                      <th>الحال</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verifications.unresolvedAttempts.map((a) => (
                      <tr key={a.attemptId}>
                        <td className="num">{fmt(a.amount)}</td>
                        <td>{a.cashierName ?? '—'}</td>
                        <td className="num">{a.createdAt.slice(0, 16).replace('T', ' ')}</td>
                        <td>{a.status === 'UNKNOWN' ? 'معلّقة — تنتظر جوابَ المزوّد أو الدليل' : a.status === 'CHARGING' ? 'تُشحن' : 'قُبلت ولم تكتمل'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
              {/* نصٌّ ظاهر على الإيصال — مسار الأوفلاين المعتمد (ق-١٩٢/أ): الممتثلة تصدر عند العودة بتاريخ هذا البيع. */}
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                إيصالٌ مؤقّت — تُصدَر الفاتورة الممتثلة تلقائياً بتاريخ هذا البيع فور عودة الاتصال
              </p>
              {/* رمز الهيئة للمرحلة الأولى — مبنيٌّ على الجهاز، داخل منطقة الطباعة (ق-١٨٨). */}
              {offlineReceipt.zatcaQr && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <ZatcaQr payload={offlineReceipt.zatcaQr} size={128} />
                </div>
              )}
            </div>
            {/* خارج منطقة الطباعة عمداً — تنبيهٌ للكاشير لا سطراً على إيصال العميل. */}
            {!offlineReceipt.zatcaQr && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                الإيصال بلا رمز الهيئة — لم يُخبَّأ الاسم القانوني والرقم الضريبي قبل الانقطاع؛ أكملهما في ملف المنشأة عند عودة الاتصال.
              </p>
            )}
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
              {/* رمز الهيئة على إيصال العميل — إلزاميٌّ توليداً وطباعةً (الملحق ١ · ق-١٨٦). داخل منطقة الطباعة عمداً. */}
              {receipt.receiptQr && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                  <ZatcaQr payload={receipt.receiptQr} size={128} />
                </div>
              )}
            </div>
            {/* ⑤A4: فاتورةٌ كاملة (مشترٍ مؤسّسة/اعتباريّ/مسجَّل) تُجاز قبل أن تُشارَك — لا طباعةَ هنا، والتسليمُ من شاشة الفواتير بعد الإجازة. */}
            {receipt.clearance?.required && (
              <p className="hint" data-testid="pos-clearance-gate" style={{ color: 'var(--rose)' }}>
                {receipt.clearance.message ?? 'فاتورةٌ ضريبيةٌ كاملة — تُجاز لدى الهيئة قبل تسليمها؛ تُطبع من شاشة الفواتير بعد الإجازة.'}
              </p>
            )}
            {/* خارج .print-receipt عمداً — تنبيه للكاشير لا سطراً على إيصال العميل. */}
            {!receipt.receiptQr && !receipt.clearance?.required && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                الإيصال بلا رمز الهيئة — أكمل الاسم القانوني والرقم الضريبي في ملف المنشأة.
              </p>
            )}
            {/* ق-١٩٦/١: سقوطُ الختم لا يُسقط البيع — إيصالٌ بالوسوم الخمسة، وتنبيهٌ للكاشير خارج الإيصال. */}
            {receipt.stampError && (
              <p className="hint" style={{ color: 'var(--rose)' }}>
                لم يُختم عند البيع — خرج الإيصال بالوسوم الخمسة؛ يُعاد الختم والإبلاغ تلقائياً. السبب: {receipt.stampError}
              </p>
            )}
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
              {!receipt.clearance?.required && (
                <button className="btn btn-primary" onClick={() => window.print()}>
                  🖨 طباعة
                </button>
              )}
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
