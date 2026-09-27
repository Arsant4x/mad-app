import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import xpath from 'xpath';
import { LINE_ORDER } from '../common/document-lines.util';
import { formatMessage, MSG } from '../common/i18n/messages';
import { type BuyerForInvoiceType, invoiceTypeFor, type LineForInvoiceType } from './hash-chain.util';
import { parseXml } from './ubl/canonicalize.util';

/**
 * ⚖️ **النسخةُ المجازة للفاتورة القياسية — من جواب الهيئة، وهي ما يُسلَّم للمشتري** (`ق-١٥٠٦` · R24).
 *
 * الفاتورةُ القياسية «لا تُعدّ صحيحةً إلا إن أجازتها الهيئة، أي حملت ختمَ إجازتها»، ومنصّةُ فاتورة
 * «تختم المستندَ وتضمّن رمزَه أو تُحدّثه ضمن جواب الواجهة» — الدليلُ الفنيّ التفصيليّ للفوترة
 * الإلكترونية، الإصدار 2، نوفمبر 2022، القسم 4.3.2 (ص50–51). فالنسخةُ التي نختمها نحن (`zatcaSignedXml`)
 * **ليست ما يُسلَّم**؛ ما يُسلَّم ما تعيده الهيئة في `clearedInvoice` (مرمَّزاً بـbase64).
 *
 * ⛔ **ولا يُعدَّل مستندُ الهيئة بحرف**: نصٌّ يحمل بايتاً صفريّاً (يرفضه عمودُ النصّ) أو ليس مستندَ فاتورة
 * UBL يُعدّ **غيرَ واصل** (`null`) — لا يُنقّى ولا يُقصّ، فمستندٌ مُعدَّل ليس المستندَ المجاز.
 */
const UBL_INVOICE_NAMESPACE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const NUL = String.fromCharCode(0);

const UBL = xpath.useNamespaces({
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
});

