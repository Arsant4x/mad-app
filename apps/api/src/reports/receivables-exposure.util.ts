import { Prisma } from '@prisma/client';
import { requestedBranchFilter } from '../branches/branch-scope.util';
import { adjustmentSign } from '../common/adjustment/adjustment-note.util';
import { round2 } from '../common/money/rounding';
import { NOT_REPLACED_REJECTED } from '../invoices/active-documents.util';

/**
 * ⭐ **تعرّضُ العميل — المصدرُ الواحد لِـ«كم يدين لنا»** (`ق-٣٤١`).
 *
 * ── لماذا استُخرج ────────────────────────────────────────────────────────
 *
 * **«المتبقّي» كان يُحسب في ثلاثة مواضع بلا دالّةٍ مشتركة**: `openInvoices` في
 * المقبوضات · حارسُ التخصيص · وتقريرُ الأعمار. **وحدُّ الائتمان كان سيصير
 * رابعاً** — ⚠️ **وتاجرٌ يقرأ في الأعمار `٤٠٬٠٠٠` وفي رسالة المنع `٤٥٬٠٠٠`
 * يفقد الثقة في الاثنين**. **فيُستخرَج أكملُها مصدراً واحداً، ويقرأ الحدُّ منه**
 * — **وهذا شرطُ قبولٍ يسبق الحدّ لا يتبعه** (أمرُ المالك).
 *
 * ── ولماذا الأعمارُ هي الأكمل ────────────────────────────────────────────
 *
 * وحدَها تحسب: **الإشعاراتِ الدائنة والمدينة** (منسوبةً لفواتيرها وغيرَ
 * منسوبة) · **والأرصدةَ غير المخصَّصة** (دفعةٌ على الحساب خفّضت `1200` بلا
 * فاتورةٍ تنتمي إليها) · **وبسعر الفاتورة** لا بسعر اليوم.
 *
 * ⚠️ **وسعرُ الفاتورة هو المتّسق مع الدفتر وحده**: قيدُ الفاتورة رحّل
 * `baseTotal` على `1200`، وقيدُ التحصيل خفّضه **بمبلغ التخصيص × سعر الفاتورة**،
 * وفرقُ الصرف ذهب إلى `5600` لا إلى الذمم. **فالمطابقة تصحّ رياضياً لا
 * بالمصادفة.**
 *
 * ── والقراءةُ من الحقيقة لا من حالةٍ موازية (القاعدة ١١) ─────────────────
 *
 * **لا حقلَ «مدفوع» ولا حالةَ فاتورةٍ تدخل الحساب إطلاقاً** — المتبقّي
 * **يُشتقّ** من المستندات والتخصيصات في كل قراءة.
 */
export interface ExposureFilter {
  /** تاريخُ القياس — يُضبط على آخر اللحظة من يومه قبل الاستدعاء. */
  asOf: Date;
  /**
   * فروعُ القارئ — **لازمةٌ لا اختياريّة** (`ق-٥١٧`): فرعٌ يُطلب باسمه يُقاس
   * عليها قبل أن يُرشَّح، وبلا فرعٍ مطلوب تُرشَّح بها. **فتقريرُ الأعمار لا يصير
   * باباً جانبياً إلى فواتيرَ تحجبها القائمة.**
   */
  allowedBranchIds: string[] | 'all';
  branchId?: string | null;
  customerId?: string | null;
}

/** شرائحُ العمر بالأيام من الاستحقاق — **لا من اليوم دائماً**. */
export interface ExposureRow {
  customerId: string;
  customerName: string;
  /** لم يحلّ استحقاقُها بعد. */
  current: number;
  d1: number;
  d31: number;
  d61: number;
  d90: number;
  /**
   * ⚠️ **رصيدٌ لا ينتمي إلى عمر**: دفعةٌ على الحساب أو إشعارٌ دائن بلا فاتورة
   * **يخفّضان `1200` دون أن ينتميا لشريحة** — **فيظهران في عمودٍ مستقلّ
   * يُطرح من إجمالي العميل، لا يُحشران في شريحةٍ كذباً**.
   */
  unapplied: number;
  /** مجموعُ الشرائح والرصيدِ غير المنسوب — **وهو «تعرّضُ العميل»**. */
  total: number;
}

