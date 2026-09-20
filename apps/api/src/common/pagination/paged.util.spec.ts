import { BadRequestException } from '@nestjs/common';
import { MSG } from '../i18n/messages';
import { DEFAULT_PAGE_SIZE } from '../dto/paged-query.dto';
import { listOrPage, matchesSearch, pageArray, pagedFindMany, pageWindow, searchTerm, searchWhere, type Paged } from './paged.util';

/**
 * **الترقيمُ بالاختيار — الآليةُ وحدَها بلا قاعدة** (`ق-١٢٣٦`): بلا `page` مصفوفةٌ كما كانت؛ به مغلَّفٌ
 * بنافذةٍ صحيحة؛ و`pageSize` بلا `page` يُردّ `400` مسمّىً لا يُتجاهَل؛ والبحثُ على حقولٍ مُعلَنة لا غير.
 */
describe('pageWindow — النافذةُ من الاستعلام', () => {
  it('بلا page لا نافذة؛ وبه نافذةٌ بافتراض 25 وسقفٍ يفرضه الـDTO', () => {
    expect(pageWindow(undefined)).toBeNull();
    expect(pageWindow({})).toBeNull();
    expect(pageWindow({ page: 1 })).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, offset: 0, limit: DEFAULT_PAGE_SIZE });
    expect(pageWindow({ page: 3, pageSize: 10 })).toEqual({ page: 3, pageSize: 10, offset: 20, limit: 10 });
  });

  it('⛔ pageSize بلا page: 400 مسمّىً — لا تجاهلَ صامت', () => {
    expect(() => pageWindow({ pageSize: 5 })).toThrow(BadRequestException);
    try {
      pageWindow({ pageSize: 5 });
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as { message?: string };
      expect(body.message).toBe(MSG.page_size_without_page);
    }
  });
});

describe('البحث — حقولٌ مُعلَنة', () => {
  it('searchTerm يقصّ ويعيد undefined للفراغ', () => {
    expect(searchTerm(undefined)).toBeUndefined();
    expect(searchTerm({ search: '   ' })).toBeUndefined();
    expect(searchTerm({ search: ' أحمد ' })).toBe('أحمد');
  });

  it('searchWhere: OR على الحقول المُعلَنة بلا حساسيةٍ للحالة — وundefined بلا بحثٍ أو بلا حقول', () => {
    expect(searchWhere(undefined, ['name'])).toBeUndefined();
    expect(searchWhere('x', [])).toBeUndefined();
    expect(searchWhere('Ab', ['name', 'phone'])).toEqual({ OR: [{ name: { contains: 'Ab', mode: 'insensitive' } }, { phone: { contains: 'Ab', mode: 'insensitive' } }] });
  });

  it('matchesSearch: نصّاً بلا حساسيةٍ للحالة، والأرقامُ نصّاً، وnull لا يُطابَق', () => {
    const row = { name: 'Ahmed', code: 1200, phone: null };
    expect(matchesSearch(row, ['name'], 'ahm')).toBe(true);
    expect(matchesSearch(row, ['code'], '120')).toBe(true);
    expect(matchesSearch(row, ['phone'], 'x')).toBe(false);
    expect(matchesSearch(row, ['name'], 'zzz')).toBe(false);
  });
});

describe('pageArray — القوائمُ المحسوبة', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `صنف ${i + 1}` }));

  it('بلا page: المصفوفةُ كلُّها (مرشَّحةً إن كان بحث)', () => {
    expect(pageArray(undefined, rows)).toEqual(rows);
    expect(pageArray({ search: 'صنف 7' }, rows, ['name'])).toEqual([rows[6]]);
  });

  it('مع page: نافذةٌ ومجموعٌ بعد الترشيح', () => {
    const paged = pageArray({ page: 2, pageSize: 3 }, rows) as Paged<{ id: number; name: string }>;
    expect(paged).toEqual({ items: rows.slice(3, 6), total: 7, page: 2, pageSize: 3 });
    const searched = pageArray({ page: 1, pageSize: 2, search: 'صنف 1' }, rows, ['name']) as Paged<{ id: number; name: string }>;
    expect(searched.total).toBe(1);
    expect(searched.items).toEqual([rows[0]]);
  });
});

