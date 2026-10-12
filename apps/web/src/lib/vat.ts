/**
 * VAT in the web app: the web copy of two server sources.
 *
 * The governing sources on the server are `common/vat/standard-rate.ts` (the standard rate) and
 * `common/vat/exemption-reasons.ts` (the authority's closed list from the XML standard 1.2 §11.2.4).
 * This copy is checked against them automatically: the rate in `vat-rate-single-source.spec.ts` and
 * the list in `exemption-reasons.spec.ts`, so no number or code here is written from memory.
 *
 * The rate is for display and preview only; the server derives it from each line's category and
 * returns the totals.
 */
import type { DeclarableTaxCategory } from '@mad-app/shared/api/enums';
import i18n from '../i18n';
import { translateField } from './labelTable';

export const STANDARD_VAT_RATE = 15;

/** Gross factor from net (`1.15`), for previews before the server returns the approved figure. */
export const STANDARD_VAT_GROSS_FACTOR = 1 + STANDARD_VAT_RATE / 100;

/** VAT included in a gross amount: `gross × 15 / 115`, unrounded (rounding comes from `lib/money`). */
export function standardVatIncludedIn(gross: number): number {
  return (gross * STANDARD_VAT_RATE) / (100 + STANDARD_VAT_RATE);
}

/**
 * VAT on the taxable part of an amount (a mixed contract): `share` is the taxable share between 0 and 1
 * (1 when all of it is taxable). Exclusive: the rate on the taxable part. Inclusive:
 * `gross × s × 15 ÷ (100 + s × 15)`. Unrounded (rounding comes from `lib/money`); both match
 * `rentAmountsOf` on the server, and the approved figure comes from there.
 */
export function standardVatOnShare(taxedPart: number): number {
  return (taxedPart * STANDARD_VAT_RATE) / 100;
}
export function standardVatIncludedInShare(gross: number, share: number): number {
  return (gross * share * STANDARD_VAT_RATE) / (100 + share * STANDARD_VAT_RATE);
}

/** Categories the merchant declares; the two legacy values are read, never chosen. */
export type { DeclarableTaxCategory };
export type TaxCategory = DeclarableTaxCategory | 'LEGACY_STANDARD' | 'LEGACY_ZERO';

/** A category option whose `label` and `short` follow the interface language when read. */
function categoryOption(value: DeclarableTaxCategory): { value: DeclarableTaxCategory; label: string; short: string } {
  const key = `common.vat.categories.${value.toLowerCase()}`;
  return {
    value,
    get label() {
      return i18n.t(key, { rate: STANDARD_VAT_RATE });
    },
    get short() {
      return i18n.t(`${key}_short`);
    },
  };
}

/** Category names as in the approved visual model. */
export const TAX_CATEGORY_OPTIONS: readonly { value: DeclarableTaxCategory; label: string; short: string }[] = [
  categoryOption('S'),
  categoryOption('Z'),
  categoryOption('E'),
  categoryOption('O'),
];

export interface ExemptionReasonOption {
  code: string;
  category: 'Z' | 'E' | 'O';
  /** The reason text in the current interface language. */
  ar: string;
  /** `false` for the buyer dependent codes (`HEA`, `EDU`): known, but not shown and not accepted. */
  selectable: boolean;
}

/** The only code of the "out of scope" category; its text is written by the merchant for each case. */
export const OUT_OF_SCOPE_REASON_CODE = 'VATEX-SA-OOS';

/** Length limits of the "out of scope" text after trimming, as on the server. */
export const OUT_OF_SCOPE_REASON_MIN = 3;
export const OUT_OF_SCOPE_REASON_MAX = 250;

/**
 * The authority's list: codes and their Arabic text from the standard's table, a mirror of the server
 * list. The Arabic stays here for that comparison; the text shown comes from `common.vat.reasons`.
 */
