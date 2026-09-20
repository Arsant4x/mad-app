/**
 * Shared pager for server-paginated lists. Rendered only when there is more
 * than one page — a list that fits on one page shouldn't grow chrome.
 * RTL note: «السابق» points right (→) and «التالي» points left (←), matching
 * the reading direction the rest of the UI already follows.
 *
 * ⚠️ **هذا الملفُّ هو الموضعُ الوحيد المأذونُ له بحساب آليّة العرض على عددٍ من الخادم**
 * (القاعدة ① بتحرير المالك 2026-09-20: يُسمح حسابُ «عددِ الصفحات والفهرسِ والموضع»
 * وحدَه، ويُمنع ما يقرؤه التاجر حقيقةً عن العمل). فـ`Math.ceil(total / pageSize)`
 * يعيش هنا، وحارسُ الشجرة (`guards/rules.guard.test.ts` ①) يستثني هذا المسارَ بالاسم
 * ويُدين النمطَ نفسَه في أيّ صفحة. ولذلك تمرّر الصفحاتُ `pageSize` وتستلم العدَّ جاهزاً
 * بدل أن تحسبه — الأربعُ القائمة (`ContractsPage` · `JournalPage` · …) تحمل الحسابَ
 * عندها وتدخل الحارسَ صفحةً صفحة (قائمة `guards/legacy-allowlist.json`).
 */
export function Pager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  /** يُحسب هنا من `pageSize` حين لا يُمرَّر — والمسارُ القديم يمرّره جاهزاً. */
  pageCount?: number;
  pageSize?: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const count = pageCount ?? (pageSize && pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1);
  if (count <= 1) return null;
  return (
    <div className="toolbar rz-pager" style={{ justifyContent: 'space-between', marginTop: 10 }}>
      <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        → السابق
      </button>
      <span style={{ alignSelf: 'center' }}>
        صفحة <span className="num">{page}</span> من <span className="num">{count}</span> — الإجمالي: <span className="num">{total}</span>
      </span>
      <button type="button" className="btn btn-ghost" disabled={page >= count} onClick={() => onPage(page + 1)}>
        التالي ←
      </button>
    </div>
  );
}