/**
 * يعيد صفَّ تعرّضٍ لكل عميلٍ له رصيدٌ عند `asOf`.
 *
 * ⚠️ **و`tx` معاملةُ المستدعي**: فمن يقرأ التعرّضَ **داخل معاملة إنشاء فاتورة**
 * يرى ما تراه معاملتُه — **ولا تُفتح معاملةٌ ثانية** (`ق-٣٥٩`).
 */
/** قسطُ إيجارٍ استُحقّ ولم يُقبض — الصفُّ الثاني في الأعمار (`ق-٩٢٥/④`). */
export interface RentReceivableRow {
  customerId: string;
  customerName: string;
  contractNo: string;
  tenant: string;
  unitNo: string | null;
  installmentId: string;
  dueDate: Date;
  /** ما استُحقّ إجمالاً (موقَّعاً — الخصمُ والعكسُ يُنقصانه) حتى تاريخ القياس. */
  accrued: number;
  /** ما سُدِّد منه بسعر العقد — كما خُفِّض `1200`. */
  paid: number;
  remaining: number;
  bucket: 'current' | 'd1' | 'd31' | 'd61' | 'd90';
}

/**
 * **ذممُ الإيجار** — أقساطٌ على أساس الاستحقاق (`ق-٩١٧`) استُحقّت حتى `asOf` ولم تُسدَّد كلُّها.
 *
 * المتبقّي = مجموعُ صفوف الاستحقاق (موقَّعةً) − ما سُدِّد **بسعر العقد** — وهو ما رحّله قيدُ القبض على
 * `1200` (`postPartySettlementEntry`: الذمّةُ بسعر مستندها وفرقُ الصرف على `5600`)، فالمطابقةُ تصحّ
 * رياضياً. والعمرُ من `dueDate`؛ والمقدَّمةُ استُحقّت وسُدِّدت في يومها فلا تظهر. **وعلى مستوى المنشأة
 * لا الفرع**: العقودُ بلا فرع، فلا تدخل تقريرَ فرعٍ بعينه ولا تقريرَ قارئٍ مقصورٍ على فروعه.
 */
