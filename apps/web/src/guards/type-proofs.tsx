/**
 * إثباتاتٌ على مستوى الأنواع — **يُترجمها `tsc -b` في كل بناء** (محروسٌ في CI على كل دفع).
 *
 * كلُّ سطرٍ تحت `@ts-expect-error` **مخالفةٌ يجب أن يرفضها المترجم**. فإن صار مقبولاً يوماً
 * (حُذف الوسم · أُضيفت `rows: T[]` · صار `onError` اختيارياً) **سقط البناءُ كلُّه** هنا — لا في
 * مراجعة. هذا هو «النمطُ البنيويّ الذي يجعل المخالفة مستحيلة» في التوجيه: الحارسُ الأول
 * هو المترجم، وحارسُ الشجرة يمسك ما يمرّ منه تركيبياً.
 *
 * الملفُّ لا يُستورد من أحد؛ وجودُه في `src/` كافٍ ليُترجَم.
 */
import { createElement } from 'react';
import type { Page } from '../api/page';
import type { Money } from '../api/wire';
import { DataTable } from '../components/DataTable';
import { MoneyCell } from '../components/MoneyCell';
import { ResourceView } from '../components/ResourceView';
import { useMutation, type Resource } from '../hooks/useResource';

declare const money: Money;
declare const pageOfStrings: Resource<Page<string>>;
declare const can: (screen: string, action: string) => boolean;

export const typeProofs = {
  // ① رقمٌ محسوب لا يدخل عمودَ مال
  moneyCellRejectsNumber: () =>
    // @ts-expect-error — `value` يقبل Money | null لا number
    createElement(MoneyCell, { value: 1 }),

  // ① الضربُ على Money خطأ ترجمة
  moneyArithmeticRejected: () =>
    // @ts-expect-error — TS2362: لا حسابَ على نصٍّ موسوم
    money * 2,

  // ④ الجدولُ لا يقبل مصفوفةً كاملة
  dataTableRejectsRows: () =>
    // @ts-expect-error — لا خاصية rows؛ المقبول r: Resource<Page<T>>
    createElement(DataTable<string>, { rows: ['a'], columns: [], rowKey: (s: string) => s, what: 'x', can, onPage: () => {}, empty: { headline: '', hint: '', term: '', clear: () => {} } }),

  // ② كلُّ فروع الحالات إلزامية — حذفُ `error` خطأ
  resourceViewRequiresAllBranches: () =>
    // @ts-expect-error — الفرعُ error مفقود
    createElement(ResourceView<Page<string>>, { r: pageOfStrings, loading: () => null, forbidden: () => null, empty: () => null, partial: () => null, ready: () => null }),

  // ② الحفظُ بلا onError خطأ
  mutationRequiresOnError: () =>
    // @ts-expect-error — onError إلزاميّ
    useMutation(async (x: number) => x, {}),
};
