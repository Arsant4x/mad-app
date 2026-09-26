/**
 * ⚖️ **ردودُ التسوية البنكية بأصنافٍ مسمّاة** (`ق-١٤٥٠` · `ق-١٢٦١` ج — `reconciliation.service.ts`).
 *
 * **والحقولُ كما تُرسَل** (نمطُ `pos-responses.dto.ts`): المالُ نصٌّ بخانتين (`money()`)، واليومُ `YYYY-MM-DD` حيث تقصّه الخدمةُ،
 * وعمودُ `Date` كما يُسلسَل نصَّ `ISO`. **والفراغُ من المخطَّط** (`String?` · `DateTime?`) لا ممّا رُئي. والصنفُ حدٌّ أدنى.
 */

// ───────────────────────────── سطرُ الكشف ─────────────────────────────

/**
 * **سطرُ الكشف كما يعيده المطابقةُ وفكُّها والترحيلُ منه** (`tx.bankTransaction.update` — أعمدةُ الصفّ كلُّها).
 * `entryNo` فارغٌ لسطرٍ يدويٍّ لم يُرحَّل، ومكتوبٌ لما رُحِّل منه (`ق-٢٨١`)؛ و`matchedLineId`/`matchedAt` فارغان بعد الفكّ.
 */
export class BankStatementLineResponse {
  id!: string;
  bankId!: string;
  branchId!: string | null;
  /** عمودُ `@db.Date` مسلسَلاً — `YYYY-MM-DDT00:00:00.000Z`. */
  date!: string;
  description!: string;
  amount!: string;
  source!: string | null;
  matched!: boolean;
  entryNo!: string | null;
  matchedLineId!: string | null;
  matchedAt!: string | null;
  currency!: string;
  exchangeRate!: string;
  baseAmount!: string;
  createdAt!: string;
  updatedAt!: string;
}

// ───────────────────────────── النظرةُ الشاملة ─────────────────────────────

/** البنكُ في رأس التسوية — مُسوّى حتى (يومٌ أو فراغ) ورصيدُ المرآة نصّاً. */
export class ReconciliationBankResponse {
  id!: string;
  name!: string;
  accountId!: string;
  reconciledUntil!: string | null;
  mirrorBalance!: string;
}

/** سطرُ كشفٍ في جانب الكشف — يومُه مقصوصٌ، ومطابقتُه إن كانت. */
export class ReconciliationStatementRowResponse {
  id!: string;
  /** يومُ السطر `YYYY-MM-DD`. */
  date!: string;
  description!: string;
  amount!: string;
  matchedLineId!: string | null;
  matchedAt!: string | null;
  source!: string | null;
}

/** مصدرُ القيد (`resolveSource` — `reports/ledger.util.ts`): نوعُ المستند ومعرّفُه ورقمُه (أو معرّفُه حين لا رقم). */
export class LedgerSourceResponse {
  type!: string;
  id!: string;
  no!: string;
}

/** سطرُ الدفتر على حساب البنك — بمحرّك الأستاذ نفسِه (`LedgerRow`)، وبحال مطابقته. */
export class ReconciliationLedgerRowResponse {
  lineId!: string;
  entryId!: string;
  entryNo!: string;
  /** يومُ القيد `YYYY-MM-DD`. */
  date!: string;
  memo!: string;
  accountId!: string;
  accountCode!: string;
  accountName!: string;
  debit!: string;
  credit!: string;
  /** الرصيدُ الجاري بعد هذا السطر نصّاً بخانتين. */
  balance!: string;
  source!: LedgerSourceResponse;
  branchId!: string | null;
  customerId!: string | null;
  supplierId!: string | null;
  propertyId!: string | null;
  unitId!: string | null;
  matched!: boolean;
}

/** جانبُ الدفتر — الافتتاحيُّ والختاميُّ نصّاً، وما فوق سقف القراءة يُعلَن `truncated`. */
export class ReconciliationLedgerResponse {
  opening!: string;
  closing!: string;
  rows!: ReconciliationLedgerRowResponse[];
  truncated!: boolean;
}

/** المقترَحاتُ لسطر كشفٍ معلَّق — سطورُ دفترٍ بالمبلغ نفسِه وتاريخٍ قريب (قد تكون فارغة). */
export class ReconciliationSuggestionResponse {
  transactionId!: string;
  lineIds!: string[];
}

export class ReconciliationTotalsResponse {
  unmatchedStatement!: string;
  unmatchedStatementCount!: number;
  unmatchedLedger!: string;
  unmatchedLedgerCount!: number;
}

/** `GET /banks/:id/reconciliation` — الجانبان والمقترَحاتُ والمجاميع، ومدى الطلب كما أُرسل (أو فراغ). */
export class ReconciliationOverviewResponse {
  bank!: ReconciliationBankResponse;
  from!: string | null;
  to!: string | null;
  statement!: ReconciliationStatementRowResponse[];
  ledger!: ReconciliationLedgerResponse;
  suggestions!: ReconciliationSuggestionResponse[];
  totals!: ReconciliationTotalsResponse;
}

/** الإقفالُ وإعادةُ الفتح — البنكُ وتاريخُ الإقفال يوماً، **وفراغٌ بعد إعادة الفتح**. */
export class ReconciliationStateResponse {
  bankId!: string;
  reconciledUntil!: string | null;
}
