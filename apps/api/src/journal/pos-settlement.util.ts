import { Prisma } from '@mad-app/db';
import { round2 } from '../common/money/rounding';
import { createJournalEntry, PostingLine } from './journal-posting.util';

/**
 * **تسويةُ بيع الكاشير: النقدُ يدخل درجَه والبطاقةُ تصير ذمّةً** (`ق-٣٠٩`).
 *
 * ── العطل الذي يُغلقه ────────────────────────────────────────────────────
 *
 * كان بيعُ الكاشير يُرحَّل كأيّ فاتورة — `مدين 1200 / دائن 4100 + 2200` —
 * **ثم لا شيء**. فصفوفُ `pos_payments` تُكتب ولا تُرحَّل، **والنقدُ الذي قبضه
 * الكاشير لا يدخل الأستاذ إطلاقاً**.
 *
 * **والمقيس على قاعدة التطوير**: ٧٢ فاتورةَ كاشير · `1200` مدين **٢٢٬٧٧٠** ·
 * **وصفرُ سطرِ نقد**. ⟵ **فالتاجر يقرأ ذمماً على عملاءَ دفعوا نقداً، ونقداً
 * لا وجودَ له في دفتره**. وحساباتُ الأدراج الخمسةُ والثلاثون **بصفر سطرٍ غير
 * افتتاحيّ** — لا لأن النقد يذهب إلى `1000`، **بل لأنه لا يذهب إلى مكان**.
 *
 * ── الحلّ ────────────────────────────────────────────────────────────────
 *
 * قيدٌ **ثلاثيُّ الأطراف** يُسدّد ذمّةَ البيع لحظةَ وقوعه (`ق-٣١٣`):
 *
 *   `مدين درجُ المناوبة` (النقد) · `مدين 1251` (الشبكة) · **`دائن 1200`**
 *
 * ⚠️ **والدرجُ لا `1000`**: «المفصَّل يُجمَّع دائماً والمجمَّع لا يُفصَّل
 * أبداً» (`ق-٢١٨`) — ومنه يُعرف عجزُ كل درجٍ على حدة، وهو ما أُنشئت الأدراج
 * لأجله. **ومناوبةٌ بلا درج** (مناوباتٌ سبقت موجةَ الأدراج) **تسقط إلى `1000`
 * بإعلان** — لا تُترك بلا ترحيل.
 *
 * ⚠️ **ولا تخطٍّ صامت**: الحساباتُ اللازمة **تُنشأ إن غابت** (`1251` و`1200`)
 * بدل «إن لم توجد فلا ترحيل» — فالتخطّي الصامت هو ما ترك العطلَ سنةً.
 */
export const NETWORK_RECEIVABLE_CODE = '1251';
export const NETWORK_RECEIVABLE_NAME = 'مدينو شبكة المدفوعات';
export const CUSTOMER_RECEIVABLE_CODE = '1200';
export const CASH_ACCOUNT_CODE = '1000';

/** يقرأ الحسابَ برمزه، ويُنشئه بنوعه إن غاب — فلا ترحيلَ يُتخطّى لغياب حساب. */
export async function getOrCreateAccountByCode(
  tx: Prisma.TransactionClient,
  companyId: string,
  code: string,
  name: string,
  type: string,
): Promise<{ id: string; code: string }> {
  const existing = await tx.account.findFirst({ where: { companyId, code }, select: { id: true, code: true } });
  if (existing) return existing;
  return tx.account.create({
    // companyId صريحٌ لأن البذرةَ والسكربتات تستدعي هذا بعميلٍ بلا امتداد
    // المستأجر — كنمط `getOrCreateOpeningEquityAccount`.
    data: { companyId, code, name, type } as unknown as Prisma.AccountCreateInput,
    select: { id: true, code: true },
  });
}

