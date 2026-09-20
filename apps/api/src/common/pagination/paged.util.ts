import { BadRequestException } from '@nestjs/common';
import { MSG } from '../i18n/messages';
import { DEFAULT_PAGE_SIZE, PagedQueryDto } from '../dto/paged-query.dto';

/** المغلَّفُ حين يُطلب الترقيم — الشكلُ نفسُه الذي يعيده `contracts` (`ق-١٢٣٦`). */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** ما تعيده نقطةُ قائمة: مصفوفةٌ بلا `page`، ومغلَّفٌ به. */
export type ListResult<T> = T[] | Paged<T>;

/**
 * نافذةُ الصفحة: `offset` ما يُتخطّى و`limit` ما يُقرأ — وهما `skip`/`take` عند Prisma.
 * (الاسمان هنا غيرُ اسمَي Prisma عمداً: حارسُ الترتيب التامّ `stable-page-order.spec.ts` يقرأ `skip:` نصّاً
 * ويطلب ترتيباً ينتهي بـ`id` في جواره — والحقلُ في هذا النوع ليس استعلاماً.)
 */
export interface PageWindow {
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
}

/**
 * نافذةُ الصفحة من الاستعلام — أو `null` حين لم يُطلب ترقيم.
 * `pageSize` بلا `page` يُردّ `400` مسمّىً لا يُتجاهَل: لو أُهمل صامتاً لظنّ المستهلكُ أن السقفَ سرى وهو لم يسرِ.
 */
export function pageWindow(query: Pick<PagedQueryDto, 'page' | 'pageSize'> | undefined): PageWindow | null {
  if (!query?.page) {
    if (query?.pageSize !== undefined) throw new BadRequestException(MSG.page_size_without_page);
    return null;
  }
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page: query.page, pageSize, offset: (query.page - 1) * pageSize, limit: pageSize };
}

/** ترتيبُ Prisma كما يُكتب: كائنٌ واحد أو قائمةُ كائنات. */
type OrderBy = Record<string, unknown> | Record<string, unknown>[] | undefined;

/**
 * **الصفحةُ بترتيبٍ تامّ** (`ق-٣٥٦`): ترتيبُ الاستعلام المصفَّح يُختم بـ`id` — الفريدُ المضمون على كل نموذج —
 * فلا يتعادل صفّان **فيتبدّلان بين صفحتين** (صفٌّ يتكرّر وآخرُ يسقط على البيانات نفسها بلا سببٍ ظاهر).
 * الترتيبُ على الاسم أو التاريخ وحدَه لا يمنع التعادل، و`createdAt` كذلك (كتابتان في المللي‑ثانية نفسها).
 *
 * هذه تعيد ترتيبَ المستدعي قائمةً **بلا ختمِ `id`** (إن كان قد ختم به) — والختمُ يُكتب حرفاً عند
 * الاستعلام المصفَّح (`orderBy: [...orderList(orderBy), { id: idDirection(orderBy) }]`) حيث يقرؤه حارسُ
 * `stable-page-order`، وباتجاه المستدعي إن كان قد اختاره.
 */
export function orderList(orderBy: OrderBy): Record<string, unknown>[] {
  const list = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return trailingId(list) ? list.slice(0, -1) : list;
}

/** اتجاهُ ختم `id`: ما اختاره المستدعي إن ختم به، وإلا تصاعديّ. */
export function idDirection(orderBy: OrderBy): 'asc' | 'desc' {
  const list = orderBy === undefined ? [] : Array.isArray(orderBy) ? orderBy : [orderBy];
  return trailingId(list) === 'desc' ? 'desc' : 'asc';
}

function trailingId(list: Record<string, unknown>[]): 'asc' | 'desc' | null {
  const last = list[list.length - 1];
  if (!last || Object.keys(last).length !== 1 || !('id' in last)) return null;
  return last.id === 'desc' ? 'desc' : 'asc';
}

/** النصُّ المبحوثُ عنه مقصوصاً — أو `undefined` حين لا بحث. */
export function searchTerm(query: Pick<PagedQueryDto, 'search'> | undefined): string | undefined {
  const term = query?.search?.trim();
  return term ? term : undefined;
}

/**
 * قائمةٌ من القاعدة: بلا ترقيمٍ تُقرأ كلُّها كما كانت؛ وبه يُعدّ الكلُّ وتُقرأ النافذةُ — **قراءتان في
 * معاملةٍ واحدة** يمرّرهما المستدعي فتريان الصفوفَ نفسَها.
 */
export async function listOrPage<T>(
  query: PagedQueryDto | undefined,
  source: { all: () => Promise<T[]>; count: () => Promise<number>; window: (offset: number, limit: number) => Promise<T[]> },
): Promise<ListResult<T>> {
  const win = pageWindow(query);
  if (!win) return source.all();
  // ⚠️ على المستدعي أن يختم ترتيبَ `window` بـ`id` (`ق-٣٥٦`) — و`pagedFindMany` تفعله عنه.
  const [total, items] = await Promise.all([source.count(), source.window(win.offset, win.limit)]);
  return { items, total, page: win.page, pageSize: win.pageSize };
}

/**
 * قائمةٌ محسوبةٌ في الذاكرة (أرصدةٌ · مناوباتٌ بمجاميع · أنشطةٌ بعدّ فروع): تُرشَّح بالبحث على حقولٍ
 * مُعلَنة ثم تُقطَع — والمجموعُ بعد الترشيح.
 *
 * ⚠️ **الصفوفُ تصل بترتيبٍ تامّ** (`ق-٣٥٦`): كلُّ صفحةٍ طلبٌ مستقلّ يعيد بناءَ القائمة كلِّها ثم يقصّ، فإن
 * تعادل صفّان في ترتيب مصدرها تبدّلا بين طلبين. فمصدرُ القائمة يختم ترتيبَه بـ`id` (`withTotalOrder` في
 * الاستعلام، أو `id` آخرَ مفاتيح المقارنة حين تُرتَّب في الذاكرة).
 */