/** نصُّ المستند المجاز من جواب الإجازة — أو `null` إن غاب أو لم يكن مستندَ فاتورةٍ سليماً. */
export function clearedInvoiceFrom(body: Record<string, unknown>): string | null {
  const raw = body.clearedInvoice;
  if (typeof raw !== 'string') return null;
  const compact = raw.replace(/\s+/g, '');
  // base64 صارمٌ: `Buffer.from` يتجاهل ما ليس منه بصمت، فنصٌّ مكسورٌ كان سيُفكّ إلى بقايا.
  if (compact.length === 0 || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null;
  const xml = Buffer.from(compact, 'base64').toString('utf8');
  if (xml.includes(NUL)) return null;
  try {
    const root = parseXml(xml).documentElement;
    if (!root || root.localName !== 'Invoice' || root.namespaceURI !== UBL_INVOICE_NAMESPACE) return null;
  } catch {
    return null;
  }
  return xml;
}

/**
 * ⚖️ **اسمُ الملف النظاميّ** — معيارُ تنفيذ XML للفاتورة الإلكترونية، الإصدار 1.2، القسم 14 (ص71):
 * «Seller Identification + "_" + Date + "T" + Time + "_" + IRN.xml» — رقمُ المورّد الضريبيّ (BT-31)،
 * وتاريخُ الإصدار بلا شَرطات (BT-2)، ووقتُه بلا نقطتَين (KSA-25)، ورقمُ الفاتورة وكلُّ ما ليس حرفاً
 * لاتينياً أو رقماً فيه شَرطة (BT-1). **تُقرأ القيمُ الأربع من المستند نفسِه** لا من الصفّ — فالاسمُ
 * يطابق ما في الملف حرفاً. وقيمةٌ غائبة ⟵ `null`، ويُسمّي المستدعي الملفَّ برقمه وحدَه.
 */
export function zatcaFileName(xml: string): string | null {
  let doc: Document;
  try {
    doc = parseXml(xml);
  } catch {
    return null;
  }
  const text = (path: string) => String(UBL(`string(${path})`, doc as unknown as Node)).trim();
  const vat = text('/*/cac:AccountingSupplierParty/cac:Party/cac:PartyTaxScheme/cbc:CompanyID');
  const date = text('/*/cbc:IssueDate').replace(/-/g, '');
  const time = text('/*/cbc:IssueTime').replace(/:/g, '');
  const irn = text('/*/cbc:ID').replace(/[^A-Za-z0-9]/g, '-');
  if (!vat || !date || !time || !irn) return null;
  const name = `${vat}_${date}T${time}_${irn}.xml`;
  // الاسمُ يدخل ترويسةَ `Content-Disposition` — فما ليس من هذه الحروف لا يُرسل فيها.
  return /^[A-Za-z0-9._-]+$/.test(name) ? name : null;
}

/**
 * ⚖️ **واجهةُ الوحدة لشاشة الفواتير** (`ق-١٣٥٠` · §3.8): ما هو من الهيئة يسكن هنا، والفاتورةُ تسأل ولا تعرف.
 *
 * حالُ النسخة المجازة كما تعرضه القائمة: `available` تُنزَّل · `missing` قياسيةٌ أُجيزت ولم تُحفظ نسختُها (قبل هذا الحقل
 * أو قبولٌ بلا نسخة) · `null` لا نسخةَ تُنتظر (لم تُجَز بعد، أو مبسّطة — تسليمُها خارج البند).
 */
export type ClearedCopyState = 'available' | 'missing' | null;

interface ClearedCopyRow {
  zatcaStatus: string;
  zatcaClearedXml: string | null;
  customer: BuyerForInvoiceType;
  lines: ReadonlyArray<LineForInvoiceType>;
}

/** صفُّ القائمة بلا المستند (نصٌّ كاملٌ لكلّ صفّ) وبحالِه مكانه — فالمستندُ يُنزَّل من طريقه وحدَه. */
export function withClearedCopyState<T extends ClearedCopyRow>(row: T): Omit<T, 'zatcaClearedXml'> & { clearedCopy: ClearedCopyState } {
  const { zatcaClearedXml, ...rest } = row;
  const clearedCopy: ClearedCopyState =
    zatcaClearedXml !== null ? 'available' : row.zatcaStatus === 'CLEARED' && invoiceTypeFor(row.customer, row.lines) === 'standard' ? 'missing' : null;
  return { ...rest, clearedCopy };
}

/**
 * ⚖️ **ما يُسلَّم للمشتري: النسخةُ المجازة كما أعادتها الهيئة، باسم ملفّها النظاميّ** (`ق-١٥٠٦`/١ و٤).
 *
 * **بعد الإجازة لا قبلها** — ولا يُستبدل بها `zatcaSignedXml` (نسختُنا قبل الإجازة) في أيّ حال. وما لا نسخةَ له يُرفض بسببه
 * المسمّى: مبسّطةٌ (خارج البند) · لم تُجَز بعد · أُجيزت قبل حفظ النسخة (لا تُملأ رجعياً). و`where` يحمل حدَّ الفرع من المستدعي.
 */
export async function readClearedDelivery(tx: Prisma.TransactionClient, where: Prisma.InvoiceWhereInput): Promise<{ fileName: string; xml: string }> {
  const invoice = await tx.invoice.findFirst({
    where,
    select: {
      no: true,
      zatcaStatus: true,
      zatcaClearedXml: true,
      customer: { select: { kind: true, vatNumber: true, country: true } },
      lines: { ...LINE_ORDER, select: { taxExemptionReasonCode: true } },
    },
  });
  if (!invoice) throw new NotFoundException(MSG.invoice_not_found);
  if (invoice.zatcaClearedXml) {
    // والاسمُ من المستند نفسِه؛ وإن غابت إحدى قيمه الأربع سُمّي برقمه وحدَه (حدٌّ معلَن).
    return { fileName: zatcaFileName(invoice.zatcaClearedXml) ?? `${invoice.no.replace(/[^A-Za-z0-9]/g, '-')}.xml`, xml: invoice.zatcaClearedXml };
  }
  if (invoiceTypeFor(invoice.customer, invoice.lines) === 'simplified') throw new ConflictException(MSG.invoice_xml_simplified_out_of_scope);
  if (invoice.zatcaStatus !== 'CLEARED') throw new ConflictException(formatMessage(MSG.invoice_xml_not_cleared, { no: invoice.no }));
  throw new ConflictException(formatMessage(MSG.invoice_xml_cleared_copy_missing, { no: invoice.no }));
}
