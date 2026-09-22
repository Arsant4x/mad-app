import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * ZATCA phase-2 invoice hash chain.
 *
 * Every invoice carries the hash of the previous one (PIH — Previous Invoice
 * Hash) and is itself hashed, so altering or deleting an invoice invalidates
 * every hash issued after it. That is the property the authority checks.
 *
 * ⭐ **العدّاد والسلسلة داخل وحدة الإصدار (`EGS`)، لا المنشأة** (`ق-١٧٧`، الدفعة ب).
 *
 * نصّ الهيئة (الدليل الفني المفصّل v2): «على المكلَّف توليد المستندات **في تسلسلٍ
 * واحد لكل `EGS` ربطها**، ويسري التسلسل على القياسية والمبسّطة معاً». وموظف الهيئة
 * (Ankit، مجتمع فاتورة 7680): «`ICV` و`PIH` **يبدآن من جديد** لكل `CSID` جديدة».
 * فالدالتان هنا **تأخذان الوحدة شرطاً** لا خياراً: عدٌّ بلا وحدة لا يُكتب أصلاً —
 * وحارسٌ يقرأ هذا المصدر ويسقط إن عاد الشرط يُحذف (`egs-unit.spec.ts`).
 *
 * والوحدة الافتراضية (`DEFAULT_WEB`) واحدةٌ لكل منشأة اليوم، فسلوك المنشأة
 * ذات الوحدة الواحدة **لم يتغيّر رقماً واحداً** — وهذا ما تقيسه حزم الـe2e
 * القائمة بلا تعديل. والوحدة الثانية (كاشيرٌ يحمل شهادته — الدفعتان ج/د) تبدأ
 * من `1` ومن الأساس، **بالشكل**: مجسّ `icv-concurrency.live.spec.ts` ④.
 *
 * ⚠️ **Verify before going live.** The genesis value below is defined by the
 * ZATCA e-invoicing specification, and that spec is versioned. This follows the
 * widely-published rule (first invoice's PIH = base64 of SHA-256 of "0"), which
 * differs from the mockup's placeholder (`btoa('0'.repeat(44))`).
 *
 * The hash itself is **not** computed here: it is the SHA-256 of the
 * canonicalized UBL invoice, produced by `ubl/xades.util.ts` as a by-product of
 * signing. An earlier version hashed a JSON summary of the invoice fields,
 * which chained correctly but would never have matched what the authority
 * recomputes from the XML it receives.
 */

/** base64( SHA-256("0") ) — the chain's genesis value for a unit's first invoice. */
export const GENESIS_PREVIOUS_HASH = createHash('sha256').update('0').digest('base64');

/**
 * The next position in **this unit's** submission sequence: `MAX(zatcaIcv) + 1`.
 *
 * ⚠️ **كان `count() + 1` — وهو عطلُ ترقيم المستندات بعينه** (`MAX` لا `count`): متى وُجدت
 * فجوةٌ في المواقع (موقعٌ أُفرغ — كما تفعل تنظيفاتُ الاختبارات — أو صفٌّ سُحب)
 * يُعطي `count()+1` رقماً **محجوزاً**، فيصطدم بـ`P2002`، **وتعيد المحاولةُ الرقمَ نفسه**
 * ثماني مراتٍ ثم تسقط 500 — تصادمٌ حتميٌّ لا سباق. ظهر حين غيّر `jest` ترتيبَ
 * الحزم على قاعدةٍ نظيفة (2026-09-05): تنظيفُ `zatca-invoice-edit-guard` أفرغ مواقعَ
 * فسقطت `zatca-credit-notes` بعده. `MAX+1` لا يعرف الفجوة، فلا يصطدم إلا في السباق
 * الحقيقي — وذاك ما تعالجه إعادةُ المحاولة.
 *
 * A retry must *not* call this — it keeps the number it was first given (`??`).
 * The read is unlocked, so two concurrent callers may still compute the same
 * position; `@@unique([egsUnitId, zatcaIcv])` turns that into a visible
 * `P2002` and `ZatcaService` retries — see the comment above its call.
 *
 * **على مستوى المنشأة بحقّها**: موقعُ الإصدار التالي يُقرأ على وحدة الإصدار
 * (`egsUnitId`) — والسلسلةُ سلسلةُ الوحدة عند الهيئة لا سلسلةُ فرع، وموقعٌ
 * محجوبٌ يُعطي رقماً محجوزاً فيصطدم.
 */
export async function nextIcv(tx: Prisma.TransactionClient, egsUnitId: string): Promise<number> {
  const top = await tx.invoice.aggregate({ where: { egsUnitId, zatcaIcv: { not: null } }, _max: { zatcaIcv: true } });
  return (top._max.zatcaIcv ?? 0) + 1;
}

/**
 * The hash the document at position `icv` must chain onto: **the hash of the
 * document at `icv − 1` in this unit's sequence — whatever the authority said
 * about it** (`ق-١١٩٨`/⑦ — مراجعةٌ خارجية).
 *
 * ── لماذا لا «آخرُ مقبول» (القاعدةُ السابقة، 2026-08-08) ─────────────────
 *
 * كان السلفُ آخرَ مستندٍ **قبلته** الهيئة (`CLEARED`). والختمُ يقع عند الإصدار
 * والإبلاغُ من الطابور بعده (`ق-٩٣٥`)، فمستندٌ `n` مختومٌ لم يُبلَّغ بعد — أو سقط
 * إبلاغُه سقوطَ نقل — **لا يكون سلفاً**، فيُختم `n + 1` على بصمة `n − 1`؛ ثم يُقبل
 * `n` فتحمل الهيئةُ مستندَين سلفُهما واحد: **السلسلةُ تتفرّع** حين يسقط الإبلاغ بعد
 * الختم. وحجّةُ القاعدة السابقة زالت: كانت تخشى أن يُعدَّل مردودٌ فتُعاد بصمتُه —
 * **والصادرُ لا يُعدَّل** (`ق-٩٤٣`)، والمردودُ يُغلق ويُصدَر بدلُه جديداً برقمٍ وبصمةٍ
 * جديدتَين (`ق-٩٥٨`). فبصمةُ الموقع لا تتغيّر أبداً — وهي السلف.
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 *
 * - `icv = 1` ⟵ بصمةُ الأصل (`GENESIS`).
 * - الموقعُ `icv − 1` مختومٌ ⟵ بصمتُه، **أيّاً كانت حالتُه** (`STAMPED` · `SUBMITTING`
 *   · `REJECTED` · `FAILED` · `CLEARED`).
 * - الموقعُ `icv − 1` محجوزٌ **ولم يُختم بعد** (توقيعٌ جارٍ أو سقط) ⟵ **يُرفض الختمُ الآن**
 *   (`ConflictException`) فيعود الطابورُ إليه بعد أن يُختم سلفُه — **فالسلسلةُ لا تتخطّى
 *   موقعاً**؛ ⚠️ **وحدُّه معلَن**: موقعٌ لا يُختم أبداً (شهادةٌ فاسدة) يحبس ما بعده حتى
 *   يُعالَج — وهو الصدقُ لا العطل، فتخطّيه يصنع التفرّعَ الذي يُمنع هنا.
 * - الموقعُ `icv − 1` **غائب** (صفٌّ أُزيل — كما تفعل تنظيفاتُ الاختبارات؛ ولا يقع في
 *   الإنتاج فحارسُ الحذف يحفظ المختوم) ⟵ أعلى موقعٍ مختومٍ دونه، وإلا الأصل.
 *
 * **على مستوى المنشأة بحقّها**: الموقعُ السابق يُقرأ على وحدة الإصدار كلِّها —
 * فبصمةٌ محجوبةٌ عن القارئ تكسر السلسلةَ عند الهيئة التي تحفظها كاملة.
 */
export async function previousChainHash(tx: Prisma.TransactionClient, egsUnitId: string, icv: number): Promise<string> {
  if (icv <= 1) return GENESIS_PREVIOUS_HASH;
  const previous = await tx.invoice.findFirst({ where: { egsUnitId, zatcaIcv: icv - 1 }, select: { zatcaHash: true, no: true } });
  if (previous) {
    if (previous.zatcaHash) return previous.zatcaHash;
    throw new ConflictException(formatMessage(MSG.zatca_previous_unstamped, { no: previous.no, icv: String(icv - 1) }));
  }
  const below = await tx.invoice.findFirst({
    where: { egsUnitId, zatcaIcv: { lt: icv }, zatcaHash: { not: null } },
    orderBy: [{ zatcaIcv: 'desc' }],
    select: { zatcaHash: true },
  });
  return below?.zatcaHash ?? GENESIS_PREVIOUS_HASH;
}

/** ما يحتاجه تقريرُ نوع الفاتورة من المشتري — الصفةُ والرقمُ الضريبيّ (ق-١٢٦١ أ — ②A1). */
export interface BuyerForInvoiceType {
  kind: string;
  vatNumber: string | null | undefined;
  /** بلدُ المشتري (ISO 3166-1 alpha-2) — `SA` غياباً؛ يقرّر مع سطور الصادرات علَمَ الصادرات (⑤A3). */
  country: string | null | undefined;
}

/** سطرُ مستندٍ كما يلزم لاشتقاق علَم الصادرات: سببُ الإعفاء وحدَه. */
export interface LineForInvoiceType {
  taxExemptionReasonCode: string | null | undefined;
}

/** أسبابُ الصادرات في قائمة الهيئة (`exemption-reasons.ts`): صادراتُ السلع م٣٢ وصادراتُ الخدمات م٣٣. */
export const EXPORT_REASON_CODES: ReadonlySet<string> = new Set(['VATEX-SA-32', 'VATEX-SA-33']);

/**
 * ⑤A3 — **فاتورةُ صادرات** (KSA-2 الموضع 5): مشترٍ خارجَ المملكة **وسطرٌ بسبب صادرات** معاً — لا أحدُهما.
 * تعريفُ الهيئة: «The invoice is issued to a foreign buyer as per KSA VAT regulation» — والتوريدُ الذي يقرّره النظامُ
 * صادراتٍ هو ما حمل سببَ م٣٢/م٣٣؛ فمشترٍ أجنبيّ يشتري خدمةً تُستهلك في المملكة (سائح · مقيمٌ عابر) ليس صادرات.
 */
export function isExportInvoice(buyer: Pick<BuyerForInvoiceType, 'country'>, lines: ReadonlyArray<LineForInvoiceType>): boolean {
  const country = buyer.country?.trim().toUpperCase() || 'SA';
  if (country === 'SA') return false;
  return lines.some((l) => !!l.taxExemptionReasonCode && EXPORT_REASON_CODES.has(l.taxExemptionReasonCode));
}

/**
 * **نوعُ الفاتورة من صفة المشتري لا من رقمه الضريبيّ وحدَه** (ق-١٢٦١ أ — ②A1).
 *
 * كان القرارُ «رقمٌ ضريبيّ ⟵ كاملة، وإلا مبسّطة» — فكلُّ فاتورةٍ لمؤسّسةٍ أو شخصٍ اعتباريٍّ **غيرِ مسجَّل** خُتمت
 * مبسّطةً وأُبلغت في مسار الإبلاغ لا الإجازة، **والمختومُ لا يُعدَّل** (`ق-٩٤٣`). واللائحةُ التنفيذية م٥٣(١)(أ)
 * توجب الكاملةَ للتوريد إلى «خاضعٍ آخر، أو شخصٍ اعتباريٍّ غيرِ خاضع، أو مؤسّسةٍ (فردية)، أو أيِّ كيانٍ مؤسَّس
 * بموجب أنظمة المملكة»، والمبسّطةَ لغيرهم (م٥٣(٧)). فالقرارُ:
 *   · رقمٌ ضريبيّ ⟵ كاملة (خاضعٌ مسجَّل — أيّاً كانت صفتُه)
 *   · مؤسّسةٌ فردية أو شخصٌ اعتباريّ ⟵ كاملة ولو بلا تسجيل
 *   · طبيعيٌّ ⟵ مبسّطة
 * والقديمُ غيرُ المعلَن (`LEGACY_UNDECLARED`) لا يبلغ مستنداً جديداً — يُرفض عند الإصدار حتى يُعلَن؛ ومستندٌ قائمٌ له
 * يُقرأ بالرقم كما كان يُقرأ (لا يُغيَّر نوعُ ما صدر).
 *
 * ⑤A3: **والصادراتُ كاملةٌ دائماً** — م٥٣(١)(أ)(٣) توجب الفاتورةَ الضريبية للتوريدات الخارجية، والهيئةُ لا تقبل علَمَ
 * الصادرات على مبسّطة (BR-KSA-31) — فالسطورُ تدخل الاشتقاقَ مع صفة المشتري، وموضعٌ يعرف المشتري ولا يعرف السطور لا يحكم.
 */
export function invoiceTypeFor(buyer: BuyerForInvoiceType, lines: ReadonlyArray<LineForInvoiceType>): 'standard' | 'simplified' {
  if (isExportInvoice(buyer, lines)) return 'standard';
  if (buyer.vatNumber?.trim()) return 'standard';
  if (buyer.kind === 'ESTABLISHMENT' || buyer.kind === 'LEGAL_PERSON') return 'standard';
  return 'simplified';
}