export function pageArray<T>(query: PagedQueryDto | undefined, rows: T[], searchFields: readonly (keyof T)[] = []): ListResult<T> {
  const term = searchTerm(query);
  const filtered = term && searchFields.length ? rows.filter((row) => matchesSearch(row, searchFields, term)) : rows;
  const win = pageWindow(query);
  if (!win) return filtered;
  return { items: filtered.slice(win.offset, win.offset + win.limit), total: filtered.length, page: win.page, pageSize: win.pageSize };
}

/** تحويلُ عناصر النتيجة بشكلها — مصفوفةً كانت أو مغلَّفاً — لإثراء الصفوف بعد القراءة (حالةٌ مشتقّة · مجاميع). */
export function mapList<T, U>(result: ListResult<T>, fn: (row: T) => U): ListResult<U> {
  return Array.isArray(result) ? result.map(fn) : { ...result, items: result.items.map(fn) };
}

/** عناصرُ النتيجة بشكلها — للحسابات التي تحتاج الصفوفَ نفسَها (مجاميعُ الوردية). */
export function listItems<T>(result: ListResult<T>): T[] {
  return Array.isArray(result) ? result : result.items;
}

/** مطابقةٌ نصّية غيرُ حسّاسةٍ للحالة على حقولٍ مُعلَنة — الأرقامُ تُقرأ نصّاً، و`null` لا يُطابَق. */
export function matchesSearch<T>(row: T, fields: readonly (keyof T)[], term: string): boolean {
  const needle = term.toLowerCase();
  return fields.some((f) => {
    const v = row[f];
    if (v === null || v === undefined) return false;
    return String(v).toLowerCase().includes(needle);
  });
}

/**
 * شرطُ Prisma للبحث في حقولٍ نصّية مُعلَنة (`contains` غيرُ حسّاسٍ للحالة) — يُدمَج في `where` بـ`AND`
 * كي لا يُسقط شروطَ العزل والفرع التي قبله.
 */
export function searchWhere(term: string | undefined, fields: readonly string[]): { OR: Record<string, { contains: string; mode: 'insensitive' }>[] } | undefined {
  if (!term || fields.length === 0) return undefined;
  return { OR: fields.map((f) => ({ [f]: { contains: term, mode: 'insensitive' as const } })) };
}

/**
 * مندوبُ Prisma بلا نوعٍ من `@prisma/client` (فالدالّةُ في `common` والنواةُ لا تستورد نموذجاً بعينه):
 * ما يلزم منه `findMany` و`count` وحدَهما — والأنواعُ تُستنتج من المندوب نفسِه لا تُكتب.
 */
export interface FindManyDelegate {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  findMany(args?: any): Promise<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  count(args?: any): Promise<number>;
}

/** وسائطُ `findMany` كما يعرّفها المندوب — فيبقى `orderBy: { name: 'asc' }` حرفياً لا `string`. */
export type FindManyArgs<D extends FindManyDelegate> = D extends { findMany(args?: infer A): unknown } ? NonNullable<A> : never;
/** صفُّ `findMany` كما يعيده المندوب بوسائطه الافتراضية. */
export type FindManyRow<D extends FindManyDelegate> = D extends { findMany(...a: never[]): Promise<(infer R)[]> } ? R : never;

/**
 * الصورةُ الشائعة: قائمةٌ من `findMany` بشرطٍ وترتيبٍ وضمائم — بلا `page` تُقرأ كلُّها كما كانت، وبه
 * تُعدّ وتُقطَع **بالشرط نفسِه** (فالعزلُ والفرعُ والبحثُ داخل `where` الممرَّر).
 *
 * ⚠️ **حدُّ النوع**: الصفُّ يُستنتج من `findMany` بوسائطه الافتراضية — **أعمدةُ النموذج وحدَها**، والضمائمُ
 * (`include`) حاضرةٌ في الصفّ **وقتَ التشغيل** لا في نوعه. يكفي حين يُعاد الصفُّ كما هو؛ وحين تقرأ الشيفرةُ
 * ضميمةً (`replacedBy` في الفواتير) يُستعمل `listOrPage` بنداءاتٍ مكتوبةٍ فيُستنتج النوعُ من النداء نفسِه.
 * (قِيس: تمريرُ المندوب لا يُعلِم TypeScript بالوسائط — المعمَّمُ يُستنسَخ بافتراضيّاته.)
 */
export function pagedFindMany<D extends FindManyDelegate>(query: PagedQueryDto | undefined, delegate: D, args: FindManyArgs<D>): Promise<ListResult<FindManyRow<D>>> {
  const { where, orderBy } = args as { where?: unknown; orderBy?: OrderBy };
  return listOrPage<FindManyRow<D>>(query, {
    all: () => delegate.findMany(args),
    count: () => delegate.count({ where }),
    // الترتيبُ التامّ (`ق-٣٥٦`): ما مرّره المستدعي ثم `id` — فلا يتبدّل متعادلان بين صفحتين.
    window: (offset, limit) => delegate.findMany({ ...args, orderBy: [...orderList(orderBy), { id: idDirection(orderBy) }], skip: offset, take: limit }),
  });
}
