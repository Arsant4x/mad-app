import { Grant } from './permission-tree';

/**
 * السجل الشجري للتفويض — **يُلحَق ولا يُعدَّل ولا يُحذف منه**.
 *
 * ## المتطلبات المُلزِمة ومصدرها
 *
 * الملحق (1) من قرار ZATCA، `Tampering of e-invoices … or logs`:
 *   • `Allows for log modification/deletion` ⇒ **لا حذف ولا تعديل**.
 *   • `Non-sequential log generation` ⇒ **تسلسل بلا فجوات**.
 *   • `Generated with inaccurate timestamps` + محظور `Time change` ⇒
 *     **الزمن من الخادم**، ولا يُقبل من العميل بحال.
 *
 * ## فالسحب يُختم ولا يُمحى
 *
 * سحبُ تفويضٍ **حدثٌ يُضاف** (`REVOKE`) لا صفٌّ يُحذف. وحذفه يجعل السحب
 * نفسه «تعديلاً بلا أثر» — أي أنه يخالف البند الذي وُضع لأجله.
 */

export type DelegationEvent = 'GRANT' | 'REVOKE';

export interface DelegationLogEntry {
  /** تسلسل داخل المنشأة، يبدأ من 1 بلا فجوات. */
  seq: number;
  companyId: string;
  event: DelegationEvent;
  grantorId: string;
  granteeId: string;
  /** عقدة الشجرة المفوَّضة (`realestate` · `contracts` · `root`). */
  nodeKey: string;
  grants: readonly Grant[];
  /** ⚠️ من الخادم دائماً — انظر `append`. */
  at: Date;
}

/** ما يقدّمه المستدعي. لاحظ: **لا `seq` ولا `at`** — يفرضهما السجل. */
export interface DelegationLogInput {
  companyId: string;
  event: DelegationEvent;
  grantorId: string;
  granteeId: string;
  nodeKey: string;
  grants: readonly Grant[];
}

/**
 * مصدر الزمن — يُحقن في الاختبار وحده.
 *
 * ⚠️ **ليس معاملاً في `DelegationLogInput` عمداً.** لو كان الزمن حقلاً في
 * المدخلات لأمكن للعميل إرساله، ولصار الاعتماد على «تجاهله» سلوكاً يمكن
 * نسيانه. وإخراجه من الشكل يجعل إرساله **مستحيلاً بالأنواع** لا مرفوضاً
 * وقت التشغيل — والمنع البنيوي أقوى من الفحص.
 */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

/**
 * يُلحق قيداً بالسجل.
 *
 * @param previous آخر قيد في المنشأة (`null` لأول قيد).
 *
 * لا تُصدَّر من هذه الوحدة أي دالة حذف أو تعديل — **وهو جزء من العقد لا
 * سهو**: وجودها يفتح مساراً يخالف `Allows for log modification/deletion`.
 */
export function append(
  input: DelegationLogInput,
  previous: DelegationLogEntry | null,
  clock: Clock = systemClock,
): DelegationLogEntry {
  if (previous && previous.companyId !== input.companyId) {
    throw new Error('التسلسل يخصّ منشأةً واحدة — لا يُخلط بين المنشآت');
  }
  return {
    seq: (previous?.seq ?? 0) + 1,
    companyId: input.companyId,
    event: input.event,
    grantorId: input.grantorId,
    granteeId: input.granteeId,
    nodeKey: input.nodeKey,
    grants: [...input.grants],
    // ⚠️ الزمن هنا وحده. أي زمنٍ يصل من الخارج لا سبيل له إلى هذا الحقل.
    at: clock(),
  };
}

/**
 * يفحص سلامة التسلسل — **يكتشف الفجوة، لا يؤكّد أن الترقيم يعمل**.
 *
 * الفرق جوهري: اختبارٌ يُنشئ ثلاثة قيود ويؤكّد `1,2,3` يثبت أن `append`
 * يعدّ — ولا يثبت أن **فجوةً ستُكتشف**. وهذه الدالة هي ما يُفحص بحقن قفزة.
 */
export function findSequenceBreak(entries: readonly DelegationLogEntry[]): { at: number; expected: number } | null {
  for (let i = 0; i < entries.length; i++) {
    const expected = i + 1;
    if (entries[i].seq !== expected) return { at: entries[i].seq, expected };
  }
  return null;
}

/** السجل الشجري كما يراه المالك: من فوّض من، بماذا، ومتى. */
export interface LogNode {
  granteeId: string;
  entries: DelegationLogEntry[];
  children: LogNode[];
}

/** يبني الشجرة من القيود — والمسحوب يبقى ظاهراً مختوماً لا محذوفاً. */
export function buildLogTree(entries: readonly DelegationLogEntry[], rootId: string): LogNode {
  const byGrantor = new Map<string, DelegationLogEntry[]>();
  for (const e of entries) {
    const list = byGrantor.get(e.grantorId) ?? [];
    list.push(e);
    byGrantor.set(e.grantorId, list);
  }

  const visit = (id: string, seen: ReadonlySet<string>): LogNode => {
    const own = (byGrantor.get(id) ?? []).slice().sort((a, b) => a.seq - b.seq);
    const nextSeen = new Set(seen).add(id);
    const children: LogNode[] = [];
    for (const granteeId of new Set(own.map((e) => e.granteeId))) {
      // حمايةٌ من الدورات عند البناء أيضاً — لا اعتماد على المنع وحده.
      if (nextSeen.has(granteeId)) continue;
      children.push(visit(granteeId, nextSeen));
    }
    return { granteeId: id, entries: own, children };
  };

  return visit(rootId, new Set());
}
