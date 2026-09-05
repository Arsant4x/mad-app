import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';

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
 */
export async function nextIcv(tx: Prisma.TransactionClient, egsUnitId: string): Promise<number> {
  const top = await tx.invoice.aggregate({ where: { egsUnitId, zatcaIcv: { not: null } }, _max: { zatcaIcv: true } });
  return (top._max.zatcaIcv ?? 0) + 1;
}

/**
 * The hash the next invoice must chain onto: the most recently *accepted*
 * invoice **of this unit**, or the genesis value if the unit has none.
 *
 * Ordered by `zatcaSubmittedAt` rather than creation time, because the chain
 * follows submission order — an invoice created earlier but submitted later
 * belongs later in the chain.
 *
 * **Only CLEARED documents are eligible.** A document the authority did not
 * accept never entered its records, so it cannot be anyone's predecessor:
 * the authority recomputes the chain from what it holds, and expects the next
 * PIH to be the hash of the last document it actually accepted. Handing out a
 * rejected invoice's hash also made that hash load-bearing while the invoice
 * was still being corrected — fixing it recomputes the hash and orphans
 * whatever chained onto the old one, which is the defect
 * InvoicesService.update's successor check exists to catch. That check stays
 * as a second layer (it still guards data recorded before this rule, and any
 * path that sets a PIH by other means); this is the fix at the source.
 *
 * SUBMITTING is excluded for the same reason — nothing is accepted yet, and a
 * retry in flight still carries the *previous* attempt's stale hash.
 */
export async function latestChainHash(tx: Prisma.TransactionClient, egsUnitId: string): Promise<string> {
  const previous = await tx.invoice.findFirst({
    where: { egsUnitId, zatcaHash: { not: null }, zatcaStatus: 'CLEARED' },
    orderBy: [{ zatcaSubmittedAt: 'desc' }],
    select: { zatcaHash: true },
  });
  return previous?.zatcaHash ?? GENESIS_PREVIOUS_HASH;
}

/**
 * Standard (B2B) vs simplified (B2C) — decided by whether the buyer has a VAT
 * registration number, matching the mockup's `invoiceType` rule. The two are
 * cleared differently by the authority, so this is not cosmetic.
 */
export function invoiceTypeFor(buyerVatNumber: string | null | undefined): 'standard' | 'simplified' {
  return buyerVatNumber?.trim() ? 'standard' : 'simplified';
}