export async function rentReceivables(tx: Prisma.TransactionClient, filter: ExposureFilter): Promise<RentReceivableRow[]> {
  if (filter.allowedBranchIds !== 'all' || filter.branchId) return [];
  const { asOf } = filter;
  const installments = await tx.installment.findMany({
    where: {
      accrualBasis: 'ACCRUAL',
      contract: { customerId: filter.customerId ? filter.customerId : { not: null } },
      accruals: { some: { date: { lte: asOf } } },
    },
    select: {
      id: true,
      dueDate: true,
      contract: {
        select: { no: true, tenant: true, customerId: true, currency: true, exchangeRate: true, customer: { select: { name: true } }, unit: { select: { unitNo: true } } },
      },
      accruals: { where: { date: { lte: asOf } }, select: { baseGross: true } },
      payments: { where: { date: { lte: asOf } }, select: { netAmount: true, baseNetAmount: true, currency: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  const rows: RentReceivableRow[] = [];
  for (const i of installments) {
    const c = i.contract;
    if (!c.customerId || !c.customer) continue;
    const rate = Number(c.exchangeRate) || 1;
    const accrued = round2(i.accruals.reduce((s, a) => s + Number(a.baseGross), 0));
    const paid = round2(i.payments.reduce((s, p) => s + (p.currency === c.currency ? round2(Number(p.netAmount) * rate) : Number(p.baseNetAmount)), 0));
    const remaining = round2(accrued - paid);
    if (Math.abs(remaining) < 0.005) continue;
    const days = Math.floor((asOf.getTime() - new Date(i.dueDate).getTime()) / 86400000);
    const bucket = days <= 0 ? 'current' : days <= 30 ? 'd1' : days <= 60 ? 'd31' : days <= 90 ? 'd61' : 'd90';
    rows.push({
      customerId: c.customerId,
      customerName: c.customer.name,
      contractNo: c.no,
      tenant: c.tenant,
      unitNo: c.unit?.unitNo ?? null,
      installmentId: i.id,
      dueDate: i.dueDate,
      accrued,
      paid,
      remaining,
      bucket,
    });
  }
  return rows;
}

export async function customerExposure(tx: Prisma.TransactionClient, filter: ExposureFilter, rentSink?: RentReceivableRow[]): Promise<ExposureRow[]> {
  const { asOf } = filter;
  const branchWhere = requestedBranchFilter(filter.allowedBranchIds, filter.branchId);
  const customerWhere = filter.customerId ? { customerId: filter.customerId } : {};

  // كل مستندات الذمم حتى تاريخ القياس: الفواتير وإشعاراتها معاً —
  // فالإشعار يعدّل ذمّة فاتورته لا ذمّةً مستقلة. والمردودةُ التي صدر بدلُها
  // تخرج والبدلُ يدخل — من المصدر الواحد لا بنسخةٍ هنا (`ق-٩٦٧/١`).
  // ④A1: مستندُ الدفعة المقدَّمة (386) ليس ذمّةً — سندُ قبضه مخصَّصٌ عليه حتى يُطبَّق، ثم ينتقل التخصيصُ إلى فاتورة التوريد؛
  // فلا يدخل الأعمارَ لا فاتورةً ولا إشعاراً (كان سيُقرأ إشعاراً مديناً يزيد الذمّة).
  const documents = await tx.invoice.findMany({
    where: { issueDate: { lte: asOf }, docType: { not: 'PREPAYMENT' }, ...branchWhere, ...customerWhere, ...NOT_REPLACED_REJECTED },
    select: {
      id: true,
      no: true,
      docType: true,
      relatedInvoiceId: true,
      customerId: true,
      customer: { select: { id: true, name: true } },
      issueDate: true,
      dueDate: true,
      total: true,
      baseTotal: true,
      exchangeRate: true,
      currency: true,
    },
  });

  const invoices = documents.filter((d) => d.docType === 'INVOICE');
  const notes = documents.filter((d) => d.docType !== 'INVOICE');

  // تخصيصات السندات حتى التاريخ — بمبلغ المستند، يُترجم بسعر فاتورته.
  const allocations = await tx.paymentAllocation.groupBy({
    by: ['invoiceId'],
    where: { payment: { date: { lte: asOf } } },
    _sum: { amount: true },
  });
  const allocByInvoice = new Map(allocations.map((a) => [a.invoiceId, Number(a._sum.amount ?? 0)]));

  // إشعارات منسوبة لفواتيرها، وأخرى بلا فاتورة (تُطرح من رصيد عميلها).
  // وإشعارٌ يصحّح إشعاراً (`ق-٩٥٢`: مدينٌ على دائنٍ زائد، دائنٌ على مدينٍ زائد) يُنسب إلى
  // **فاتورة الجذر** — فالتصحيحُ يعود على ذمّة الفاتورة التي عُدِّلت، لا على الإشعار نفسِه.
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const rootInvoiceOf = (relatedId: string): string | null => {
    let current: string | null = relatedId;
    for (let hops = 0; current !== null && noteById.has(current) && hops < 8; hops++) current = noteById.get(current)!.relatedInvoiceId;
    return current;
  };
  const noteAdjustment = new Map<string, number>();
  const unappliedByCustomer = new Map<string, number>();
  for (const n of notes) {
    const base = Number(n.baseTotal);
    const signed = adjustmentSign(n.docType, 'CREDIT_NOTE') * base;
    const root = n.relatedInvoiceId ? rootInvoiceOf(n.relatedInvoiceId) : null;
    if (root) noteAdjustment.set(root, (noteAdjustment.get(root) ?? 0) + signed);
    else unappliedByCustomer.set(n.customerId, (unappliedByCustomer.get(n.customerId) ?? 0) + signed);
  }

  // دفعات لم تُخصَّص: خفّضت 1200 بلا فاتورة تنتمي إليها.
  const payments = await tx.payment.findMany({
    where: { date: { lte: asOf }, ...branchWhere, ...customerWhere },
    select: { customerId: true, amount: true, exchangeRate: true, allocations: { select: { amount: true } } },
  });
  for (const p of payments) {
    const allocated = p.allocations.reduce((sum, a) => sum + Number(a.amount), 0);
    const onAccount = Number(p.amount) - allocated;
    if (Math.abs(onAccount) > 0.005) {
      unappliedByCustomer.set(p.customerId, (unappliedByCustomer.get(p.customerId) ?? 0) - onAccount * Number(p.exchangeRate));
    }
  }

  const buckets = () => ({ current: 0, d1: 0, d31: 0, d61: 0, d90: 0 });
  const rows = new Map<string, ExposureRow>();
  const rowFor = (customerId: string, customerName: string) => {
    let r = rows.get(customerId);
    if (!r) {
      r = { customerId, customerName, ...buckets(), unapplied: 0, total: 0 };
      rows.set(customerId, r);
    }
    return r;
  };

  for (const inv of invoices) {
    const rate = Number(inv.exchangeRate);
    const allocatedBase = (allocByInvoice.get(inv.id) ?? 0) * rate;
    const remaining = round2(Number(inv.baseTotal) - allocatedBase + (noteAdjustment.get(inv.id) ?? 0));
    // المسدَّدة كاملاً تُستبعد؛ والجزئية تدخل بمتبقيها وحده.
    if (Math.abs(remaining) < 0.005) continue;

    const r = rowFor(inv.customerId, inv.customer.name);
    // العمر من الاستحقاق إلى تاريخ القياس — لا من اليوم دائماً.
    const days = Math.floor((asOf.getTime() - new Date(inv.dueDate).getTime()) / 86400000);
    if (days <= 0) r.current += remaining;
    else if (days <= 30) r.d1 += remaining;
    else if (days <= 60) r.d31 += remaining;
    else if (days <= 90) r.d61 += remaining;
    else r.d90 += remaining;
  }

  // ذممُ الإيجار تدخل شرائحَ عميلها (ق-٩٢٥/④) — فحدُّ الائتمان والأعمارُ يقرآن رقماً واحداً (ق-٣٤١).
  const rent = await rentReceivables(tx, filter);
  for (const r of rent) {
    const row = rowFor(r.customerId, r.customerName);
    row[r.bucket] += r.remaining;
  }
  if (rentSink) rentSink.push(...rent);

  for (const [customerId, amount] of unappliedByCustomer) {
    if (Math.abs(amount) < 0.005) continue;
    const customer =
      documents.find((d) => d.customerId === customerId)?.customer ??
      (await tx.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } }));
    if (!customer) continue;
    rowFor(customerId, customer.name).unapplied += amount;
  }

  return [...rows.values()].map((r) => ({
    ...r,
    current: round2(r.current),
    d1: round2(r.d1),
    d31: round2(r.d31),
    d61: round2(r.d61),
    d90: round2(r.d90),
    unapplied: round2(r.unapplied),
    total: round2(r.current + r.d1 + r.d31 + r.d61 + r.d90 + r.unapplied),
  }));
}

/**
 * تعرّضُ عميلٍ واحد — **وهو ما سيقرأه حدُّ الائتمان** (`ق-٣٣٦`).
 *
 * **صفرٌ حين لا رصيدَ له**: `customerExposure` لا تُخرج صفّاً لعميلٍ متعادل،
 * **وغيابُ الصفّ يعني صفراً لا «غيرَ معروف»**.
 */
export async function exposureOf(tx: Prisma.TransactionClient, customerId: string, asOf: Date): Promise<number> {
  // حدُّ الائتمان يقيس دَينَ العميل على المنشأة كلِّها — فتعرّضٌ يحجب فرعاً
  // يُجيز بيعاً فوق الحدّ من فرعٍ آخر؛ لذلك `'all'` هنا صريحةٌ لا افتراضية.
  const rows = await customerExposure(tx, { asOf, allowedBranchIds: 'all', customerId });
  return rows.find((r) => r.customerId === customerId)?.total ?? 0;
}
