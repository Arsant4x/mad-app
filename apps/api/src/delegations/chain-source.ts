import { Grant } from './permission-tree';
import { DelegationLink } from './intersection';

/**
 * بناء سلاسل التفويض من الصفوف الخام — **طيٌّ لا جدول حالة**.
 *
 * ## لا مكان تُخزَّن فيه، بنيةً لا انضباطاً
 *
 * لا يوجد جدول `delegations` في هذا المشروع: الصفّ في `delegation_logs` **هو**
 * التفويض، وحالته `ACTIVE ⇒ SEALED ⇒ REVOKED` بمُشغِّلٍ يمنع كل تعديلٍ آخر.
 * فشرط «تُحسب حيّاً لا تُخزَّن» ليس التزاماً نتذكّره — **لا يوجد حقلٌ يُخزَّن
 * فيه أصلاً**. والقاعدة التي يستحيل خرقها أقوى من القاعدة التي تُراجَع.
 *
 * ## ولماذا سلاسل بالجمع لا سلسلة واحدة
 *
 * قرأتُ المخطط: لا قيد فرادةٍ على `granteeId`. فموظفٌ واحد قد يُفوَّض من
 * مديرين اثنين — والبنية **رسمٌ موجَّه لا سلسلة**. وأخذُ «المفوِّض الأول»
 * اختصارٌ يُسقط صلاحياتٍ ممنوحةً فعلاً، **بلا رسالة**: الموظف يُمنع مما
 * فُوّض له، ولا شيء في السجل يقول لماذا.
 *
 * فالحساب يمرّ على **كل مسارٍ** من الجذر إلى الفاعل، والنافذ اتحادُ ما
 * تعطيه المسارات. والاتحاد لا التقاطع: مسارٌ يعطي صلاحيةً يكفي — تماماً كما
 * لو فوّضه مديرٌ واحد بها.
 *
 * ⚠️ والتقاطع يبقى **داخل** كل مسار: المسار الواحد لا يمنح ما لا يملكه أعلاه.
 */

/** صفّ خام كما يخرج من `delegation_logs`. */
export interface DelegationRow {
  grantorId: string;
  granteeId: string;
  grants: readonly string[];
  /** `ACTIVE` وحدها نافذة — انظر `isLive`. */
  state: string;
}

/**
 * ⚠️ `ACTIVE` وحدها. و`SEALED` **ليست نافذة**: هي منتصف السحب
 * (`ACTIVE ⇒ SEALED ⇒ REVOKED`)، وعدُّها نافذةً يترك نافذةً زمنية — ولو
 * أجزاء ثانية — يسري فيها تفويضٌ يجري سحبه. والاتجاه الآمن هو الإطفاء
 * المبكّر لا الإبقاء المتأخر.
 */
const isLive = (r: DelegationRow): boolean => r.state === 'ACTIVE';

/**
 * حدٌّ على عدد المسارات المُعدَّدة.
 *
 * ⚠️ **يُرمى عنده ولا يُقتطع صامتاً.** الاقتطاع يُنتج مجموعةَ صلاحياتٍ
 * ناقصة تبدو كاملة — وهي أخطر من الرفض: الرفض يُقرأ، والنقص يُطاع.
 * ومنع الدورات (`cycles.ts`) يجعل بلوغه شبه مستحيل، فبلوغه إشارةُ عطبٍ
 * في البيانات لا حملٌ طبيعي.
 */
export const MAX_PATHS = 64;

/**
 * يبني كل مسارات التفويض المنتهية عند `actorId`، **من الجذر إلى الورقة**.
 *
 * @param rows كل صفوف المنشأة (النافذة والمسحوبة معاً — السحب يُعرَض).
 * @returns مصفوفة مسارات؛ فارغةٌ إن لم يُفوَّض الفاعل أصلاً (وهي الحالة
 *   الشائعة: الصلاحيات حينئذٍ من القالب وحده).
 */
export function chainsFor(rows: readonly DelegationRow[], actorId: string): DelegationLink[][] {
  // الحافة = (مفوِّض ⇒ مفوَّض إليه). وصفوفٌ عدّة على نفس الحافة تُجمَع:
  // تفويضان على نطاقين مختلفين حافةٌ واحدة بمنحتين، لا حافتان.
  const byGrantee = new Map<string, Map<string, DelegationRow[]>>();
  for (const r of rows) {
    let grantors = byGrantee.get(r.granteeId);
    if (!grantors) byGrantee.set(r.granteeId, (grantors = new Map()));
    const list = grantors.get(r.grantorId);
    if (list) list.push(r);
    else grantors.set(r.grantorId, [r]);
  }

  const paths: DelegationLink[][] = [];

  /**
   * يمشي من الورقة صعوداً. `seen` يحمي من دورةٍ في البيانات: `cycles.ts`
   * يمنع خلقها، لكن حارساً يعتمد على حارسٍ آخر ليس حارساً — وثمن الخطأ هنا
   * تعليقُ الطلب بلا رسالة.
   */
  const walk = (node: string, below: DelegationLink[], seen: ReadonlySet<string>): void => {
    if (paths.length >= MAX_PATHS) {
      throw new Error(`مسارات التفويض تجاوزت ${MAX_PATHS} — بيانات غير متوقّعة، والحساب يتوقّف ولا يقتطع`);
    }
    const grantors = byGrantee.get(node);
    if (!grantors || grantors.size === 0) {
      // بلغنا الجذر: عقدةٌ لم يُفوَّض إليها أحد. المسار جاهزٌ بترتيبه الصحيح
      // (الجذر أولاً) لأن `below` بُني بالإضافة من الأمام.
      if (below.length) paths.push(below);
      return;
    }
    for (const [grantorId, rs] of grantors) {
      if (seen.has(grantorId)) continue;
      const live = rs.filter(isLive);
      const granted = new Set<Grant>();
      for (const r of live) for (const g of r.grants) granted.add(g as Grant);
      const link: DelegationLink = {
        grantorId,
        granteeId: node,
        granted,
        // الحافة مسحوبة حين **لا يبقى** صفٌّ نافذ عليها. وسحبُ أحد صفّين
        // يضيّق المنحة ولا يقطع السلسلة — وهو فرقٌ يظهر في سبب الانطفاء.
        revoked: live.length === 0,
      };
      walk(grantorId, [link, ...below], new Set([...seen, grantorId]));
    }
  };

  walk(actorId, [], new Set([actorId]));
  return paths;
}

/** الحواف النافذة — مُدخَل `wouldCreateCycle`. */
export function liveEdges(rows: readonly DelegationRow[]): { grantorId: string; granteeId: string }[] {
  return rows.filter(isLive).map((r) => ({ grantorId: r.grantorId, granteeId: r.granteeId }));
}
