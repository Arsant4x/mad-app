import { Prisma } from '@prisma/client';
import { formatMessage, MessageKey, MSG } from '../common/i18n/messages';

/**
 * 🔴 **ما يشير إلى الفرع — مصنَّفاً** (`ق-١٤٣٥`): حذفُ الفرع كان يُفرغه صامتاً — مفاتيحُه `SET NULL` تُخرج ما فيه إلى
 * «المنشأة كلِّها»، وإسنادُ حساب الدخول `CASCADE` يترك الحسابَ بلا فرعٍ **فيرى الفروعَ كلَّها** (`tenant.guard`).
 *
 * - `content` — ما **فيه** ويُنقل منه (صندوقٌ · درجٌ · موظّفٌ · حسابُ دخول): يوقف الحذفَ مسمّىً ويدلّ على النقل؛
 * - `open` — مستندٌ يُغلق: **مفتوحُه** يوقف الحذفَ برقمه، **ومغلقُه تاريخ**؛
 * - `history` — ما وقع فيه: **لا يُنقل** (`ق-١٤١٣` · `ق-١٤١٤` · `ق-١٤١٥`)، فالفرعُ ذو التاريخ لا يُحذف.
 *
 * ⚠️ **والقائمةُ مشتقّةُ الحدّ لا محفوظة**: الحارسُ `branch-references.spec.ts` يقرأ نماذجَ المخطَّط التي تحمل `branchId`
 * ويُسقط الحزمة على نموذجٍ بلا تصنيف — فنموذجٌ جديدٌ في فرعٍ لا يُفرَغ صامتاً لأنه نُسي هنا. **والنوعُ يُلزم قارئاً**
 * لكلِّ `content` و`open` (`READERS`)، **والتاريخُ يُعدّ من التصنيف نفسِه** — فلا قائمةٌ ثانيةٌ تتخلّف عن الأولى.
 */
export const BRANCH_REFERENCES = {
  Bank: 'content',
  CashDrawer: 'content',
  Employee: 'content',
  CompanyUserBranch: 'content',
  Quote: 'open',
  PosShift: 'open',
  InventoryWriteOff: 'open',
  Invoice: 'history',
  Purchase: 'history',
  GoodsReceipt: 'history',
  JournalEntry: 'history',
  JournalLine: 'history',
  StockMovement: 'history',
  Payment: 'history',
  SupplierPayment: 'history',
  BankTransaction: 'history',
  CashDeposit: 'history',
  NetworkSettlement: 'history',
} as const satisfies Partial<Record<Prisma.ModelName, 'content' | 'open' | 'history'>>;

export type BranchReferenceModel = keyof typeof BRANCH_REFERENCES;
type ModelsOf<K extends 'content' | 'open' | 'history'> = { [M in BranchReferenceModel]: (typeof BRANCH_REFERENCES)[M] extends K ? M : never }[BranchReferenceModel];

/** حالُ «المفتوح» لكلِّ مستندٍ يُغلق — وما سواه من صفوفه تاريخ. والنوعُ يُلزم مفتاحاً لكلِّ `open`. */
export const OPEN_WHERE: Record<ModelsOf<'open'>, Record<string, unknown>> = {
  Quote: { status: { in: ['DRAFT', 'SENT'] } },
  PosShift: { status: 'OPEN' },
  InventoryWriteOff: { status: 'PENDING_REVIEW' },
};

/** اسمُ المفوَّض في عميل Prisma — `JournalLine` ⟸ `journalLine`. */
export function delegateOf(model: BranchReferenceModel): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

const NAMES_SHOWN = 10;
/** يُجلب واحدٌ فوق المعروض ليُعرف أن ثمّة مزيداً — بلا عدّ. */
const NAMES_TAKE = NAMES_SHOWN + 1;

/** قائمةُ أسماءٍ تُعرض — عشرةٌ ثم «…» إن زادت، فالرسالةُ تسمّي ولا تُغرق. */
export function nameList(names: readonly string[]): string {
  const shown = names.slice(0, NAMES_SHOWN).join(' · ');
  return names.length > NAMES_SHOWN ? `${shown} · …` : shown;
}

type CountDelegate = { count: (args: { where: Record<string, unknown> }) => Promise<number> };

/**
 * التاريخُ: كلُّ صفٍّ من `history` وكلُّ مغلقٍ من `open` — يُعدّ ولا يُسمّى، فهو لا يُنقل. **يُقرأ من التصنيف نفسِه**
 * (مفوَّضٌ لكلِّ نموذج)، فنموذجُ تاريخٍ جديدٌ يُصنَّف فيُعدّ بلا سطرٍ هنا.
 */