describe('listOrPage و pagedFindMany — على مندوبٍ مصطنع', () => {
  const data = Array.from({ length: 5 }, (_, i) => ({ id: `r${i + 1}`, name: `n${i + 1}` }));
  const calls: string[] = [];
  type Order = { name?: 'asc' | 'desc'; id?: 'asc' | 'desc' };
  const orders: (Order | Order[] | undefined)[] = [];
  const delegate = {
    async findMany(args?: { where?: { name?: string }; orderBy?: Order | Order[]; skip?: number; take?: number }) {
      calls.push(`findMany skip=${args?.skip ?? '-'} take=${args?.take ?? '-'}`);
      orders.push(args?.orderBy);
      const filtered = args?.where?.name ? data.filter((d) => d.name === args.where!.name) : data;
      return filtered.slice(args?.skip ?? 0, (args?.skip ?? 0) + (args?.take ?? filtered.length));
    },
    async count(args?: { where?: { name?: string } }) {
      calls.push('count');
      return args?.where?.name ? data.filter((d) => d.name === args.where!.name).length : data.length;
    },
  };

  beforeEach(() => {
    calls.splice(0);
    orders.splice(0);
  });

  it('بلا page: قراءةٌ واحدة بلا skip/take — والشكلُ مصفوفة والترتيبُ كما مرّره المستدعي', async () => {
    const out = await pagedFindMany(undefined, delegate, { where: {}, orderBy: { name: 'asc' } });
    expect(Array.isArray(out)).toBe(true);
    expect((out as unknown[]).length).toBe(5);
    expect(calls).toEqual(['findMany skip=- take=-']);
    expect(orders).toEqual([{ name: 'asc' }]);
  });

  it('مع page: عدٌّ ونافذةٌ بالشرط نفسِه — والشكلُ مغلَّف، والترتيبُ مختومٌ بـid (ق-٣٥٦)', async () => {
    const out = (await pagedFindMany({ page: 2, pageSize: 2 }, delegate, { where: {}, orderBy: { name: 'asc' } })) as Paged<{ id: string; name: string }>;
    expect(out).toEqual({ items: [data[2], data[3]], total: 5, page: 2, pageSize: 2 });
    expect(calls.sort()).toEqual(['count', 'findMany skip=2 take=2']);
    expect(orders).toEqual([[{ name: 'asc' }, { id: 'asc' }]]);
  });

  it('الختمُ بـid لا يتكرّر ولا يُفقَد: ترتيبٌ ينتهي بـid يبقى باتجاهه، وقائمةٌ تُختم، وبلا ترتيبٍ يُرتَّب بـid وحدَه', async () => {
    await pagedFindMany({ page: 1, pageSize: 2 }, delegate, { orderBy: [{ name: 'desc' }, { id: 'desc' }] });
    await pagedFindMany({ page: 1, pageSize: 2 }, delegate, { orderBy: [{ name: 'desc' }] });
    await pagedFindMany({ page: 1, pageSize: 2 }, delegate, {});
    expect(orders).toEqual([
      [{ name: 'desc' }, { id: 'desc' }],
      [{ name: 'desc' }, { id: 'asc' }],
      [{ id: 'asc' }],
    ]);
  });

  it('الشرطُ يسري على العدّ والنافذة معاً — فلا مجموعَ أوسع من الصفوف', async () => {
    const out = (await pagedFindMany({ page: 1, pageSize: 10 }, delegate, { where: { name: 'n3' } })) as Paged<{ id: string; name: string }>;
    expect(out.total).toBe(1);
    expect(out.items).toEqual([data[2]]);
  });

  it('listOrPage: pageSize بلا page يُردّ قبل أيّ قراءة', async () => {
    await expect(listOrPage({ pageSize: 3 }, { all: delegate.findMany, count: delegate.count, window: (offset, limit) => delegate.findMany({ skip: offset, take: limit }) })).rejects.toBeInstanceOf(BadRequestException);
    expect(calls).toEqual([]);
  });
});