/** «نقدٌ في الطريق» (ق-١٢٦١ ج — ⑦A3): بين الأدراج (1010–1099) والذمم (1200) — رمزٌ مشتقٌّ من موضعه، «أو ما يُقرَّر». */
export const CASH_IN_TRANSIT_CODE = '1190';
export const CASH_IN_TRANSIT_NAME = 'نقد في الطريق';
/**
 * عمولاتُ شبكة المدفوعات (ق-١٢٦١ ج — ⑦A2): حسابٌ مستقلّ لا `5300` — كتلف `5800` وعجز `5900`: «كم تأخذ الشبكةُ من
 * مبيعاتي؟» رقمٌ يجب أن يُرى لا أن يذوب في الإداريّة. رمزٌ بعد `5900` «أو ما يُقرَّر»؛ يُنشأ عند أوّل تسوية.
 */
export const NETWORK_FEE_EXPENSE_CODE = '5910';
export const NETWORK_FEE_EXPENSE_NAME = 'عمولات شبكة المدفوعات';
export const CASH_VARIANCE_CODE = '5900';
export const CASH_VARIANCE_NAME = 'عجز وزيادة الصندوق';

/**
 * **فرقُ جرد المناوبة يُرحَّل عند الإقفال** (`ق-٣٠٨`).
 *
 * **حسابٌ واحد ينقلب جانبُه** — لا حسابان: الاسمُ في `ق-٢٥٣` «عجز **وزيادة**
 * الصندوق»، **وحسابان يُسقطان المؤشرَ نفسَه** الذي أُنشئت الأدراج لأجله.
 *
 *   عجزٌ (سالب) ⟵ `مدين 5900 / دائن الدرج`  · زيادةٌ (موجب) ⟵ `مدين الدرج / دائن 5900`
 *
 * ⚠️ **ويُرحَّل عند الإقفال حتماً** لا بعد مراجعة: **حسابُ الدرج يجب أن يساوي
 * المعدود لحظةَ الإقفال**، وإلا حمل الأستاذُ رقماً أثبت التاجرُ خطأه. **والفرقُ
 * عن التلف**: التلفُ **فعلٌ يُتلف قيمة** فاشتُرط له إذنٌ ثانٍ، **والعدُّ
 * ملاحظة** — ورفضُ تسجيلها لا يجعلها غير واقعة. **والمراجعةُ على التقرير**
 * (من · وأيُّ درج · وكم مرة) **لا على الترحيل**.
 *
 * ⚠️ **وصفرُ الفرق لا يُرحَّل**: قيدٌ بصفر ضجيجٌ في الأستاذ.
 */
export async function postShiftVarianceEntry(
  tx: Prisma.TransactionClient,
  companyId: string,
  // `memo` لعدٍّ ليس جردَ مناوبة — عدُّ الدرج عند نقله بين الفروع (`ق-١٤١٣`): الحسابُ والجانبُ واحد، والبيانُ يسمّي الواقعة.
  input: { shiftNo?: string; memo?: string; date: Date; branchId?: string | null; drawerAccountId: string | null; variance: number },
) {
  const variance = round2(input.variance);
  if (variance === 0) return null;

  const cashAccountId =
    input.drawerAccountId ?? (await getOrCreateAccountByCode(tx, companyId, CASH_ACCOUNT_CODE, 'النقدية', 'asset')).id;
  const varianceAccount = await getOrCreateAccountByCode(tx, companyId, CASH_VARIANCE_CODE, CASH_VARIANCE_NAME, 'expense');

  const amount = Math.abs(variance);
  const lines: PostingLine[] =
    variance > 0
      ? [
          { accountId: cashAccountId, debit: amount, credit: 0 },
          { accountId: varianceAccount.id, debit: 0, credit: amount },
        ]
      : [
          { accountId: varianceAccount.id, debit: amount, credit: 0 },
          { accountId: cashAccountId, debit: 0, credit: amount },
        ];

  return createJournalEntry(tx, {
    companyId,
    date: input.date,
    memo: input.memo ?? `${variance > 0 ? 'زيادة' : 'عجز'} جرد مناوبة — ${input.shiftNo ?? ''}`,
    auto: true,
    branchId: input.branchId ?? null,
    lines,
  });
}