export const EXEMPTION_REASONS: readonly ExemptionReasonOption[] = [
  { code: 'VATEX-SA-29', category: 'E', ar: 'الخدمات المالية', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-29-7', category: 'E', ar: 'عقد تأمين على الحياة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-30', category: 'E', ar: 'التوريدات العقارية المعفاة من الضريبة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-32', category: 'Z', ar: 'صادرات السلع من المملكة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-33', category: 'Z', ar: 'صادرات الخدمات من المملكة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-34-1', category: 'Z', ar: 'النقل الدولي للسلع', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-34-2', category: 'Z', ar: 'النقل الدولي للركاب', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-34-3', category: 'Z', ar: 'الخدمات المرتبطة مباشرة أو عرضياً بتوريد النقل الدولي للركاب', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-34-4', category: 'Z', ar: 'توريد وسائل النقل المؤهلة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-34-5', category: 'Z', ar: 'الخدمات ذات الصلة بنقل السلع أو الركاب (م٢٥ من اللائحة)', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-35', category: 'Z', ar: 'الأدوية والمعدات الطبية', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-36', category: 'Z', ar: 'المعادن المؤهلة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-EDU', category: 'Z', ar: 'الخدمات التعليمية الخاصة للمواطنين', selectable: false }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-HEA', category: 'Z', ar: 'الخدمات الصحية الخاصة للمواطنين', selectable: false }, // i18n-exempt: Arabic mirror compared with the server list
  { code: 'VATEX-SA-MLTRY', category: 'Z', ar: 'توريد السلع العسكرية المؤهلة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
  { code: OUT_OF_SCOPE_REASON_CODE, category: 'O', ar: 'خارج نطاق الضريبة — بسببٍ يكتبه المكلَّف لكل حالة', selectable: true }, // i18n-exempt: Arabic mirror compared with the server list
];
for (const r of EXEMPTION_REASONS) translateField(r, 'ar', `common.vat.reasons.${r.code.toLowerCase().replace(/-/g, '_')}`);

/** The declared limit, shown on the screen rather than in a document. */
export function buyerDependentLimit(): string {
  return i18n.t('common.vat.buyer_dependent_limit');
}

/**
 * The same text read once when the module loads. Kept for callers that render it directly; it does not
 * follow a language switch until the page reloads, so new code calls `buyerDependentLimit()`.
 */
export const BUYER_DEPENDENT_LIMIT = buyerDependentLimit();

/** Reasons offered for a category: the selectable ones only. */
export function selectableReasonsFor(category: 'Z' | 'E'): ExemptionReasonOption[] {
  return EXEMPTION_REASONS.filter((r) => r.category === category && r.selectable);
}

export function exemptionReasonLabel(code: string | null | undefined): string | null {
  const r = code ? EXEMPTION_REASONS.find((x) => x.code === code) : undefined;
  return r ? `${r.code} · ${r.ar}` : null;
}

/** The rate is derived from the category, never typed in. */
export function rateForCategory(category: TaxCategory | null | undefined): number {
  return category === 'S' || category === 'LEGACY_STANDARD' ? STANDARD_VAT_RATE : 0;
}

/** What a line without an item carries before sending: the category and reason; the rate follows from them. */
export interface LineTaxDraft {
  taxCategory: DeclarableTaxCategory;
  taxExemptionReasonCode?: string;
  taxExemptionReason?: string;
}

export const STANDARD_LINE_TAX: LineTaxDraft = { taxCategory: 'S' };

/**
 * A stored line category back to a draft to declare again: `LEGACY_STANDARD` reads as `S` (continuity,
 * not correction), and `LEGACY_ZERO` has no category, so it shows as exempt without a reason until the
 * merchant chooses; the server rejects it undeclared.
 */
export function draftTaxOf(l: { taxCategory: TaxCategory | null | undefined; taxExemptionReasonCode?: string | null; taxExemptionReason?: string | null }): LineTaxDraft {
  switch (l.taxCategory) {
    case 'S':
    case 'LEGACY_STANDARD':
      return { taxCategory: 'S' };
    case 'Z':
    case 'E':
      return { taxCategory: l.taxCategory, taxExemptionReasonCode: l.taxExemptionReasonCode ?? undefined };
    case 'O':
      return { taxCategory: 'O', taxExemptionReason: l.taxExemptionReason ?? undefined };
    default:
      return { taxCategory: 'E' };
  }
}

/** The category as shown in lists and badges: the rate for `S`, the reason code for `Z`/`E`, or "not declared". */
export function taxBadgeOf(p: { taxCategory: TaxCategory | null | undefined; taxExemptionReasonCode?: string | null }): { text: string; undeclared: boolean } {
  switch (p.taxCategory) {
    case 'S':
      return { text: i18n.t('common.vat.badge_standard', { rate: STANDARD_VAT_RATE }), undeclared: false };
    case 'Z':
    case 'E':
      return { text: `${p.taxCategory} · ${p.taxExemptionReasonCode ?? '—'}`, undeclared: false };
    case 'O':
      return { text: i18n.t('common.vat.badge_out_of_scope'), undeclared: false };
    default:
      return { text: i18n.t('common.vat.badge_undeclared'), undeclared: true };
  }
}

/**
 * What is missing in a draft before sending: the server's rules, so the merchant is not surprised by a
 * `400`; the server decides. `null` means the draft is complete.
 */
export function lineTaxDraftError(d: LineTaxDraft): string | null {
  if (d.taxCategory === 'S') return null;
  if (d.taxCategory === 'O') {
    const text = (d.taxExemptionReason ?? '').trim();
    if (!text) return i18n.t('common.vat.error_out_of_scope_required');
    if (text.length < OUT_OF_SCOPE_REASON_MIN || text.length > OUT_OF_SCOPE_REASON_MAX) return i18n.t('common.vat.error_out_of_scope_length', { min: OUT_OF_SCOPE_REASON_MIN, max: OUT_OF_SCOPE_REASON_MAX });
    return null;
  }
  const reason = EXEMPTION_REASONS.find((r) => r.code === d.taxExemptionReasonCode);
  if (!reason || reason.category !== d.taxCategory) return i18n.t('common.vat.error_reason_required');
  if (!reason.selectable) return buyerDependentLimit();
  return null;
}

/** What is sent to the server from a draft: the three fields without a rate (the server derives it). */
export function lineTaxPayload(d: LineTaxDraft): { taxCategory: DeclarableTaxCategory; taxExemptionReasonCode?: string; taxExemptionReason?: string } {
  if (d.taxCategory === 'S') return { taxCategory: 'S' };
  if (d.taxCategory === 'O') return { taxCategory: 'O', taxExemptionReasonCode: OUT_OF_SCOPE_REASON_CODE, taxExemptionReason: (d.taxExemptionReason ?? '').trim() };
  return { taxCategory: d.taxCategory, taxExemptionReasonCode: d.taxExemptionReasonCode };
}

/**
 * An item declaration: always the three fields, with `null` for what does not apply. The server merges
 * what is not sent with what is stored, so changing `Z` to `S` without an explicit `null` code would keep
 * the old exemption code and be rejected as "a reason on the standard rate".
 */
export function productTaxPayload(d: LineTaxDraft): { taxCategory: DeclarableTaxCategory; taxExemptionReasonCode: string | null; taxExemptionReason: string | null } {
  const p = lineTaxPayload(d);
  return { taxCategory: p.taxCategory, taxExemptionReasonCode: p.taxExemptionReasonCode ?? null, taxExemptionReason: p.taxExemptionReason ?? null };
}
