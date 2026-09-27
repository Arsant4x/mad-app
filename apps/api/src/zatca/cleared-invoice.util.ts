import xpath from 'xpath';
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