export async function branchHistoryCount(tx: Prisma.TransactionClient, branchId: string): Promise<number> {
  const delegates = tx as unknown as Record<string, CountDelegate>;
  const counts = await Promise.all(
    (Object.keys(BRANCH_REFERENCES) as BranchReferenceModel[])
      .filter((model) => BRANCH_REFERENCES[model] !== 'content')
      .map((model) => {
        const open = BRANCH_REFERENCES[model] === 'open' ? OPEN_WHERE[model as ModelsOf<'open'>] : null;
        return delegates[delegateOf(model)].count({ where: open ? { branchId, NOT: open } : { branchId } });
      }),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

interface Found {
  key: MessageKey;
  param: 'names' | 'numbers' | 'cashiers';
  items: string[];
}
type Reader = (tx: Prisma.TransactionClient, branchId: string) => Promise<Found[]>;

/**
 * **على مستوى المنشأة بحقّها**: القارئُ يسمّي ما في الفرع المحذوف نفسِه ليُرفض حذفُه بأسمائه — والحذفُ فعلُ مالكٍ نطاقُه
 * الكلّ، فلا مرشِّحَ بفروع القارئ هنا. **ومحذوفُ السلّة يُقرأ صراحةً** (`deletedAt` معلَن — امتدادُ العزل يُخفيه افتراضاً)،
 * فصفٌّ في السلّة يشير إلى الفرع لا يُفرَغ من فرعه وهو محذوف.
 */
const READERS: Record<ModelsOf<'content'> | ModelsOf<'open'>, Reader> = {
  Bank: async (tx, branchId) => [
    { key: MSG.branch_delete_cash_boxes, param: 'names', items: (await tx.bank.findMany({ where: { branchId }, select: { name: true }, orderBy: { name: 'asc' }, take: NAMES_TAKE })).map((r) => r.name) },
    {
      key: MSG.branch_delete_trashed,
      param: 'names',
      items: (await tx.bank.findMany({ where: { branchId, deletedAt: { not: null } }, select: { name: true }, orderBy: { name: 'asc' }, take: NAMES_TAKE })).map((r) => r.name),
    },
  ],
  CashDrawer: async (tx, branchId) => [
    { key: MSG.branch_delete_drawers, param: 'names', items: (await tx.cashDrawer.findMany({ where: { branchId }, select: { name: true }, orderBy: { name: 'asc' }, take: NAMES_TAKE })).map((r) => r.name) },
  ],
  Employee: async (tx, branchId) => [
    {
      key: MSG.branch_delete_employees,
      param: 'names',
      items: (await tx.employee.findMany({ where: { branchId }, select: { fullName: true }, orderBy: { fullName: 'asc' }, take: NAMES_TAKE })).map((r) => r.fullName),
    },
    {
      key: MSG.branch_delete_trashed,
      param: 'names',
      items: (await tx.employee.findMany({ where: { branchId, deletedAt: { not: null } }, select: { fullName: true }, orderBy: { fullName: 'asc' }, take: NAMES_TAKE })).map(
        (r) => r.fullName,
      ),
    },
  ],
  CompanyUserBranch: async (tx, branchId) => [
    {
      key: MSG.branch_delete_accounts,
      param: 'names',
      items: (
        await tx.companyUserBranch.findMany({ where: { branchId }, select: { companyUser: { select: { name: true } } }, orderBy: { companyUser: { name: 'asc' } }, take: NAMES_TAKE })
      ).map((r) => r.companyUser.name),
    },
  ],
  Quote: async (tx, branchId) => [
    {
      key: MSG.branch_delete_open_quotes,
      param: 'numbers',
      items: (await tx.quote.findMany({ where: { branchId, ...(OPEN_WHERE.Quote as Prisma.QuoteWhereInput) }, select: { no: true }, orderBy: { no: 'asc' }, take: NAMES_TAKE })).map((r) => r.no),
    },
  ],
  PosShift: async (tx, branchId) => [
    {
      key: MSG.branch_delete_open_shifts,
      param: 'cashiers',
      items: (
        await tx.posShift.findMany({ where: { branchId, ...(OPEN_WHERE.PosShift as Prisma.PosShiftWhereInput) }, select: { openedByName: true }, orderBy: { openedAt: 'asc' }, take: NAMES_TAKE })
      ).map((r) => r.openedByName),
    },
  ],
  InventoryWriteOff: async (tx, branchId) => [
    {
      key: MSG.branch_delete_pending_write_offs,
      param: 'numbers',
      items: (
        await tx.inventoryWriteOff.findMany({ where: { branchId, ...(OPEN_WHERE.InventoryWriteOff as Prisma.InventoryWriteOffWhereInput) }, select: { no: true }, orderBy: { no: 'asc' }, take: NAMES_TAKE })
      ).map((r) => r.no),
    },
  ],
};

/** ترتيبُ الأسباب في الرفض — ما يُنقل أوّلاً، ثم ما في السلّة، ثم ما يُغلق. */
const REASON_ORDER: MessageKey[] = [
  MSG.branch_delete_cash_boxes,
  MSG.branch_delete_drawers,
  MSG.branch_delete_employees,
  MSG.branch_delete_accounts,
  MSG.branch_delete_trashed,
  MSG.branch_delete_open_quotes,
  MSG.branch_delete_open_shifts,
  MSG.branch_delete_pending_write_offs,
];

/** ما في الفرع والمفتوحُ من مستنداته — سببٌ لكلِّ صنفٍ بأسمائه، في رفضٍ واحد. فارغةٌ ⟸ لا ما يوقف الحذف. */
export async function branchContentReasons(tx: Prisma.TransactionClient, branchId: string): Promise<string[]> {
  const found = (await Promise.all(Object.values(READERS).map((read) => read(tx, branchId)))).flat();
  return REASON_ORDER.flatMap((key) => {
    const hits = found.filter((f) => f.key === key);
    const items = hits.flatMap((f) => f.items);
    return items.length ? [formatMessage(key, { [hits[0].param]: nameList(items) })] : [];
  });
}
