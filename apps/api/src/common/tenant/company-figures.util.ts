/**
 * ⚖️ **قائمةٌ يحتاجها المقيَّد، ورقمٌ فيها رقمُ المنشأة كلِّها** (توجيه ٢٧٥ · `ق-١٥٨١`).
 *
 * دليلُ الحسابات يحتاجه المقيَّد في منتقيات القيد والمصروف، وقائمةُ العملاء في فواتيره — **ورصيدُ الحساب وذمّةُ العميل فيهما
 * رقمُ المنشأة كلِّها** من كلِّ فروعها. فتبقى القائمةُ ويسقط الرقمُ وحدَه لمن لا يرى الفروعَ كلَّها: يسقط الحقلُ لا يصير صفراً،
 * فلا يُقرأ صفرٌ رقماً. والمسارُ الذي رقمُه هو كلُّ ما فيه يُوسم `@CompanyWideFigures` ويُرفض كلُّه.
 */
export function withoutCompanyFigures<T extends object, K extends keyof T>(allowedBranchIds: string[] | 'all', row: T, keys: readonly K[]): T | Omit<T, K> {
  if (allowedBranchIds === 'all') return row;
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}
