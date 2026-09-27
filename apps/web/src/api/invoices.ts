import { apiClient } from './client';
import type { Customer } from './customers';
import type { MoneyText } from '../lib/money';
import type { TaxCategory } from '../lib/vat';
import type { InvoiceDocType, InvoiceStatus } from '@mad-app/shared/api/enums';
import type { ZatcaInvoiceStatus } from '@mad-app/shared/api/zatca-enums';
import type { CreateCreditNoteDto, CreateDebitNoteDto, CreateInvoiceDto, InvoiceLineDto, UpdateInvoiceDto } from '@mad-app/shared/api/requests';

export type { Customer } from './customers';

export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** ④B1 — خصمُ السطر مبلغاً كما خُزّن (BT-136)؛ الصافي = الكمية × السعر − الخصم. */
  discount: string;
  /** ⑧ مشتقّةٌ من الفئة — للقراءة. */
  taxRate: string;
  /** ⑧ الفئةُ والسبب كما نُسخا لحظةَ البيع (من الصنف أو من إعلان السطر). */
  taxCategory: TaxCategory;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
}

/**
 * ⚠️ يجب أن يطابق `enum InvoiceStatus` في prisma/schema.prisma حرفياً.
 *
 * لا رابط آلي بين الاثنين: هذا النوع مكتوب بيد، فقيمةٌ تُضاف في المخطط تمرّ
 * صامتة هنا. حدث ذلك مع PARTIAL في 4.5 — أُضيفت للمخطط ولـrecomputeInvoiceStatus
 * ونُسيت هنا، فانهارت الشاشات عند أول فاتورة مسدَّدة جزئياً على بيانات حقيقية.
 */
export type { InvoiceStatus };

/** Credit/debit notes are invoice rows too (ZATCA's chain runs across all
 * document kinds); amounts stay positive — `docType` carries the direction. */
/** ④A1: `PREPAYMENT` فاتورةُ دفعةٍ مقدَّمة (رمزُ الهيئة 386) — تصدر من سند قبضٍ وتُطبَّق على فاتورة التوريد. */
export type { InvoiceDocType };

export interface Invoice {
  docType: InvoiceDocType;
  /** Credit/debit notes only: the invoice this note adjusts. */
  relatedInvoice: { id: string; no: string } | null;
  /** بدلٌ عن مردودة (ق-٩٥٨): المردودةُ التي يحلّ محلَّها — والإحالةُ تظهر في الشاشة والمستند (ق-٩٦٣). */
  replacesInvoice: { id: string; no: string } | null;
  /** مردودةٌ صدر بدلُها — «مغلقة» مشتقّةٌ من وجوده لا من حالةٍ تُكتب (ق-٩٦٤). */
  replacedBy: { id: string; no: string } | null;
  /** Credit/debit notes only: the reason the note was issued (goes to ZATCA). */
  adjustmentReason: string | null;
  /** POS فقط: كيف دُفعت (CASH/CARD) وأي مناوبة سجّلتها. */
  paymentMethod?: string | null;
  posPayments?: { method: string; amount: string | number }[];
  posShiftId?: string | null;
  id: string;
  no: string;
  customerId: string;
  customer: Customer;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  branchId: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
  notes: string | null;
  /** ما تبقّى على هذا المستند فعلاً: الإجمالي − الإشعارات الدائنة − المقبوض.
   *  يُحسب في الخادم (invoices.service.ts outstandingOf) فلا تُعيد كل شاشة
   *  حسابه بطريقتها — وهو ما أنتج رقمين مختلفين لنفس العميل.
   *  ② مالٌ نصّاً بخانتين (`ق-١٢٣٥`): يُقرأ بـ`num()` قبل أي جمع. */
  outstanding: MoneyText;
  /** كم رُدّ من هذه الفاتورة بإشعارات دائنة — نصٌّ بخانتين. */
  creditedTotal: MoneyText;
  /** Base64 TLV for the ZATCA phase-1 QR, or null while the company profile
   * is missing its legal name or VAT number. Built server-side. */
  zatcaQr: string | null;
  /** الرمز التساعي المحفوظ لحظةَ الختم — إن وُجد فهو `zatcaQr` نفسه (ق-١٨٧). */
  zatcaQrPayload?: string | null;
  /** ردُّ الكاشير فقط: هل خُتم عند البيع، وإن لم يُختم فلماذا (ق-١٩٦/١). */
  zatcaStamped?: boolean;
  stampError?: string | null;

  /** Phase 2 — where this invoice stands with the authority. All null/default
   * until it is submitted; the chain values are assigned at submission and
   * kept across retries. */
  zatcaStatus: ZatcaInvoiceStatus;
  /** نوعُ المستند لدى الهيئة (كاملة/مبسّطة) من صفة المشتري ورقمِه — يحسبه الخادم (②A1)؛ يأتي مع القائمة. */
  invoiceType?: 'standard' | 'simplified';
  /**
   * ⚖️ (ق-١٥٠٦) حالُ النسخة المجازة من الهيئة — يحسبه الخادم ويأتي مع القائمة، والمستندُ نفسُه لا يأتي فيها:
   * `available` تُنزَّل ملفَّ XML · `missing` قياسيةٌ أُجيزت ولم تُحفظ نسختُها · `null` لا نسخةَ تُنتظر.
   */
  clearedCopy?: 'available' | 'missing' | null;
  /** The authority's clearance or rejection note, or the local reason a
   * submission could not be completed. */
  zatcaMessage: string | null;
  zatcaSubmittedAt: string | null;
  /** Invoice Counter Value — position in the company's submission sequence. */
  zatcaIcv: number | null;
  lines: InvoiceLine[];
}

