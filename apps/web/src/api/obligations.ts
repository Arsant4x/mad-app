import type { MoneyText } from '../lib/money';
import { apiClient } from './client';

export interface GovernmentObligation {
  id: string;
  body: string;
  title: string;
  done: boolean;
}

/** قسمُ الإيجار في الإقرار — من صفوف الاستحقاق، وما سبق البناء يُحسب ويُعدّ (ق-٩١٨ · ق-٩٢٦). */
export interface RentDeclarationSection {
  /** ② مالٌ نصّاً بخانتين (`ق-١٢٣٥`) — يُقرأ بـ`num()` قبل أي حساب. */
  standard: MoneyText;
  standardVat: MoneyText;
  exempt: MoneyText;
  managedExcluded: MoneyText;
  managedCount: number;
  legacyStandard: MoneyText;
  legacyStandardVat: MoneyText;
  legacyExempt: MoneyText;
  legacyCount: number;
  legacyNote: string;
  unclassifiedCount: number;
  unclassifiedNote: string;
  unpostedCount: number;
  pendingCount: number;
  pendingNote: string;
  accrualCount: number;
}

/** ⑧ خاناتُ المبيعات 1–6 من فئات السطور (`ق-١٢١١`/⑤) — والخانةُ 2 تابعةٌ للمشتري: صفرٌ معلَن وغيرُ مدعومة. */
export interface SalesBoxes {
  1: { net: MoneyText; vat: MoneyText };
  2: { net: MoneyText; vat: MoneyText; supported: false };
  3: { net: MoneyText };
  4: { net: MoneyText };
  5: { net: MoneyText };
  6: { net: MoneyText };
}

/**
 * ② **المالُ نصّاً بخانتين** (`ق-١٢٣٥` — أوّلُ نطاق): كلُّ مبلغٍ هنا `MoneyText` (`"1500.00"`) والعدّاتُ أرقام.
 * فالحقلُ يُعرض بـ`fmt()` كما هو، **ويُقرأ بـ`num()` قبل أي جمعٍ أو مقارنة** — والحارسُ الشجريّ يُسقط ما سواه.
 */
/** ⑥A2 (`ق-١٣٢٥`) — فترةُ التاجر الضريبية: ربعيةٌ هي الأصل، وشهريةٌ فوق أربعين مليوناً. */
export type VatPeriodType = 'QUARTERLY' | 'MONTHLY';

/** الفترةُ المطلوبة — **أحدُهما لا كلاهما**، والخادمُ يردّ برسالةٍ مسمّاة على المخالفة. */
export type VatPeriodQuery = { year: number; quarter: number; month?: undefined } | { year: number; month: number; quarter?: undefined };

export interface VatDeclaration {
  year: number;
  /** ⑥A2 — الفترةُ كما حلّها الخادم، **ومطابقتُها لإعداد التاجر**. */
  periodType: VatPeriodType;
  periodNo: number;
  periodLabel: string;
  companyVatPeriod: VatPeriodType;
  periodMatchesCompany: boolean;
  from: string;
  to: string;
  salesStandard: MoneyText;
  salesStandardVat: MoneyText;
  salesExempt: MoneyText;
  /** الخانةُ 3 — الخاضعُ للصفر داخلياً (`Z` بغير رمز التصدير). */
  salesZeroRatedDomestic: MoneyText;
  /** الخانةُ 4 — الصادرات (`VATEX-SA-32` · `33`). */
  salesExports: MoneyText;
  /** الخانةُ 2 — صفرٌ معلَن (تابعةٌ للمشتري). */
  salesCitizens: MoneyText;
  salesCitizensNote: string;
  /** الخانةُ 6 — مجموعُ المبيعات. */
  totalSales: MoneyText;
  /** خارجَ النطاق (`O`) — يُعدّ ولا يدخل الخانات. */
  salesOutOfScope: { lineCount: number; net: MoneyText };
  /** سطورٌ سبقت البناء بنسبة صفر بلا فئة — تُعدّ ولا تدخل الخانات (`LEGACY_ZERO`). */
  legacyZeroLines: { lineCount: number; net: MoneyText };
  /** سطورٌ على صنفٍ لم تُعلَن فئتُه — داخلةٌ في الخانة 1 وتُعدّ بنصّها (`LEGACY_STANDARD`). */
  legacyStandardLines: { lineCount: number; net: MoneyText };
  boxes: SalesBoxes;
  rent: RentDeclarationSection;
  purchasesStandard: MoneyText;
  purchasesStandardVat: MoneyText;
  purchasesExempt: MoneyText;
  purchasesExcluded: MoneyText;
  excludedCount: number;
  totalPurchases: MoneyText;
  netVat: MoneyText;
  invoiceCount: number;
  purchaseCount: number;
  /** علَمُ «قُدِّم» (ق-٩١٩) — يضعه التاجر بيده. */
  filed: { filedAt: string; netVat: MoneyText } | null;
  changedSinceFiled: boolean;
  filedNote: string | null;
  /** حدودٌ معلَنة على هذا الإقرار من الخادم (ق-١٢٦٠) — تُعرض كما جاءت ولا تُشتقّ في الشاشة. */
  limits: { code: string; severity: 'blocking' | 'warning'; message: string }[];
}

export const listObligations = () => apiClient.get<GovernmentObligation[]>('/obligations').then((r) => r.data);
export const toggleObligation = (id: string) => apiClient.patch<GovernmentObligation>(`/obligations/${id}/toggle`).then((r) => r.data);
export const getVatDeclaration = (period: VatPeriodQuery) =>
  apiClient.get<VatDeclaration>('/obligations/vat-declaration', { params: period }).then((r) => r.data);
export const markVatFiled = (period: VatPeriodQuery) =>
  apiClient.post<{ filedAt: string; netVat: MoneyText }>('/obligations/vat-declaration/filed', period).then((r) => r.data);
export const unmarkVatFiled = (period: VatPeriodQuery) => apiClient.delete('/obligations/vat-declaration/filed', { params: period }).then((r) => r.data);
