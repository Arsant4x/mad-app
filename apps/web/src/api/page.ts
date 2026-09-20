import type { Count } from './wire';

/**
 * صفحةٌ من الخادم — القاعدة ④: **الصفحاتُ من الخادم، لا قائمةٌ كاملة تُقسَّم في الشاشة**.
 *
 * هذا هو عقدُ الخادم القائم في أربع نقاط (`contracts` · `inventory/movements` ·
 * `journal` · `transactions`) — `{ items, total, page, pageSize }` — ولا يُخترع بديلٌ له.
 * والجدولُ (`components/DataTable.tsx`) **لا يقبل إلا `Page<T>`**: لا خاصيةَ `rows: T[]`،
 * فمصفوفةٌ كاملةٌ لا تدخل جدولاً بخطأ نوع.
 *
 * `total` عددُ ما في القاعدة كلّها لا ما في الصفحة — وهو ما يُكتب في رأس الصفحة
 * «N من M»، ولا يُشتقّ من `items.length` أبداً.
 */
export interface Page<T> {
  items: T[];
  total: Count;
  page: Count;
  pageSize: Count;
}

/** معاملاتُ طلب صفحة — تُمرَّر كما هي إلى الخادم؛ الترشيحُ فيه لا في الشاشة. */
export interface PageQuery {
  page?: Count;
  pageSize?: Count;
  search?: string;
}

/** حجمُ الصفحة الافتراضي — القيمةُ التي يعتمدها الخادم حين لا تُرسَل (`contracts.service.ts` `pageSize ?? 25`). */
export const DEFAULT_PAGE_SIZE: Count = 25;