export type InvoiceLineInput = InvoiceLineDto;

export type CreateInvoiceInput = CreateInvoiceDto;

/** ④A1: مستندُ دفعةٍ مقدَّمة معلَّق (لم يُطبَّق) كما يقرؤه الخادم — مالٌ نصّاً بخانتين. */
export interface OpenPrepayment {
  id: string;
  no: string;
  issueDate: string;
  currency: string;
  receiptNo: string | null;
  subtotal: string;
  taxTotal: string;
  total: string;
}

/**
 * ⭐ **رمزُ «تجاوز الحدّ ممكن»** — يُقرأ من ردّ الخادم **لا من نصّ الرسالة**.
 *
 * ⚠️ **والنصُّ لا يُطابَق**: مترجَمٌ ومصاغٌ للتاجر، **فمطابقتُه تنكسر صامتةً**
 * بأول تحسينِ صياغة — **فيختفي زرُّ التجاوز ويُقرأ الرفضُ منعاً صلباً وهو
 * ليس كذلك**. وقيمتُه مصدرُها `apps/api/src/invoices/credit-context.ts`.
 */
export const CREDIT_LIMIT_EXCEEDED = 'CREDIT_LIMIT_EXCEEDED';

/**
 * لا `status` هنا (`ق-١١٩٨`/②): حالةُ السداد تُشتقّ من المقبوضات ولا تُرسَل من الواجهة.
 * ⚖️ **وما يقبله `UpdateInvoiceDto` وحدَه** (`ق-١٣٨٤`): لا `issuedAt` ولا `issuedOffsetMin` ولا `creditOverride` ولا `prepaymentInvoiceIds` —
 * كانت تُورث من نوع الإنشاء فيُردّ بها `400`.
 */
export type UpdateInvoiceInput = UpdateInvoiceDto;

export type CreateCreditNoteInput = CreateCreditNoteDto;

export const listInvoices = () => apiClient.get<Invoice[]>('/invoices').then((r) => r.data);

/**
 * ⚖️ (ق-١٥٠٦/١ و٤) **تسليمُ الفاتورة القياسية: نسختُها المجازة من الهيئة ملفَّ XML** — عبر blob بالرأس `Authorization`.
 * والاسمُ اسمُ الخادم النظاميّ (معيارُ XML ١.٢، القسم 14) من `Content-Disposition` — لا يُعاد حسابُه هنا فيفترق عنه؛
 * وإن تعذّرت قراءتُه فرقمُ الفاتورة.
 */
export const downloadClearedXml = async (invoice: Pick<Invoice, 'id' | 'no'>) => {
  const res = await apiClient.get(`/invoices/${invoice.id}/cleared-xml`, { responseType: 'blob' }).catch(async (e: unknown) => {
    // ردُّ الرفض (`409` المسمّى) يصل Blob لا JSON حين يُطلب blob — فيُعاد JSON كي تقرأ الشاشةُ `message` كعادتها.
    const response = (e as { response?: { data?: unknown } }).response;
    if (response?.data instanceof Blob) {
      try {
        response.data = JSON.parse(await response.data.text());
      } catch {
        // ليس JSON — يبقى كما وصل، والشاشةُ تعرض رسالتَها العامّة.
      }
    }
    throw e;
  });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${invoice.no.replace(/[^A-Za-z0-9]/g, '-')}.xml`;
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
/** ④A1: الدفعاتُ المقدَّمة المعلَّقة لعميل — ما يعرضه بنّاءُ الفاتورة للتطبيق. */
export const listOpenPrepayments = (customerId: string) => apiClient.get<OpenPrepayment[]>(`/invoices/open-prepayments/${customerId}`).then((r) => r.data);
export const createInvoice = (dto: CreateInvoiceInput) => apiClient.post<Invoice>('/invoices', dto).then((r) => r.data);
/** الملاحظاتُ وحالةُ السداد وحدَهما — المحتوى الموقَّع لا يُعدَّل بعد الإصدار (الخادم يرفضه بـ409 · ق-٩٤٣)، ولا حذفَ لمستندٍ صادر. */
export const updateInvoice = (id: string, dto: UpdateInvoiceInput) => apiClient.patch<Invoice>(`/invoices/${id}`, dto).then((r) => r.data);
export const issueCreditNote = (invoiceId: string, dto: CreateCreditNoteInput) => apiClient.post<Invoice>(`/invoices/${invoiceId}/credit-note`, dto).then((r) => r.data);

export type CreateDebitNoteInput = CreateDebitNoteDto;

/** بدلٌ عن مردودة (ق-٩٥٨): مستندٌ جديدٌ بعدّادٍ وتجزئةٍ جديدَين، والمردودةُ تُغلق ولا تُمسّ؛ يُرسَل معه ساعةُ الجهاز كما في الإنشاء. */
export const issueReplacement = (invoiceId: string, dto: { issuedAt?: string; issuedOffsetMin?: number } = {}) =>
  apiClient.post<Invoice>(`/invoices/${invoiceId}/replacement`, dto).then((r) => r.data);
export const issueDebitNote = (invoiceId: string, dto: CreateDebitNoteInput) => apiClient.post<Invoice>(`/invoices/${invoiceId}/debit-note`, dto).then((r) => r.data);
